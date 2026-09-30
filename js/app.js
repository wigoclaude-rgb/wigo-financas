/* ══════════ WIGO 3 — ENTRADA ══════════
   Login → carregar (e migrar o 2.2, se for a primeira vez) → desenhar.
   As telas se registram sozinhas ao serem importadas. */
import { auth, onAuthStateChanged, signInWithEmailAndPassword, createUserWithEmailAndPassword,
  sendPasswordResetEmail, signOut, GoogleAuthProvider, signInWithPopup, linkWithPopup, linkWithCredential } from "./dados/firebase.js";
import { Livro } from "./financas/livro.js";
import { Repositorio } from "./dados/repositorio.js";
import { gerarPendentes } from "./financas/recorrencias.js";
import { buscar } from "./financas/busca.js";
import { faixas } from "./financas/relatorios.js";
import { app, render, lerRota, ligarEventos, acao, form, aoDigitar, toast, ir, fecharPainel, abrirPainel } from "./ui/base.js";
import { h, raw, juntar } from "./ui/html.js";
import { I, R, ligarDicas } from "./ui/componentes.js";
import "./ui/telas/visao.js";
import "./ui/telas/movimentos.js";
import "./ui/telas/obrigacoes.js";
import "./ui/telas/faturas.js";
import "./ui/telas/pagamentos.js";
import "./ui/telas/transferencias.js";
import "./ui/telas/reconciliacao.js";
import "./ui/telas/cadastros.js";
import "./ui/telas/relatorios.js";
import "./ui/telas/importacao.js";
import "./ui/telas/ajustes.js";
import "./ui/telas/investimentos.js";
import "./ui/documento.js";
import "./ui/formularios.js";
import { aplicarTema } from "./ui/tema.js";

const NAV=[
  {itens:[["visao","Visão geral","home"],["movimentos","Movimentações","flow"],["investimentos","Poupança","piggy"]]},
  {g:"Documentos",itens:[["pagar","Contas a pagar","outflow"],["receber","Contas a receber","inflow"],["faturas","Faturas","card"]]},
  {g:"Financeiro",itens:[["pagamentos","Pagamentos","check"],["recebimentos","Recebimentos","coin"],["transferencias","Transferências","swap"],["reconciliacao","Reconciliação","scale"]]},
  {g:"Cadastros",itens:[["parceiros","Parceiros de negócio","handshake"],["contas","Contas","bank"],["cartoes","Cartões","card","cartoes"],["categorias","Categorias","layers"]]},
  {g:"Relatórios",itens:[["relatorios","Todos os relatórios","chart"],["relatorios/razao","Razão","ledger"],["relatorios/fluxo","Fluxo de caixa","trendUp"]]},
  {itens:[["importacao","Importação","import"]]}
];
const navLink=(chave,rot,icone,badge)=>{ const [nome,...p]=chave.split("/");
  return h`<button class="nav-i" data-nav="${chave}" data-a="ir" data-v="${nome}" data-p="${p.join("|")}">${I(icone)}<span>${rot}</span>${badge?h`<span class="n">${badge}</span>`:""}</button>`; };
function navHtml(){
  const venc=app.L?faixas(app.L,"PAGAR").nVencido:0;
  return juntar(NAV,gr=>h`<div class="nav-g">${gr.g?h`<div class="cap">${gr.g}</div>`:""}${juntar(gr.itens,([k,r,i])=>navLink(k,r,i,k==="pagar"&&venc?venc:0))}</div>`);
}

