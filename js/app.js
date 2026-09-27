/* ══════════ WIGO 3 — ENTRADA ══════════
   Login → carregar (e migrar o 2.2, se for a primeira vez) → desenhar.
   As telas se registram sozinhas ao serem importadas. */
import { auth, onAuthStateChanged, signInWithEmailAndPassword, createUserWithEmailAndPassword,
  sendPasswordResetEmail, signOut } from "./dados/firebase.js";
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
import "./ui/documento.js";
import "./ui/formularios.js";

const NAV=[
  {itens:[["visao","Visão geral","home"],["movimentos","Movimentações","flow"]]},
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
    <div class="topo"><div class="marca">WIG<b>O</b></div><div class="fraco peq">${app.L.preferencias().nomeApp&&app.L.preferencias().nomeApp!=="WIGO"?app.L.preferencias().nomeApp:"Finanças"}</div></div>
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
function telaLogin(msg=""){
  document.getElementById("raiz").innerHTML=String(h`<div class="entrar"><form class="card" data-f="login">
    <div class="marca" style="margin-bottom:4px">WIG<b>O</b></div>
    <div class="fraco" style="margin-bottom:22px">Seu sistema financeiro pessoal.</div>
    <div class="seg larg" style="margin-bottom:18px">
      <button type="button" class="${modoLogin==="entrar"?"on":""}" data-a="login-modo" data-v="entrar">Entrar</button>
      <button type="button" class="${modoLogin==="criar"?"on":""}" data-a="login-modo" data-v="criar">Criar conta</button></div>
    <div class="campo"><label for="lgEmail">E-mail</label><input id="lgEmail" name="email" type="email" autocomplete="email" required></div>
    <div class="campo"><label for="lgSenha">Senha</label><input id="lgSenha" name="senha" type="password" autocomplete="${modoLogin==="entrar"?"current-password":"new-password"}" required minlength="6"></div>
    ${msg?h`<div class="aviso ruim" style="margin-bottom:14px">${I("alert")}<div>${msg}</div></div>`:""}
    <button class="btn larg" type="submit">${modoLogin==="entrar"?"Entrar":"Criar conta"}</button>
    ${modoLogin==="entrar"?h`<div style="text-align:center;margin-top:14px"><button type="button" class="link" data-a="login-esqueci">Esqueci a senha</button></div>`:""}
  </form></div>`);
}
const ERROS={"auth/invalid-email":"E-mail inválido.","auth/user-not-found":"Nenhuma conta com esse e-mail.","auth/wrong-password":"Senha incorreta.",
  "auth/invalid-credential":"E-mail ou senha incorretos.","auth/email-already-in-use":"Já existe uma conta com esse e-mail.",
  "auth/weak-password":"Senha muito fraca (mínimo 6 caracteres).","auth/too-many-requests":"Muitas tentativas. Aguarde e tente de novo.",
  "auth/network-request-failed":"Sem conexão. Verifique sua internet."};
acao("login-modo",el=>{ modoLogin=el.dataset.v; telaLogin(); });
form("login",async(f,d)=>{
  const email=d.get("email"), senha=d.get("senha");
  f.querySelector("button[type=submit]").disabled=true;
  try{ if(modoLogin==="entrar") await signInWithEmailAndPassword(auth,email,senha); else await createUserWithEmailAndPassword(auth,email,senha); }
  catch(e){ telaLogin(ERROS[e.code]||("Erro: "+(e.code||e.message))); }
});
acao("login-esqueci",async()=>{ const email=document.getElementById("lgEmail").value;
  if(!email){ telaLogin("Digite seu e-mail e toque em \"Esqueci a senha\"."); return; }
  try{ await sendPasswordResetEmail(auth,email); telaLogin(); toast("Enviamos um link para "+email); }catch(e){ telaLogin(ERROS[e.code]||e.message); } });
acao("sair",async()=>{ await signOut(auth); location.hash=""; });

/* ── carregar ── */
function telaCarregando(texto){
  document.getElementById("raiz").innerHTML=String(h`<div class="entrar"><div class="card" style="text-align:center">
    <div class="marca" style="margin-bottom:10px">WIG<b>O</b></div><div class="fraco">${texto}</div>
    <div class="barra" style="margin-top:16px"><i class="sk" style="width:100%"></i></div></div></div>`);
}
async function iniciar(usuario){
  app.usuario=usuario;
  app.L=new Livro();
  app.repo=new Repositorio(app.L,{aoMudarEstado:st=>{ const s=document.getElementById("sync"); if(s){ s.classList.toggle("salvando",st==="salvando"); s.title=st==="salvando"?"Salvando…":"Sincronizado"; } }});
  telaCarregando("Carregando seus dados…");
  let r;
  try{ r=await app.repo.carregar(usuario.uid,{aoMigrar:f=>{ if(f==="inicio") telaCarregando("Primeira vez na versão 3: convertendo seus dados do WIGO 2.2. O original não é alterado."); }}); }
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

ligarEventos(); ligarDicas();
onAuthStateChanged(auth,u=>{ if(u) iniciar(u); else { app.L=null; telaLogin(); } });
