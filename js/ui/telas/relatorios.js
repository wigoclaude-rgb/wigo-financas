/* ══════════ RELATÓRIOS ══════════
   Todos leem o mesmo livro (financas/relatorios.js). A página de entrada
   lista os relatórios por assunto; cada um tem filtros no topo, gráfico
   quando ajuda, e SEMPRE a tabela — o número exato nunca depende de passar
   o mouse. */
import { app, tela, filtro, render, aoMudar, acao, ir } from "../base.js";
import { h, raw, juntar } from "../html.js";
import { I, R, Rs, fmtData, chipSt, kpi, tabela, vazio, rotuloMes, rotuloMesCurto, graficoColunas, barrasRanking } from "../componentes.js";
import { clic, seletorPeriodo, intervalo, contaPadrao, opcoesParceiro } from "../util.js";
import * as Rel from "../../financas/relatorios.js";
import { faturasDoCartao } from "../../financas/cartoes.js";
import { movimentosDaConta } from "../../financas/conciliacao.js";
import { K, TIPO_CONTA, DISPONIVEL } from "../../financas/modelo.js";
import { hoje, mesDe, addMesesMes, inicioDoMes, fimDoMes, diasEntre } from "../../nucleo/datas.js";
import { soma } from "../../nucleo/dinheiro.js";

const LISTA=[
  ["Financeiro",[["razao","Razão","ledger","Todas as movimentações de uma conta, com saldo linha a linha"],
    ["fluxo","Fluxo de caixa","trendUp","Entradas e saídas por mês, realizado e projetado"],
    ["saldos","Saldos por conta","bank","Quanto havia em cada conta numa data"],
    ["resultado","Receitas e despesas","layers","Por categoria — competência ou caixa"]]],
  ["Contas a pagar e a receber",[["obrigacoes","Em aberto e vencidos","outflow","Por parceiro, por categoria e por vencimento"]]],
  ["Cartões",[["cartoes","Cartões","card","Gastos por cartão, faturas futuras, parcelamentos"]]],
  ["Parceiros",[["parceiros","Saldo por parceiro","handshake","Quanto você deve e quanto te devem, de cada um"]]],
  ["Reconciliação",[["conciliacao","Conciliação","scale","Conciliado × pendente em cada conta"]]],
  ["Avançados",[["avancados","Análise","chart","Evolução, compromissos futuros, patrimônio e comparação de períodos"]]]
];
const NOMES=Object.fromEntries(LISTA.flatMap(([,xs])=>xs.map(x=>[x[0],x[1]])));
const voltar=h`<button class="btn fant peq" data-a="ir" data-v="relatorios" style="margin-bottom:12px">${I("undo","p")} Relatórios</button>`;
const imprimir=h`<button class="btn sec peq" data-a="imprimir">${I("download","p")} Imprimir / PDF</button>`;
acao("imprimir",()=>window.print());

tela("relatorios",{grupo:"Relatórios",titulo:app=>NOMES[app.rota.params[0]]||"Relatórios",nav:app=>app.rota.params[0]?"relatorios/"+app.rota.params[0]:"relatorios",
render(app){
  const sub=app.rota.params[0];
  if(sub&&REL[sub]) return h`<div class="btns" style="justify-content:space-between">${voltar}${imprimir}</div>${REL[sub](app.L,app.rota.params.slice(1))}`;
  return juntar(LISTA,([g,xs])=>h`<div class="secao"><div class="sec-cab"><h2 class="cap">${g}</h2></div><div class="rel-grade">${juntar(xs,([k,t,i,s])=>
    h`<div class="card" data-a="ir" data-v="relatorios" data-p="${k}"><span class="bola acc">${I(i)}</span><div><div class="t">${t}</div><div class="s">${s}</div></div></div>`)}</div></div>`);
}});
aoMudar("rel-f",el=>{ app.f[el.dataset.tela][el.dataset.k]=el.type==="checkbox"?el.checked:el.value; render(); });
const sel=(tela,k,v,opcoes)=>h`<select data-c="rel-f" data-tela="${tela}" data-k="${k}">${juntar(opcoes,([ov,r])=>h`<option value="${ov}"${String(ov)===String(v)?raw(" selected"):""}>${r}</option>`)}</select>`;