function shell(){
  document.getElementById("raiz").innerHTML=String(h`
  <aside class="lado">
    <div class="topo"><div class="marca">WIG<b>O</b></div><div class="fraco peq">Finanças</div></div>
    <button class="btn novo" data-a="novo-menu">${I("plus")} Novo</button>
    <nav id="nav">${navHtml()}</nav>
    <div class="base">
      <button class="nav-i" data-nav="ajustes" data-a="ir" data-v="ajustes">${I("gear")}<span>Ajustes</span></button>
    </div>
  </aside>
  <div class="principal">
    <header class="barra-topo">
      <button class="btn fant icone so-cel" data-a="menu-cel" aria-label="Menu">${I("menu")}</button>
      <div class="titulo"><span class="migalha" id="migalha"></span><h1 class="t2" id="tituloTela"></h1></div>
      <button class="buscar-btn" data-a="busca-abrir" aria-label="Buscar">${I("search")}<span>Buscar documento, parceiro, valor…</span><kbd>Ctrl K</kbd></button>
      <span class="sync" id="sync" title="Sincronizado"></span>
    </header>
    <main class="conteudo" id="conteudo"></main>
  </div>
  <nav class="dock" aria-label="Navegação">
    <button data-nav="visao" data-a="ir" data-v="visao">${I("home")}Visão</button>
    <button data-nav="movimentos" data-a="ir" data-v="movimentos">${I("flow")}Movimentos</button>
    <button class="mais-btn" data-a="novo-menu" aria-label="Novo">${I("plus")}</button>
    <button data-nav="pagar" data-a="ir" data-v="pagar">${I("outflow")}A pagar</button>
    <button data-a="menu-cel">${I("menu")}Menu</button>
  </nav>
  <div class="paleta" id="paleta" role="dialog" aria-label="Busca">
    <input id="buscaIn" type="search" placeholder="Buscar documento, parceiro, conta, cartão, valor…" autocomplete="off" data-i="busca">
    <div class="res" id="buscaRes"></div>
  </div>`);
}
app.aoRender=()=>{ const n=document.getElementById("nav"); if(n) n.innerHTML=String(navHtml());
  const chave=(()=>{ const t=app.telas[app.rota.nome]; return typeof t.nav==="function"?t.nav(app):(t.nav||app.rota.nome); })();
  document.querySelectorAll("[data-nav]").forEach(b=>b.classList.toggle("on",b.dataset.nav===chave)); };

/* ── menu do celular: a navegação inteira numa folha ── */
acao("menu-cel",()=>abrirPainel({titulo:"Menu",estreito:true,id:"menu",
  corpo:h`<div class="lado-cel">${navHtml()}<div class="nav-g"><button class="nav-i" data-a="ir" data-v="ajustes">${I("gear")}<span>Ajustes</span></button></div></div>`}));
document.addEventListener("click",e=>{ if(e.target.closest("#painel .nav-i")) setTimeout(fecharPainel,0); });

/* ── ações rápidas ── */
const NOVOS=[
  ["doc-novo","Nova despesa","outflow","PAGAR","Conta, compra, boleto — à vista ou parcelada"],
  ["doc-novo","Nova receita","inflow","RECEBER","Salário, venda, algo a receber"],
  ["doc-novo","Compra no cartão","card","COMPRA_CARTAO","Entra na fatura; sai do banco quando a fatura é paga"],
  ["pag-novo","Registrar pagamento","check","SAIDA","Quitar contas a pagar de um parceiro"],
  ["pag-novo","Registrar recebimento","coin","ENTRADA","Baixar o que alguém te pagou"],
  ["trf-nova","Nova transferência","swap","","Entre suas contas — não é receita nem despesa"],
  ["ir-imp","Importar extrato ou fatura","import","","CSV, Excel ou OFX do banco"],
  ["ir-conc","Conciliar com o banco","scale","","Comparar o saldo do WIGO com o do banco"]
];
acao("novo-menu",()=>abrirPainel({titulo:"Novo",sub:"O que aconteceu?",estreito:true,id:"novo",
  corpo:h`<div class="lista card">${juntar(NOVOS,([a,t,i,v,s])=>h`<div class="clic" data-a="${a}" data-v="${v}">
    <span class="bola acc">${I(i)}</span><div class="meio"><div class="t">${t}</div><div class="s">${s}</div></div>${I("chevron","p")}</div>`)}</div>`}));
acao("ir-imp",()=>{ fecharPainel(); ir("importacao"); });
acao("ir-conc",()=>{ fecharPainel(); ir("reconciliacao"); });

/* ── busca global ── */
let resultados=[], foco=0;
acao("busca-abrir",()=>{ const p=document.getElementById("paleta"); p.classList.add("on"); document.getElementById("veu").classList.add("on");
  const i=document.getElementById("buscaIn"); i.value=""; desenharBusca(""); setTimeout(()=>i.focus(),30); });
