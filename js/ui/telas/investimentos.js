/* ══════════ POUPANÇA E INVESTIMENTOS ══════════
   A aba "Metas" do 2.2 de volta, pedido do usuário (30/09/2026): quanto está
   guardado, quanto falta para cada meta e quanto rende. O rendimento é
   ESTIMATIVA (financas/investimentos.js) e não mexe no saldo; o rendimento
   de verdade entra pelo botão "Registrar rendimento", com o valor do
   extrato, como receita na própria conta.

   Cada investimento é uma conta do tipo Reserva. Depósito e retirada são
   transferências entre ela e uma conta do dia a dia — é o que já eram no
   motor, então saldo, fluxo de caixa e reconciliação continuam certos. */
import { app, tela, acao, form, abrirPainel, executar, toast } from "../base.js";
import { h, raw, juntar } from "../html.js";
import { I, R, Rs, fmtData, aviso, vazio, tabela } from "../componentes.js";
import { clic, contaPadrao } from "../util.js";
import { carteira, rendimentoEstimado, progressoMeta, rotuloTaxa, PRODUTOS } from "../../financas/investimentos.js";
import { razao } from "../../financas/relatorios.js";
import { K, DISPONIVEL } from "../../financas/modelo.js";
import * as C from "../../financas/comandos.js";
import { centavos, numero } from "../../nucleo/dinheiro.js";
import { hoje } from "../../nucleo/datas.js";

const pctTxt=v=>String(v).replace(".",",");
const campo=(rot,conteudo,ajuda="")=>h`<div class="campo"><label>${rot}</label>${conteudo}${ajuda?h`<span class="ajuda">${ajuda}</span>`:""}</div>`;
const valorInput=(nome,v)=>raw(`<input class="valor" name="${nome}" inputmode="decimal" placeholder="0,00" autocomplete="off" required ${v?`value="${numero(v)}"`:""}>`);

/* a linha do rendimento, igual nos cartões e no detalhe */
function rende(e){
  if(!e.calcula) return e.perfil.indexador==="NENHUM"?"sem cálculo automático: o valor muda com o que você lança":"informe a taxa para estimar";
  return "rende ~"+R(e.mesLiquido)+"/mês · "+R(e.anoLiquido)+"/ano"+(e.ir?" (líquido de IR "+pctTxt(e.ir*100)+"%)":" (isento de IR)");
}
function prazoMeta(m){
  if(!m.alvo) return "sem meta";
  if(m.batida) return "Meta batida!";
  return m.meses?"~"+m.meses+" "+(m.meses===1?"mês":"meses")+" no ritmo atual":"faltam "+R(m.falta);
}

tela("investimentos",{titulo:"Poupança e investimentos",render(app){
  const L=app.L, ct=carteira(L), ix=ct.indices;
  if(!ct.itens.length) return h`<div class="card">${vazio({icone:"piggy",titulo:"Nenhuma poupança ainda",
    texto:"Crie um objetivo: reserva de emergência, viagem, entrada do apê… ou cadastre onde seu dinheiro está investido (poupança, CDB, Tesouro, LCI…).",
    acoes:h`<button class="btn" data-a="inv-nova">${I("plus","p")} Nova poupança ou investimento</button>`})}</div>`;
  const pctTotal=ct.metas?Math.min(100,Math.max(0,ct.guardado/ct.metas*100)):0;
  return h`<div class="card hero secao"><span class="cap">Guardado</span>
      <div class="grande">${R(ct.guardado)}</div>
      <div class="fraco">${ct.metas?h`de ${R(ct.metas)} em metas${ct.batidas?h` · <span class="up">${ct.batidas} meta${ct.batidas>1?"s":""} batida${ct.batidas>1?"s":""}</span>`:""}`:"sem metas definidas"}
        ${ct.rendeMes?h` · rende ~<b style="color:var(--ink)">${R(ct.rendeMes)}/mês</b>`:""}</div>
      ${ct.metas?h`<div class="barra up" style="margin-top:12px"><i style="width:${pctTotal}%"></i></div>`:""}</div>
    <div class="btns" style="justify-content:space-between;margin-bottom:14px"><div class="fraco peq">Toque num investimento para depositar, retirar ou registrar o rendimento.</div>
      <button class="btn peq" data-a="inv-nova">${I("plus","p")} Nova poupança ou investimento</button></div>
    <div class="grade g3 secao">${juntar(ct.itens,({conta:c,est:e,meta:m})=>h`<div class="card kpi tap inv"${clic("inv-abrir",c.id)}>
      <span class="cap"><span class="ponto" style="background:${c.cor}"></span>${c.nome}</span>
      <b class="${L.saldoConta(c.id)<0?"down":""}">${R(L.saldoConta(c.id,hoje()))}</b>
      <span class="s">${PRODUTOS[e.perfil.produto]?.rot||"Investimento"}${e.calcula||e.perfil.indexador!=="NENHUM"?" · "+rotuloTaxa(e.perfil):""}${c.instituicao?" · "+c.instituicao:""}</span>
      ${m.alvo?h`<div class="barra ${m.batida?"up":""}" style="margin-top:8px"><i style="width:${m.pct}%"></i></div>
        <span class="s">${Math.round(m.pct)}% de ${R(m.alvo)} · ${prazoMeta(m)}</span>`:""}
      <span class="s ${e.calcula?"up":""}">${rende(e)}</span></div>`)}</div>
    ${aviso(h`O rendimento é uma <b>estimativa</b>, com CDI de ${pctTxt(ix.cdi)}% ao ano, Selic de ${pctTxt(ix.selic)}%, IPCA de ${pctTxt(ix.ipca)}% e TR de ${pctTxt(ix.tr)}% ao mês.
      Ele não entra no saldo sozinho: o valor real depende do banco e dos impostos. <a class="link" data-a="ir" data-v="ajustes">Atualizar os índices</a>`,{tipo:"info",icone:"bulb"})}`;
}});