const REL={
/* ── RAZÃO ── */
razao(L,[contaParam]){
  const f=filtro("rel-razao",{conta:contaParam||contaPadrao(),periodo:"mes",pn:"",cat:"",nat:"",conc:""});
  if(contaParam) f.conta=contaParam;
  const {de,ate}=intervalo(f.periodo,f.de,f.ate);
  const chave=f.conta.startsWith("card:")?K.cartao(f.conta.slice(5)):K.conta(f.conta);
  const rz=Rel.razao(L,chave,{de,ate});
  let ls=rz.linhas;
  const filtrando=f.pn||f.cat||f.nat||f.conc;
  if(f.pn) ls=ls.filter(x=>x.parceiro===f.pn);
  if(f.cat) ls=ls.filter(x=>x.categorias.some(c=>c===f.cat||L.grupoCategoria(c)===f.cat));
  if(f.nat) ls=ls.filter(x=>x.natureza===f.nat);
  if(f.conc==="sim") ls=ls.filter(x=>x.conciliado); else if(f.conc==="nao") ls=ls.filter(x=>!x.conciliado);
  const opts=[...L.contas.values()].map(c=>[c.id,c.nome]).concat([...L.cartoes.values()].map(c=>["card:"+c.id,c.nome+" (cartão)"]));
  return h`<div class="filtros">${sel("rel-razao","conta",f.conta,opts)}${seletorPeriodo(f,"rel-razao")}
      <select data-c="rel-f" data-tela="rel-razao" data-k="pn">${opcoesParceiro(f.pn,{todos:true})}</select>
      ${sel("rel-razao","cat",f.cat,[["","Todas as categorias"],...L.categoriasAtivas().map(c=>[c.id,L.nomeCategoria(c.id)+(L.subcategorias(c.id).length?" (todas)":"")]).sort((a,b)=>a[1].localeCompare(b[1],"pt-BR"))])}
      ${sel("rel-razao","nat",f.nat,[["","Todos os tipos"],["PAGAMENTO","Pagamentos e recebimentos"],["TRANSFERENCIA","Transferências"],["AJUSTE","Ajustes"],["ABERTURA","Saldo inicial"],["ESTORNO","Estornos"],["DOCUMENTO","Compras (cartão)"]])}
      ${sel("rel-razao","conc",f.conc,[["","Conciliados ou não"],["sim","Conciliados"],["nao","Não conciliados"]])}</div>
    ${filtrando?h`<div class="fraco peq" style="margin-bottom:8px">Filtro ativo: linhas escondidas, mas a coluna Saldo continua sendo a da conta naquele momento.</div>`:""}
    <div class="card"><div class="tab-wrap"><table class="tab cartoes"><thead><tr><th>Data</th><th>Documento</th><th>Descrição</th><th class="r">Entrada</th><th class="r">Saída</th><th class="cel-only"></th><th class="r">Saldo</th></tr></thead><tbody>
      ${rz.temAnterior?h`<tr><td class="nw">${fmtData(de)}</td><td class="oc"></td><td><b>Saldo anterior</b></td><td class="r oc"></td><td class="r oc"></td><td class="cel-only"></td><td class="r"><b>${R(rz.anterior)}</b></td></tr>`:""}
      ${juntar(ls,x=>h`<tr class="clic ${x.estornado?"fraca":""}"${x.lanc.pagamento?clic("pag-abrir",x.lanc.pagamento):x.lanc.documento?clic("doc-abrir",x.lanc.documento):""}>
        <td class="nw">${fmtData(x.data)}</td><td class="oc"><span class="num-doc">${x.numero}</span></td>
        <td><div class="t">${x.descricao}</div><div class="sub">${x.referencia||""}${x.parceiro?" · "+L.nomeParceiro(x.parceiro):""}${x.conciliado?" · conciliado":""}</div></td>
        <td class="r oc">${x.entrada?h`<span class="up">${R(x.entrada)}</span>`:""}</td><td class="r oc">${x.saida?R(x.saida):""}</td>
        <td class="r cel-only"><b class="${x.valor>0?"up":""}">${Rs(x.valor)}</b></td><td class="r"><span class="cel-only fraco peq">saldo </span><b>${R(x.saldo)}</b></td></tr>`)}
      </tbody><tfoot><tr><td colspan="3">${ls.length} movimento(s)</td><td class="r up oc">${R(soma(ls,x=>x.entrada))}</td><td class="r oc">${R(soma(ls,x=>x.saida))}</td><td class="cel-only"></td><td class="r"><b>${R(rz.final)}</b></td></tr></tfoot></table></div></div>`;
},
/* ── FLUXO DE CAIXA ── */
fluxo(L){
  const f=filtro("rel-fluxo",{meses:"6",proj:"6"});
  const fim=mesDe(hoje()), ini=addMesesMes(fim,-(+f.meses-1));
  const fl=Rel.fluxoDeCaixa(L,{de:inicioDoMes(ini),ate:fimDoMes(fim)});
  const pj=Rel.compromissos(L,{meses:+f.proj});
  return h`<div class="filtros">${sel("rel-fluxo","meses",f.meses,[["3","Últimos 3 meses"],["6","Últimos 6 meses"],["12","Últimos 12 meses"],["24","Últimos 24 meses"]])}
      ${sel("rel-fluxo","proj",f.proj,[["3","Projetar 3 meses"],["6","Projetar 6 meses"],["12","Projetar 12 meses"]])}</div>
    <div class="card secao"><div class="card-cab"><div><h2 class="t2">Realizado</h2><div class="fraco peq">Dinheiro disponível (contas e dinheiro — sem reservas nem vales). Transferência entre elas não conta.</div></div></div>
      <div class="card-corpo">${graficoColunas({rotulos:fl.map(x=>rotuloMesCurto(x.mes)),series:[{nome:"Entradas",cor:"--serie1",valores:fl.map(x=>x.entradas)},{nome:"Saídas",cor:"--serie2",valores:fl.map(x=>x.saidas)}]})}</div>
      ${tabela({linhas:fl,cartoes:false,colunas:[{rot:"Mês",cel:x=>rotuloMes(x.mes)},{rot:"Saldo inicial",r:true,cel:x=>R(x.saldoInicial)},{rot:"Entradas",r:true,cel:x=>h`<span class="up">${R(x.entradas)}</span>`},
        {rot:"Saídas",r:true,cel:x=>R(x.saidas)},{rot:"Reservas (líquido)",r:true,cel:x=>Rs(x.dasReservas-x.paraReservas)},{rot:"Saldo final",r:true,cel:x=>h`<b>${R(x.saldoFinal)}</b>`}],
        rodape:h`<td>Total</td><td></td><td class="r up">${R(soma(fl,x=>x.entradas))}</td><td class="r">${R(soma(fl,x=>x.saidas))}</td><td class="r">${Rs(soma(fl,x=>x.dasReservas-x.paraReservas))}</td><td></td>`})}</div>
    <div class="card"><div class="card-cab"><div><h2 class="t2">Projetado</h2><div class="fraco peq">Saldo de hoje + o que vence a receber − a pagar − faturas. O que já venceu entra no mês atual.</div></div></div>
      <div class="card-corpo">${graficoColunas({rotulos:pj.map(x=>rotuloMesCurto(x.mes)),series:[{nome:"Saldo previsto",cor:"--serie1",valores:pj.map(x=>x.saldoFinal)}]})}</div>
      ${tabela({linhas:pj,cartoes:false,colunas:[{rot:"Mês",cel:x=>rotuloMes(x.mes)},{rot:"Início",r:true,cel:x=>R(x.saldoInicial)},{rot:"A receber",r:true,cel:x=>h`<span class="up">${R(x.receber)}</span>`},
        {rot:"A pagar",r:true,cel:x=>R(x.pagar)},{rot:"Faturas",r:true,cel:x=>R(x.faturas)},{rot:"Reservas",r:true,cel:x=>x.reservas?R(x.reservas):"—"},{rot:"Fim",r:true,cel:x=>h`<b class="${x.saldoFinal<0?"down":""}">${R(x.saldoFinal)}</b>`}]})}</div>`;
},
/* ── SALDOS POR CONTA ── */
saldos(L){
  const f=filtro("rel-saldos",{data:hoje()});
  const cs=[...L.contas.values()].sort((a,b)=>a.nome.localeCompare(b.nome,"pt-BR"));
  const cart=[...L.cartoes.values()];
  return h`<div class="filtros"><label class="rot">Em</label><input type="date" value="${f.data}" data-c="rel-f" data-tela="rel-saldos" data-k="data"></div>
    <div class="card secao">${tabela({linhas:cs,cartoes:false,clic:c=>' data-a="ir" data-v="contas" data-p="'+c.id+'"',colunas:[{rot:"Conta",cel:c=>h`<span class="ponto" style="background:${c.cor};display:inline-block;margin-right:8px"></span>${c.nome}`},
      {rot:"Tipo",cel:c=>TIPO_CONTA[c.tipo]},{rot:"Saldo",r:true,cel:c=>h`<b>${R(L.saldoConta(c.id,f.data))}</b>`}],
      rodape:h`<td colspan="2">Total em contas</td><td class="r"><b>${R(soma(cs,c=>L.saldoConta(c.id,f.data)))}</b></td>`})}</div>
    ${cart.length?h`<div class="card">${tabela({linhas:cart,cartoes:false,colunas:[{rot:"Cartão",cel:c=>c.nome},{rot:"Dívida (inclui parcelas futuras)",r:true,cel:c=>R(L.dividaCartao(c.id,f.data))}],
      rodape:h`<td>Total em cartões</td><td class="r"><b>${R(soma(cart,c=>L.dividaCartao(c.id,f.data)))}</b></td>`})}</div>`:""}`;
},
/* ── RECEITAS E DESPESAS ── */
resultado(L){
  const f=filtro("rel-resultado",{periodo:"mes",base:"competencia"});
  const {de,ate}=intervalo(f.periodo==="tudo"?"ano":f.periodo,f.de,f.ate);
  const r=f.base==="caixa"?Rel.resultadoCaixa(L,{de,ate}):Rel.resultado(L,{de,ate});
  const desp=r.grupos.filter(c=>c.natureza==="DESPESA"), rec=r.grupos.filter(c=>c.natureza==="RECEITA");
  const totR=f.base==="caixa"?r.entradas:r.receitas, totD=f.base==="caixa"?r.saidas:r.despesas;
  const bloco=(tit,xs,tot)=>h`<div class="card"><div class="card-cab"><h2 class="t2">${tit}</h2><b>${R(tot)}</b></div><div class="card-corpo">
    ${xs.length?barrasRanking(xs.flatMap(c=>[{id:c.id,nome:c.nome,valor:c.total,sub:tot?Math.round(c.total/tot*100)+"%":""},
      ...c.subs.map(s=>({id:s.id,nome:s.nome,valor:s.total,nivel:1}))])):h`<div class="fraco peq">Nada no período.</div>`}</div></div>`;
  return h`<div class="filtros">${seletorPeriodo(f,"rel-resultado",{semTudo:true})}
      <div class="seg">${juntar([["competencia","Competência"],["caixa","Caixa"]],([k,t])=>h`<button class="${f.base===k?"on":""}" data-a="rel-base" data-v="${k}">${t}</button>`)}</div></div>
    <div class="fraco peq" style="margin-bottom:12px">${f.base==="caixa"?"Caixa: quando o dinheiro saiu ou entrou (data do pagamento). Compra no cartão conta no pagamento da fatura.":"Competência: a que mês a despesa ou receita pertence, independente de quando foi paga."}</div>
    <div class="kpis secao">${kpi({rotulo:"Receitas",valor:R(totR)})}${kpi({rotulo:"Despesas",valor:R(totD)})}${kpi({rotulo:"Resultado",valor:Rs(totR-totD),tom:totR-totD<0?"down":"up"})}</div>
    <div class="grade g2">${bloco("Despesas",desp,totD)}${bloco("Receitas",rec,totR)}</div>`;
},
/* ── A PAGAR / RECEBER ── */
obrigacoes(L){
  const f=filtro("rel-obr",{lado:"PAGAR",agrupar:"parceiro"});
  const xs=L.obrigacoes(f.lado).filter(x=>x.e.restante>0&&x.doc.status!=="CANCELADO");
  const h0=hoje(), grupos=new Map();
  for(const x of xs){ const k=f.agrupar==="parceiro"?(x.doc.parceiro||"-"):f.agrupar==="categoria"?(x.doc.categoria||"-"):x.p.vencimento.slice(0,7);
    if(!grupos.has(k)) grupos.set(k,{k,total:0,vencido:0,n:0}); const g=grupos.get(k); g.total+=x.e.restante; g.n++; if(x.p.vencimento<h0) g.vencido+=x.e.restante; }
  const nome=k=>f.agrupar==="parceiro"?(k==="-"?"Sem parceiro":L.nomeParceiro(k)):f.agrupar==="categoria"?(k==="-"?"Sem categoria":L.nomeCategoria(k)):rotuloMes(k);
  const gs=[...grupos.values()].sort((a,b)=>f.agrupar==="mes"?(a.k<b.k?-1:1):b.total-a.total);
  const fx=Rel.faixas(L,f.lado);
  return h`<div class="filtros"><div class="seg">${juntar([["PAGAR","A pagar"],["RECEBER","A receber"]],([k,t])=>h`<button class="${f.lado===k?"on":""}" data-a="rel-obr" data-k="lado" data-v="${k}">${t}</button>`)}</div>
      ${sel("rel-obr","agrupar",f.agrupar,[["parceiro","Por parceiro"],["categoria","Por categoria"],["mes","Por mês de vencimento"]])}</div>
    <div class="kpis secao">${kpi({rotulo:"Em aberto",valor:R(fx.total)})}${kpi({rotulo:"Vencido",valor:R(fx.vencido),tom:fx.vencido?"down":""})}${kpi({rotulo:"Próximos 30 dias",valor:R(fx.sete+fx.trinta+fx.hoje)})}${kpi({rotulo:"Depois",valor:R(fx.depois)})}</div>
    <div class="card">${tabela({linhas:gs,cartoes:false,vazioTxt:"Nada em aberto",colunas:[{rot:"Grupo",cel:g=>nome(g.k)},{rot:"Parcelas",r:true,cel:g=>g.n},{rot:"Vencido",r:true,cel:g=>g.vencido?h`<span class="down">${R(g.vencido)}</span>`:"—"},{rot:"Em aberto",r:true,cel:g=>h`<b>${R(g.total)}</b>`}],
      rodape:h`<td>Total</td><td class="r">${xs.length}</td><td class="r">${R(soma(gs,g=>g.vencido))}</td><td class="r"><b>${R(soma(gs,g=>g.total))}</b></td>`})}</div>`;
},
/* ── CARTÕES ── */
cartoes(L){
  const rc=Rel.relatorioCartoes(L,{meses:12});
  if(!rc.length) return vazio({icone:"card",titulo:"Nenhum cartão"});
  const meses=Array.from({length:6},(_,i)=>addMesesMes(mesDe(hoje()),i));
  return h`<div class="card secao"><div class="card-cab"><div><h2 class="t2">Comprometimento futuro</h2><div class="fraco peq">O que cada fatura já tem, dos próximos 6 meses</div></div></div>
      ${tabela({linhas:rc,cartoes:false,colunas:[{rot:"Cartão",cel:x=>x.cartao.nome},...meses.map(m=>({rot:rotuloMesCurto(m),r:true,cel:x=>{ const f=x.faturas.find(y=>y.ref===m); return f&&f.restante>0?R(f.restante):"—"; }})),{rot:"Total",r:true,cel:x=>h`<b>${R(x.comprometido)}</b>`}]})}</div>
    <div class="card"><div class="card-cab"><h2 class="t2">Compras parceladas em aberto</h2></div>
      ${tabela({linhas:rc.flatMap(x=>x.comprasParceladas.map(d=>({d,c:x.cartao}))),vazioTxt:"Nenhuma",clic:x=>String(clic("doc-abrir",x.d.id)),
        colunas:[{rot:"Compra",cel:x=>h`<div class="t">${x.d.descricao}</div><div class="sub">${x.c.nome} · <span class="num-doc">${x.d.numero}</span></div>`},{rot:"Total",r:true,oc:true,cel:x=>R(x.d.valor)},
          {rot:"Parcelas restantes",r:true,cel:x=>{ const e=L.estadoDocumento(x.d); return e.parcelas.filter(p=>p.e.restante>0).length+" de "+x.d.parcelas[0].de; }},{rot:"Falta",r:true,cel:x=>h`<b>${R(L.estadoDocumento(x.d).restante)}</b>`}]})}</div>`;
},
/* ── PARCEIROS ── */
parceiros(L){
  const xs=Rel.saldosParceiros(L).filter(x=>x.aPagar||x.aReceber||x.pago||x.recebido);
  return h`<div class="card">${tabela({linhas:xs,cartoes:false,vazioTxt:"Nenhum parceiro com movimento",clic:x=>' data-a="ir" data-v="parceiros" data-p="'+x.parceiro+'"',
    colunas:[{rot:"Parceiro",cel:x=>L.nomeParceiro(x.parceiro)},{rot:"Você deve",r:true,cel:x=>x.aPagar?R(x.aPagar):"—"},{rot:"Te devem",r:true,cel:x=>x.aReceber?R(x.aReceber):"—"},
      {rot:"Vencido",r:true,cel:x=>x.vencidoPagar+x.vencidoReceber?h`<span class="down">${R(x.vencidoPagar+x.vencidoReceber)}</span>`:"—"},
      {rot:"Pago",r:true,cel:x=>R(x.pago)},{rot:"Recebido",r:true,cel:x=>R(x.recebido)},{rot:"Saldo",r:true,cel:x=>h`<b class="${x.saldo>0?"up":x.saldo<0?"down":""}">${Rs(x.saldo)}</b>`}],
    rodape:h`<td>Total</td><td class="r">${R(soma(xs,x=>x.aPagar))}</td><td class="r">${R(soma(xs,x=>x.aReceber))}</td><td></td><td></td><td></td><td class="r"><b>${Rs(soma(xs,x=>x.saldo))}</b></td>`})}</div>`;
},
/* ── CONCILIAÇÃO ── */
conciliacao(L){
  const h0=hoje();
  const cs=[...L.contas.values()].filter(c=>c.ativa!==false).map(c=>{ const mov=movimentosDaConta(L,c.id,{ate:h0});
    const conc=mov.filter(x=>x.conc), pend=mov.filter(x=>!x.conc);
    const ult=conc.map(x=>x.conc.em).sort().pop();
    return {c,conc,pend,ult,antigo:pend.map(x=>x.data).sort()[0]}; });
  return h`<div class="card">${tabela({linhas:cs,cartoes:false,clic:x=>' data-a="rc-conta" data-id="'+x.c.id+'"',colunas:[{rot:"Conta",cel:x=>x.c.nome},
    {rot:"Conciliados",r:true,cel:x=>x.conc.length+" · "+R(soma(x.conc,y=>y.valor))},{rot:"Pendentes",r:true,cel:x=>x.pend.length?h`<b>${x.pend.length}</b> · ${R(soma(x.pend,y=>y.valor))}`:h`<span class="up">nenhum</span>`},
    {rot:"Pendente mais antigo",cel:x=>x.antigo?fmtData(x.antigo)+" ("+diasEntre(x.antigo,h0)+" dias)":"—"},{rot:"Última conciliação",cel:x=>x.ult?fmtData(x.ult):"nunca"}]})}</div>`;
},
/* ── AVANÇADOS ── */
avancados(L){
  const f=filtro("rel-av",{meses:"12",a:addMesesMes(mesDe(hoje()),-1),b:mesDe(hoje())});
  const ev=Rel.evolucao(L,{meses:+f.meses}), cp=Rel.compromissos(L,{meses:12}), pat=Rel.patrimonio(L), cmp=Rel.comparar(L,f.a,f.b);
  const opMeses=Array.from({length:24},(_,i)=>addMesesMes(mesDe(hoje()),-i)).map(m=>[m,rotuloMes(m)]);
  return h`<div class="card secao"><div class="card-cab"><div><h2 class="t2">Evolução mensal</h2><div class="fraco peq">Receitas e despesas por competência</div></div>
      ${sel("rel-av","meses",f.meses,[["6","6 meses"],["12","12 meses"],["24","24 meses"]])}</div>
    <div class="card-corpo">${graficoColunas({rotulos:ev.map(x=>rotuloMesCurto(x.mes)),series:[{nome:"Receitas",cor:"--serie1",valores:ev.map(x=>x.receitas)},{nome:"Despesas",cor:"--serie2",valores:ev.map(x=>x.despesas)}]})}</div>
    ${tabela({linhas:ev.slice().reverse(),cartoes:false,colunas:[{rot:"Mês",cel:x=>rotuloMes(x.mes)},{rot:"Receitas",r:true,cel:x=>R(x.receitas)},{rot:"Despesas",r:true,cel:x=>R(x.despesas)},
      {rot:"Resultado",r:true,cel:x=>h`<b class="${x.resultado<0?"down":"up"}">${Rs(x.resultado)}</b>`},{rot:"Saldo em contas",r:true,cel:x=>R(x.saldoContas)},{rot:"Patrimônio",r:true,cel:x=>R(x.patrimonio)}]})}</div>
  <div class="card secao"><div class="card-cab"><div><h2 class="t2">Compromissos futuros</h2><div class="fraco peq">Tudo que já está comprometido nos próximos 12 meses</div></div></div>
    <div class="card-corpo">${graficoColunas({rotulos:cp.map(x=>rotuloMesCurto(x.mes)),empilhar:true,series:[{nome:"Contas a pagar",cor:"--serie1",valores:cp.map(x=>x.pagar)},{nome:"Faturas",cor:"--serie2",valores:cp.map(x=>x.faturas)}]})}</div>
    ${tabela({linhas:cp,cartoes:false,colunas:[{rot:"Mês",cel:x=>rotuloMes(x.mes)},{rot:"A pagar",r:true,cel:x=>R(x.pagar)},{rot:"Faturas",r:true,cel:x=>R(x.faturas)},{rot:"A receber",r:true,cel:x=>h`<span class="up">${R(x.receber)}</span>`},{rot:"Saldo previsto",r:true,cel:x=>h`<b class="${x.saldoFinal<0?"down":""}">${R(x.saldoFinal)}</b>`}]})}</div>
  <div class="card secao"><div class="card-cab"><h2 class="t2">Patrimônio financeiro hoje</h2><b>${R(pat.liquido)}</b></div>
    ${tabela({linhas:[["Contas disponíveis",pat.disponivel],["Reservas",pat.reservas],["Benefícios",pat.beneficios],["A receber",pat.aReceber],["Cartões (−)",-pat.cartoes],["A pagar (−)",-pat.aPagar]],cartoes:false,
      colunas:[{rot:"Item",cel:x=>x[0]},{rot:"Valor",r:true,cel:x=>Rs(x[1])}],rodape:h`<td>Patrimônio líquido</td><td class="r"><b>${R(pat.liquido)}</b></td>`})}</div>
  <div class="card"><div class="card-cab"><h2 class="t2">Comparar períodos</h2><div class="btns">${sel("rel-av","a",f.a,opMeses)}<span class="fraco">×</span>${sel("rel-av","b",f.b,opMeses)}</div></div>
    ${tabela({linhas:cmp.linhas,cartoes:false,vazioTxt:"Nada nos dois meses",colunas:[{rot:"Categoria",cel:x=>h`${x.nome} <span class="fraco peq">${x.natureza==="RECEITA"?"receita":""}</span>`},{rot:rotuloMesCurto(f.a),r:true,cel:x=>R(x.a)},{rot:rotuloMesCurto(f.b),r:true,cel:x=>R(x.b)},
      {rot:"Diferença",r:true,cel:x=>h`<b class="${(x.natureza==="DESPESA"?-x.dif:x.dif)<0?"down":"up"}">${Rs(x.dif)}</b>`}],
      rodape:h`<td>Despesas</td><td class="r">${R(cmp.a.despesas)}</td><td class="r">${R(cmp.b.despesas)}</td><td class="r">${Rs(cmp.b.despesas-cmp.a.despesas)}</td>`})}</div>`;
}};
acao("rel-base",el=>{ app.f["rel-resultado"].base=el.dataset.v; render(); });
acao("rel-obr",el=>{ app.f["rel-obr"][el.dataset.k]=el.dataset.v; render(); });