acao("busca-fechar",()=>{ document.getElementById("paleta").classList.remove("on"); if(!app.painelAberto) document.getElementById("veu").classList.remove("on"); });
document.addEventListener("click",e=>{ if(e.target.id==="veu") document.getElementById("paleta")?.classList.remove("on"); });
aoDigitar("busca",el=>desenharBusca(el.value));
function desenharBusca(q){
  const grupos=q.trim()?buscar(app.L,q):[];
  resultados=grupos.flatMap(g=>g.itens); foco=0;
  const alvo=document.getElementById("buscaRes");
  if(!q.trim()){ alvo.innerHTML=String(h`<div class="vazio peq">Digite um nome, número de documento (AP-000012), conta, cartão ou valor.</div>`); return; }
  if(!grupos.length){ alvo.innerHTML=String(h`<div class="vazio peq">Nada encontrado para "${q}".</div>`); return; }
  let k=0;
  alvo.innerHTML=String(juntar(grupos,g=>h`<div class="gr cap">${g.grupo}${g.total>g.itens.length?h` · ${g.total}`:""}</div>
    ${juntar(g.itens,it=>h`<div class="it ${k++===0?"on":""}" data-a="busca-ir" data-t="${it.tipo}" data-id="${it.id}">
      <div class="meio" style="flex:1;min-width:0"><div class="t" style="font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${it.titulo}</div>
      <div class="fraco peq">${it.sub||""}</div></div>${it.valor!=null?h`<span class="num" style="font-weight:600">${R(it.valor)}</span>`:""}</div>`)}`));
}
document.addEventListener("keydown",e=>{
  if(!document.getElementById("paleta")?.classList.contains("on")) return;
  const its=[...document.querySelectorAll("#buscaRes .it")]; if(!its.length) return;
  if(e.key==="ArrowDown"||e.key==="ArrowUp"){ e.preventDefault(); foco=(foco+(e.key==="ArrowDown"?1:-1)+its.length)%its.length;
    its.forEach((x,i)=>x.classList.toggle("on",i===foco)); its[foco].scrollIntoView({block:"nearest"}); }
  if(e.key==="Enter"){ e.preventDefault(); its[foco].click(); }
});
acao("busca-ir",el=>{
  document.getElementById("paleta").classList.remove("on"); document.getElementById("veu").classList.remove("on");
  const {t,id}=el.dataset;
  if(t==="documento") app.abrirDocumento(id);
  else if(t==="pagamento") app.abrirPagamento(id);
  else if(t==="parceiro") ir("parceiros",id);
  else if(t==="conta") ir("contas",id);
  else if(t==="cartao") ir("cartoes",id);
  else if(t==="fatura"){ const [c,r]=id.split("|"); ir("faturas",c,r); }
});

/* ── login ── */
let modoLogin="entrar";
/* O "G" do Google, nas cores da marca, como o Google pede no botão de login */
const LOGO_G=raw('<svg viewBox="0 0 48 48" width="18" height="18" aria-hidden="true"><path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z"/><path fill="#FF3D00" d="m6.3 14.7 6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z"/><path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z"/><path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z"/></svg>');
function telaLogin(msg="",{tipo="ruim",email=""}={}){
  document.getElementById("raiz").innerHTML=String(h`<div class="entrar"><form class="card" data-f="login">
    <div class="marca" style="margin-bottom:4px">WIG<b>O</b></div>
    <div class="fraco" style="margin-bottom:22px">Seu sistema financeiro pessoal.</div>
    <div class="seg larg" style="margin-bottom:18px">
      <button type="button" class="${modoLogin==="entrar"?"on":""}" data-a="login-modo" data-v="entrar">Entrar</button>
      <button type="button" class="${modoLogin==="criar"?"on":""}" data-a="login-modo" data-v="criar">Criar conta</button></div>
    <button type="button" class="btn sec larg" data-a="login-google" style="gap:10px">${LOGO_G} ${modoLogin==="entrar"?"Entrar com Google":"Criar conta com Google"}</button>
    <div class="fraco peq" style="text-align:center;margin:16px 0">ou com e-mail e senha</div>
    <div class="campo"><label for="lgEmail">E-mail</label><input id="lgEmail" name="email" type="email" autocomplete="email" required value="${email}"></div>
    <div class="campo"><label for="lgSenha">Senha</label><input id="lgSenha" name="senha" type="password" autocomplete="${modoLogin==="entrar"?"current-password":"new-password"}" required minlength="6"></div>
    ${msg?h`<div class="aviso ${tipo}" style="margin-bottom:14px">${I(tipo==="info"?"link":"alert")}<div>${msg}</div></div>`:""}
    <button class="btn larg" type="submit">${modoLogin==="entrar"?"Entrar":"Criar conta"}</button>
    ${modoLogin==="entrar"?h`<div style="text-align:center;margin-top:14px"><button type="button" class="link" data-a="login-esqueci">Esqueci a senha</button></div>`:""}
  </form></div>`);
}
const ERROS={"auth/invalid-email":"E-mail inválido.","auth/user-not-found":"Nenhuma conta com esse e-mail.","auth/wrong-password":"Senha incorreta.",
  "auth/invalid-credential":"E-mail ou senha incorretos.","auth/email-already-in-use":"Já existe uma conta com esse e-mail.",
  "auth/weak-password":"Senha muito fraca (mínimo 6 caracteres).","auth/too-many-requests":"Muitas tentativas. Aguarde e tente de novo.",
  "auth/network-request-failed":"Sem conexão. Verifique sua internet.",
  "auth/popup-blocked":"O navegador bloqueou a janela do Google. Permita pop-ups para este site e tente de novo.",
  "auth/operation-not-allowed":"O login com Google ainda não foi ativado no Firebase (Authentication → Método de login).",
  "auth/unauthorized-domain":"Este endereço ainda não está autorizado no Firebase (Authentication → Configurações → Domínios autorizados).",
  "auth/credential-already-in-use":"Essa conta Google já é o login de outro usuário do WIGO. Use outra conta Google.",
  "auth/provider-already-linked":"Sua conta já está ligada a uma conta Google.",
  "auth/user-disabled":"Esta conta foi desativada."};

