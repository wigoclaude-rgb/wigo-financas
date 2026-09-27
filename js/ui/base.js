/* ══════════ NÚCLEO DA INTERFACE ══════════
   Estado da tela, rotas, painel, avisos e o executor de comandos.

   Rotas com # (#/pagar, #/faturas/ID/2026-10): trocar de tela entra no
   histórico e o botão voltar funciona — no 2.2 as abas eram estado e o
   voltar saía do app.

   Tudo é delegação: um clique procura o [data-a] mais próximo e chama a ação
   registrada com aquele nome. Tela nova = registrar ações novas. */

import { h, raw } from "./html.js";
import { ic } from "./icones.js";
import { ErroFinanceiro } from "../financas/modelo.js";

export const app={ L:null, repo:null, usuario:null, rota:{nome:"visao",params:[]}, f:{}, sel:{}, painelAberto:null, telas:{} };
const ACOES={}, FORMS={}, INPUTS={}, CHANGES={};
export const acao=(n,fn)=>{ ACOES[n]=fn; };
export const form=(n,fn)=>{ FORMS[n]=fn; };
export const aoDigitar=(n,fn)=>{ INPUTS[n]=fn; };
export const aoMudar=(n,fn)=>{ CHANGES[n]=fn; };
export function tela(nome,def){ app.telas[nome]=def; }
/* filtro de uma tela, com valores padrão na primeira vez */
const padroes={};
export function filtro(nome,padrao){ padroes[nome]=padrao; if(!app.f[nome]) app.f[nome]={...padrao}; return app.f[nome]; }

/* No celular, sete filtros empilhados empurravam a lista para fora da tela.
   Fica só a busca e um botão "Filtros" que diz quantos fogem do padrão —
   filtro escondido e ativo sem aviso faria parecer que sumiu lançamento.
   Aberto/fechado é lembrado por tela, porque cada filtro redesenha tudo. */
const filtrosAbertos=new Set();
function montarFiltros(raiz){
  raiz.querySelectorAll(".filtros").forEach((f,i)=>{
    const chave=app.rota.nome+":"+i, nome=f.querySelector("[data-tela]")?.dataset.tela;
    const val=app.f[nome]||{}, pad=padroes[nome]||{};
    const ativos=Object.keys(pad).filter(k=>!["q","de","ate"].includes(k)&&(val[k]??"")!==(pad[k]??"")).length;
    const b=document.createElement("button");
    b.type="button"; b.className="btn sec peq filtros-bt"; b.dataset.a="filtros-abrir"; b.dataset.v=chave;
    b.setAttribute("aria-expanded",String(filtrosAbertos.has(chave)));
    b.innerHTML=ic("filter")+" Filtros"+(ativos?' <span class="chip info">'+ativos+"</span>":"");
    f.classList.toggle("abertos",filtrosAbertos.has(chave));
    const busca=f.querySelector(".busca,input[type=search]");
    busca?busca.after(b):f.prepend(b);
  });
}
export function selecao(nome){ if(!app.sel[nome]) app.sel[nome]=new Set(); return app.sel[nome]; }

/* ── rotas ── */
export function ir(nome,...params){ const alvo="#/"+[nome,...params].map(encodeURIComponent).join("/");
  if(location.hash===alvo) render(); else location.hash=alvo; }