acao("inv-nova",()=>app.formConta(null,{tipo:"RESERVA"}));
acao("inv-abrir",el=>abrirInvestimento(el.dataset.id));
function abrirInvestimento(id){
  const L=app.L, c=L.contas.get(id); if(!c) return;
  const e=rendimentoEstimado(L,c), m=progressoMeta(L,c), saldo=L.saldoConta(id,hoje());
  const rz=razao(L,K.conta(id)).linhas.slice(-12).reverse();
  abrirPainel({id:"inv:"+id,titulo:c.nome,sub:(PRODUTOS[e.perfil.produto]?.rot||"Investimento")+" · "+rotuloTaxa(e.perfil)+(c.instituicao?" · "+c.instituicao:""),
    corpo:h`<div class="resumo"><div><span class="cap">Guardado</span><b>${R(saldo)}</b></div>
        <div><span class="cap">Rende/mês</span><b class="${e.calcula?"up":""}">${e.calcula?"~"+R(e.mesLiquido):"—"}</b></div>
        <div><span class="cap">Rende/ano</span><b class="${e.calcula?"up":""}">${e.calcula?"~"+R(e.anoLiquido):"—"}</b></div></div>
      ${m.alvo?h`<div class="barra ${m.batida?"up":""}"><i style="width:${m.pct}%"></i></div>
        <div class="fraco peq" style="margin:6px 0 14px">${Math.round(m.pct)}% de ${R(m.alvo)} · ${prazoMeta(m)}${c.reserva?.aporte?" · guardando "+R(c.reserva.aporte)+" por mês":""}</div>`:""}
      <div class="fraco peq" style="margin-bottom:14px">${e.calcula?h`Estimativa sobre o saldo de hoje${e.ir?h`, já descontado o IR de ${pctTxt(e.ir*100)}% (${e.dias} dias desde o primeiro depósito; cai para 15% depois de 2 anos)`:", isento de IR"}. Não entra no saldo: quando o banco pagar, registre o valor real.`
        :"Sem cálculo automático. O saldo muda com os depósitos, as retiradas e os rendimentos que você registrar."}</div>
      <div class="btns" style="margin-bottom:18px">
        <button class="btn peq" data-a="inv-dep" data-id="${id}">${I("plus","p")} Depósito</button>
        <button class="btn peq sec" data-a="inv-ret" data-id="${id}">− Retirada</button>
        <button class="btn peq sec" data-a="inv-rend" data-id="${id}">${I("trendUp","p")} Registrar rendimento</button>
        <button class="btn peq fant" data-a="conta-editar" data-id="${id}">Editar</button></div>
      <div class="bloco"><div class="cap">${I("history","p")} Movimentações</div>
        ${rz.length?h`<div class="card lista">${juntar(rz,x=>h`<div class="clic"${x.lanc.pagamento?clic("pag-abrir",x.lanc.pagamento):x.lanc.documento?clic("doc-abrir",x.lanc.documento):""}>
          <span class="bola ${x.valor>0?"up":"down"}">${I(x.valor>0?"coin":"outflow","p")}</span>
          <div class="meio"><div class="t">${x.descricao}</div><div class="s">${fmtData(x.data)}</div></div>
          <div class="dir num" style="font-weight:600">${Rs(x.valor)}</div></div>`)}</div>`:h`<div class="fraco peq">Nenhuma movimentação ainda.</div>`}</div>`});
}