/* Entrar com Google. Janela (popup), não redirecionamento: o redirecionamento
   precisa que o site e o authDomain (app-fin-ebcfe.firebaseapp.com) sejam o
   mesmo domínio, e com o site no Netlify o Safari e o Chrome novos perdem o
   retorno do login.

   Quem já tem conta com senha continua sendo o MESMO usuário — é isso que
   mantém os dados, que ficam em users/{uid}. Num @gmail.com o próprio
   Firebase junta as duas formas de entrar. Num e-mail que não é do Google
   (Hotmail, por exemplo) ele recusa com account-exists-with-different-credential:
   aí o app guarda a credencial do Google, pede a senha uma vez e liga as duas.
   Criar um usuário novo nesse caso abriria o app vazio para a pessoa. */
let googlePendente=null;
const provedorGoogle=()=>{ const p=new GoogleAuthProvider(); p.setCustomParameters({prompt:"select_account"}); return p; };
const cancelouJanela=e=>e.code==="auth/popup-closed-by-user"||e.code==="auth/cancelled-popup-request";
acao("login-google",async()=>{
  try{ await signInWithPopup(auth,provedorGoogle()); }
  catch(e){
    if(cancelouJanela(e)) return;
    if(e.code==="auth/account-exists-with-different-credential"){
      googlePendente=GoogleAuthProvider.credentialFromError(e); modoLogin="entrar";
      telaLogin("Esse e-mail já tem conta no WIGO, com senha. Entre com a senha só desta vez: a conta Google fica ligada a ela e, das próximas vezes, basta tocar em Entrar com Google.",
        {tipo:"info",email:e.customData?.email||""});
      return; }
    telaLogin(ERROS[e.code]||("Erro: "+(e.code||e.message)));
  }
});
/* Em Ajustes: ligar o Google a uma conta que hoje entra com senha */
acao("conta-google",async()=>{
  try{ const r=await linkWithPopup(auth.currentUser,provedorGoogle()); app.usuario=r.user; render(); toast("Conta Google ligada. Você pode entrar com ela a partir de agora."); }
  catch(e){ if(!cancelouJanela(e)) toast(ERROS[e.code]||("Erro: "+(e.code||e.message)),{erro:true}); }
});
acao("login-modo",el=>{ modoLogin=el.dataset.v; telaLogin(); });
form("login",async(f,d)=>{
  const email=d.get("email"), senha=d.get("senha");
  f.querySelector("button[type=submit]").disabled=true;
  let r;
  try{ r=modoLogin==="entrar"?await signInWithEmailAndPassword(auth,email,senha):await createUserWithEmailAndPassword(auth,email,senha); }
  catch(e){ telaLogin(ERROS[e.code]||("Erro: "+(e.code||e.message)),{email}); return; }
  if(googlePendente){ const cred=googlePendente; googlePendente=null;
    try{ await linkWithCredential(r.user,cred); toast("Conta Google ligada. Das próximas vezes, entre com o Google."); }
    catch(e){ toast("Não deu para ligar a conta Google: "+(ERROS[e.code]||e.code||e.message),{erro:true}); } }
});
acao("login-esqueci",async()=>{ const email=document.getElementById("lgEmail").value;
  if(!email){ telaLogin("Digite seu e-mail e toque em \"Esqueci a senha\"."); return; }
  try{ await sendPasswordResetEmail(auth,email); telaLogin(); toast("Enviamos um link para "+email); }catch(e){ telaLogin(ERROS[e.code]||e.message); } });
