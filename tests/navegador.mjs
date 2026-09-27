/* Infra de navegador para os testes de ponta a ponta e os prints:
   serve a pasta do app, troca o Firebase real pelo simulado e abre o
   Chromium já instalado no ambiente. */
import { chromium } from "/opt/node22/lib/node_modules/playwright/index.mjs";
import { spawn } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const RAIZ=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"..");
const STUB=f=>readFileSync(path.join(RAIZ,"tests/stub-firebase",f),"utf8");
export const PORTA=8130;
let servidor=null, navegador=null;
export async function iniciar(){
  servidor=spawn("python3",["-m","http.server",String(PORTA),"--bind","127.0.0.1"],{cwd:RAIZ,stdio:"ignore"});
  await new Promise(r=>setTimeout(r,700));
  navegador=await chromium.launch({executablePath:"/opt/pw-browsers/chromium-1194/chrome-linux/chrome",args:["--lang=pt-BR"],env:{...process.env,LANG:"pt_BR.UTF-8",LANGUAGE:"pt_BR:pt"}});
  return navegador;
}
export async function encerrar(){ await navegador?.close(); servidor?.kill(); }
/* abre o app com um usuário logado e, opcionalmente, o JSON do 2.2 */
export async function abrir({largura=1366,altura=900,legado=null,fs=null,usuario={uid:"u1",email:"voce@exemplo.com"},hoje=null,tema="escuro",globais={},userAgent=null}={}){
  const ctx=await navegador.newContext({viewport:{width:largura,height:altura},deviceScaleFactor:2,locale:"pt-BR",timezoneId:"America/Sao_Paulo",...(userAgent?{userAgent}:{})});
  const p=await ctx.newPage();
  const erros=[];
  p.on("pageerror",e=>erros.push(String(e.message||e)));
  p.on("console",m=>{ if(m.type()==="error") erros.push(m.text()); });
  for(const f of ["firebase-app.js","firebase-auth.js","firebase-firestore.js"])
    await p.route("**/firebasejs/**/"+f,r=>r.fulfill({contentType:"text/javascript",body:STUB(f)}));
  await p.route("https://fonts.googleapis.com/**",r=>r.fulfill({contentType:"text/css",body:""}));
  const seed={};
  if(legado) seed["users/"+usuario.uid]={data:JSON.stringify(legado)};
  if(fs) Object.assign(seed,fs);
  await p.addInitScript(({seed,usuario,hoje,tema,globais})=>{
    window.__seedFs=seed; window.__usuario=usuario; Object.assign(window,globais);
    if(tema) try{ localStorage.setItem("wigo3.tema",tema); }catch{}
    if(hoje){ const alvo=new Date(hoje).getTime(), real=Date.now(), D=Date;
      window.Date=class extends D{ constructor(...a){ super(...(a.length?a:[alvo+(D.now()-real)])); } static now(){ return alvo+(D.now()-real); } }; }
  },{seed,usuario,hoje,tema,globais});
  await p.goto("http://127.0.0.1:"+PORTA+"/index.html");
  return {p,ctx,erros};
}