/* ── depósito, retirada e rendimento ── */
function contasDoDia(excluir){ return app.L.contasAtivas().filter(c=>c.id!==excluir&&DISPONIVEL.has(c.tipo)); }
function formMovimento(id,tipo){
  const L=app.L, c=L.contas.get(id), dep=tipo==="dep", outras=contasDoDia(id);
  if(!outras.length){ toast("Cadastre a conta de onde o dinheiro sai (conta corrente, carteira…) em Cadastros → Contas.",{erro:true}); return; }
  const padrao=outras.some(x=>x.id===contaPadrao())?contaPadrao():outras[0].id;
  abrirPainel({titulo:(dep?"Depósito em ":"Retirada de ")+c.nome,estreito:true,id:"inv-mov",corpo:h`<form data-f="inv-mov" data-id="${id}" data-tipo="${tipo}">
    <div class="linha2">${campo("Valor",valorInput("valor"))}${campo("Data",h`<input type="date" name="data" value="${hoje()}" required>`)}</div>
    ${outras.length>1?campo(dep?"Sai de":"Volta para",h`<select name="outra">${juntar(outras,x=>h`<option value="${x.id}"${x.id===padrao?raw(" selected"):""}>${x.nome} · ${R(L.saldoConta(x.id))}</option>`)}</select>`)
      :h`<input type="hidden" name="outra" value="${outras[0].id}"><div class="fraco peq" style="margin-bottom:12px">${dep?"Sai de":"Volta para"} ${outras[0].nome}.</div>`}
    ${aviso(dep?"É uma transferência: sai da conta do dia a dia e entra no investimento. Não conta como despesa.":"É uma transferência: sai do investimento e volta para a conta do dia a dia. Não conta como receita.",{tipo:"info",icone:"swap"})}
    <button class="btn larg" type="submit" style="margin-top:14px">${dep?"Depositar":"Retirar"}</button></form>`});
}
acao("inv-dep",el=>formMovimento(el.dataset.id,"dep"));
acao("inv-ret",el=>formMovimento(el.dataset.id,"ret"));
form("inv-mov",(f,d)=>{
  const id=f.dataset.id, dep=f.dataset.tipo==="dep", c=app.L.contas.get(id), outra=d.get("outra");
  return executar(()=>C.criarTransferencia(app.L,{de:dep?outra:id,para:dep?id:outra,valor:centavos(d.get("valor")),data:d.get("data"),
    descricao:(dep?"Depósito · ":"Retirada · ")+c.nome}),{ok:dep?"Depósito registrado":"Retirada registrada",depois:()=>abrirInvestimento(id)});
});
acao("inv-rend",el=>{
  const L=app.L, id=el.dataset.id, c=L.contas.get(id), e=rendimentoEstimado(L,c);
  abrirPainel({titulo:"Rendimento de "+c.nome,estreito:true,id:"inv-rend",corpo:h`<form data-f="inv-rend" data-id="${id}">
    <div class="linha2">${campo("Valor que rendeu",valorInput("valor",e.calcula?e.mesLiquido:0),e.calcula?"Veio com a estimativa do mês. Confira no extrato do banco.":"")}
      ${campo("Data",h`<input type="date" name="data" value="${hoje()}" required>`)}</div>
    ${aviso("Entra como receita (Rendimentos) e soma no saldo do investimento.",{tipo:"info",icone:"trendUp"})}
    <button class="btn larg" type="submit" style="margin-top:14px">Registrar rendimento</button></form>`});
});
form("inv-rend",(f,d)=>{
  const L=app.L, id=f.dataset.id, c=L.contas.get(id);
  const cat=L.categoriasAtivas("RECEITA").find(x=>x.nome.toLowerCase()==="rendimentos");
  return executar(()=>C.criarDocumento(L,{tipo:"RECEBER",descricao:"Rendimento · "+c.nome,valor:centavos(d.get("valor")),data:d.get("data"),
    categoria:cat?.id||null,conta:id,forma:"transferencia",quitar:{data:d.get("data"),conta:id,forma:"transferencia"}}),
    {ok:"Rendimento registrado",depois:()=>abrirInvestimento(id)});
});