export function lerRota(){
  const p=(location.hash||"#/visao").replace(/^#\/?/,"").split("/").filter(Boolean).map(decodeURIComponent);
  const nome=p[0]&&app.telas[p[0]]?p[0]:"visao";
  app.rota={nome,params:p.slice(1)};
  return app.rota;
}

/* ── desenho ── */
let desenhando=false;
export function render(){
  if(!app.L||desenhando) return;
  desenhando=true;
  try{
    const t=app.telas[app.rota.nome];
    const alvo=document.getElementById("conteudo");
    const titulo=typeof t.titulo==="function"?t.titulo(app):t.titulo;
    document.getElementById("tituloTela").textContent=titulo;
    document.getElementById("migalha").textContent=t.grupo||"";
    document.title=titulo+" · WIGO";
    alvo.innerHTML=String(t.render(app));
    montarFiltros(alvo);
    const chave=typeof t.nav==="function"?t.nav(app):(t.nav||app.rota.nome);
    document.querySelectorAll("[data-nav]").forEach(b=>b.classList.toggle("on",b.dataset.nav===chave));
    app.aoRender&&app.aoRender();
    t.depois&&t.depois(app);
    atualizarBarraSelecao();
  }catch(e){
    console.error(e);
    document.getElementById("conteudo").innerHTML=String(h`<div class="card"><div class="vazio"><div class="bola down">${raw(ic("alert"))}</div>
      <div class="t">Esta tela não abriu</div>${e.message}<div class="btns"><button class="btn sec" data-a="ir" data-v="visao">Voltar à visão geral</button></div></div></div>`);
  }finally{ desenhando=false; }
}
/* redesenha só um pedaço marcado com data-parte (a busca não perde o foco) */
export function renderParte(nome,html){ const el=document.querySelector('[data-parte="'+nome+'"]'); if(el) el.innerHTML=String(html); atualizarBarraSelecao(); }

/* ── barra de seleção: quem define é a tela atual ── */
export function atualizarBarraSelecao(){
  const t=app.telas[app.rota.nome], el=document.getElementById("barraSel");
  const conteudo=t&&t.barraSelecao?t.barraSelecao(app):null;
  el.hidden=!conteudo; if(conteudo) el.innerHTML=String(conteudo);
}

/* ── aviso rápido ── */
let tAviso;
export function toast(msg,{erro=false}={}){
  const t=document.getElementById("toast");
  t.textContent=msg; t.classList.toggle("erro",!!erro); t.classList.add("on");
  clearTimeout(tAviso); tAviso=setTimeout(()=>t.classList.remove("on"),erro?6500:2800);
}

/* ── painel lateral (documento, formulários) ── */
export function abrirPainel({titulo,sub="",corpo,rodape="",estreito=false,id=null,topo=""}){
  const p=document.getElementById("painel");
  p.classList.toggle("estreito",estreito);
  p.innerHTML=String(h`<div class="painel-cab"><div class="tt">${topo}<h2 class="t2">${titulo}</h2>${sub?h`<div class="fraco peq">${sub}</div>`:""}</div>
    <button class="btn fant icone" data-a="painel-fechar" aria-label="Fechar">${raw(ic("x"))}</button></div>
    <div class="painel-corpo">${corpo}</div>${rodape?h`<div class="painel-rodape">${rodape}</div>`:""}`);
  p.classList.add("on"); document.getElementById("veu").classList.add("on");
  app.painelAberto=id;
  const f=p.querySelector("input:not([type=hidden]):not([readonly]),select,textarea");
  if(f&&window.matchMedia("(min-width:1024px)").matches) setTimeout(()=>f.focus(),60);
}
export function fecharPainel(){
  document.getElementById("painel").classList.remove("on"); document.getElementById("veu").classList.remove("on");
  app.painelAberto=null;
}

/* ── executar um comando financeiro ──
   Erro de regra (ErroFinanceiro) vem antes de qualquer gravação: a tela
   mostra e nada muda. Erro do servidor é desfeito pelo repositório. */
export async function executar(fn,{ok,fechar=true,depois}={}){
  let m;
  try{ m=fn(); }
  catch(e){ if(e instanceof ErroFinanceiro){ toast(e.message,{erro:true}); return false; } console.error(e); toast("Erro: "+e.message,{erro:true}); return false; }
  if(!m||m.vazia){ if(fechar) fecharPainel(); render(); return true; }
  try{ await app.repo.gravar(m); }
  catch(e){ console.error(e); toast(e.message.includes("Nenhuma alteração")?e.message:("Não foi possível gravar. "+e.message),{erro:true}); render(); return false; }
  if(fechar) fecharPainel();
  render();
  if(ok) toast(ok);
  if(depois) depois(m);
  return true;
}

/* ── delegação de eventos ── */
export function ligarEventos(){
  document.addEventListener("click",e=>{
    const el=e.target.closest("[data-a]"); if(!el) return;
    const fn=ACOES[el.dataset.a]; if(!fn) return;
    e.preventDefault(); fn(el,e);
  });
  document.addEventListener("submit",e=>{
    const f=e.target; const fn=FORMS[f.dataset.f]; if(!fn) return;
    e.preventDefault(); fn(f,new FormData(f));
  });
  document.addEventListener("input",e=>{ const n=e.target.dataset.i; if(n&&INPUTS[n]) INPUTS[n](e.target,e); });
  document.addEventListener("change",e=>{ const n=e.target.dataset.c; if(n&&CHANGES[n]) CHANGES[n](e.target,e); });
  window.addEventListener("hashchange",()=>{ fecharPainel(); lerRota(); window.scrollTo(0,0); render(); });
  document.addEventListener("keydown",e=>{
    if(e.key==="Escape"){ if(document.querySelector(".paleta.on")) ACOES["busca-fechar"]?.(); else if(app.painelAberto!==undefined) fecharPainel(); }
    if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==="k"){ e.preventDefault(); ACOES["busca-abrir"]?.(); }
  });
}
acao("painel-fechar",()=>fecharPainel());
acao("filtros-abrir",el=>{ const k=el.dataset.v; filtrosAbertos.has(k)?filtrosAbertos.delete(k):filtrosAbertos.add(k);
  el.closest(".filtros").classList.toggle("abertos",filtrosAbertos.has(k)); el.setAttribute("aria-expanded",String(filtrosAbertos.has(k))); });
/* período de qualquer tela: data-tela diz de quem é o filtro */
aoMudar("periodo",el=>{ const f=app.f[el.dataset.tela]; f.periodo=el.value; render(); });
aoMudar("periodo-de",el=>{ app.f[el.dataset.tela].de=el.value; render(); });
aoMudar("periodo-ate",el=>{ app.f[el.dataset.tela].ate=el.value; render(); });
acao("ir",el=>ir(el.dataset.v,...(el.dataset.p?el.dataset.p.split("|"):[])));