acao("sair",async()=>{ await signOut(auth); location.hash=""; });

/* ── carregar ── */
function telaCarregando(texto){
  document.getElementById("raiz").innerHTML=String(h`<div class="entrar"><div class="card" style="text-align:center">
    <div class="marca" style="margin-bottom:10px">WIG<b>O</b></div><div class="fraco">${texto}</div>
    <div class="barra" style="margin-top:16px"><i class="sk" id="carBarra" style="width:100%"></i></div>
    <div class="fraco peq" id="carConta" style="margin-top:10px"></div><div id="carAviso"></div></div></div>`);
}
/* a migração conta o que já gravou; se o Firebase parar de responder, a tela
   diz isso em vez de ficar parada sem explicação */
function progressoMigracao(f,{feitos,total}={}){
  const barra=document.getElementById("carBarra"), conta=document.getElementById("carConta"), av=document.getElementById("carAviso");
  if(!barra) return;
  if(f==="progresso"&&total){ barra.classList.remove("sk"); barra.style.width=Math.max(3,Math.round(feitos/total*100))+"%";
    conta.textContent="Gravando "+feitos.toLocaleString("pt-BR")+" de "+total.toLocaleString("pt-BR")+" registros"; }
  if(f==="lento") av.innerHTML=String(h`<div class="aviso warn" style="margin-top:16px;text-align:left">${I("clock")}<div>
    <b>O Firebase não está confirmando a gravação.</b> Isso costuma ser o limite diário do plano gratuito do Firebase ou a conexão.
    Seus dados do 2.2 continuam intactos. Pode deixar esta página aberta (se o Firebase voltar a responder, a migração segue sozinha)
    ou fechar e tentar mais tarde.</div></div>`);
}
async function iniciar(usuario){
  app.usuario=usuario;
  app.L=new Livro();
  app.repo=new Repositorio(app.L,{aoMudarEstado:st=>{ if(st==="lento"){ toast("O Firebase ainda não confirmou a gravação. Se demorar mais, confira a conexão.",{erro:true}); return; } const s=document.getElementById("sync"); if(s){ s.classList.toggle("salvando",st==="salvando"); s.title=st==="salvando"?"Salvando…":"Sincronizado"; } }});
  telaCarregando("Carregando seus dados…");
  let r;
  try{ r=await app.repo.carregar(usuario.uid,{aoMigrar:(f,info)=>{ if(f==="inicio") telaCarregando("Primeira vez na versão 3: convertendo seus dados do WIGO 2.2. O original não é alterado."); else progressoMigracao(f,info); }}); }
  catch(e){ console.error(e);
    document.getElementById("raiz").innerHTML=String(h`<div class="entrar"><div class="card"><div class="marca">WIG<b>O</b></div>
      <div class="aviso ruim" style="margin:16px 0">${I("alert")}<div><b>Não foi possível abrir seus dados.</b><br>${e.message}</div></div>
      <div class="btns"><button class="btn" data-a="recarregar">Tentar de novo</button><button class="btn sec" data-a="sair">Sair</button></div></div></div>`);
    return; }
  /* recorrências: a janela de 24 meses anda com o calendário */
  const novas=gerarPendentes(app.L); if(novas) app.repo.gravar(novas).catch(e=>console.error(e));
  shell(); lerRota(); render();
  if(r.migrou) app.mostrarMigracao?.(r.relatorio);
}
acao("recarregar",()=>location.reload());

/* ganchos para os testes de ponta a ponta (inofensivos em produção) */
import { verificar } from "./financas/integridade.js";
import * as Faturas from "./financas/cartoes.js";
window.__app=app; window.__verificar=()=>verificar(app.L); window.__faturas=Faturas;

aplicarTema();
ligarEventos(); ligarDicas();
onAuthStateChanged(auth,u=>{ if(u) iniciar(u); else { app.L=null; telaLogin(); } });
