/* ══════════ FATURAS ══════════
   A fatura é o conjunto das parcelas daquele mês no cartão (ver cartoes.js).
   Aqui ela aparece como documento: datas, total, pago, restante, as compras
   com parcela e total da compra, e os pagamentos que a liquidaram. */
import { app, tela, ir, acao } from "../base.js";
import { h, raw, juntar } from "../html.js";
import { I, R, fmtData, fmtDataCurta, chipSt, chipStLado, chip, kpi, rotuloMes, rotuloMesCurto, vazio, aviso, tabela } from "../componentes.js";
import { clic } from "../util.js";
import { faturasDoCartao, fatura, faturaCorrente, limiteCartao, divisaoDaFatura } from "../../financas/cartoes.js";
import { hoje, addMesesMes } from "../../nucleo/datas.js";
import { FORMAS } from "../../financas/modelo.js";

tela("faturas",{titulo:app=>app.rota.params[1]?"Fatura":"Faturas",grupo:"Documentos",nav:"faturas",render(app){
  const L=app.L, [cid,ref]=app.rota.params;
  const cartoes=L.cartoesAtivos();
  if(!cartoes.length) return h`<div class="card">${vazio({icone:"card",titulo:"Nenhum cartão cadastrado",texto:"Cadastre o cartão para registrar compras e acompanhar as faturas.",acoes:h`<button class="btn" data-a="cartao-novo">Cadastrar cartão</button>`})}</div>`;
  if(cid&&ref) return detalhe(L,cid,ref);
  return juntar(cartoes,c=>{
    const fs=faturasDoCartao(L,c.id), atual=faturaCorrente(c), lim=limiteCartao(L,c.id);
    /* o que pede ação primeiro (vencida, atual, próximas, em ordem de
       vencimento); depois o histórico pago, do mais recente para trás */
    const abertas=fs.filter(f=>f.restante>0||f.ref===atual).sort((a,b)=>a.vencimento<b.vencimento?-1:1);
    const pagas=fs.filter(f=>f.restante<=0&&f.itens.length&&f.ref!==atual).reverse();
    const visiveis=[...abertas,...pagas];
    return h`<div class="secao"><div class="sec-cab"><div><h2 class="t2" style="display:flex;align-items:center;gap:8px"><span class="ponto" style="background:${c.cor}"></span>${c.nome}</h2>
      <div class="fraco peq">Fecha dia ${c.fechamento} · vence dia ${c.vencimento}${lim.limite!=null?" · limite "+R(lim.limite)+", livre "+R(lim.disponivel):""}</div></div>
      <div class="btns"><button class="btn sec peq" data-a="ir" data-v="cartoes" data-p="${c.id}">Cartão</button><button class="btn peq" data-a="doc-novo" data-v="COMPRA_CARTAO">${I("plus","p")} Compra</button></div></div>
      <div class="card">${tabela({linhas:visiveis,vazioTxt:"Sem faturas",clic:f=>' data-a="ir" data-v="faturas" data-p="'+c.id+"|"+f.ref+'"',
        colunas:[{rot:"Fatura",cel:f=>{ const terc=f.itens.filter(i=>i.doc.terceiro).reduce((s,i)=>s+i.p.valor,0);
            return h`<div class="t">${rotuloMes(f.ref)}${f.ref===atual?h` ${chip("atual","acc")}`:""}</div><div class="sub">${f.itens.length} lançamento${f.itens.length===1?"":"s"}${terc?" · "+R(terc)+" de terceiros":""}</div>`; }},
          {rot:"Fecha",oc:true,nw:true,cel:f=>fmtData(f.fechamento)},{rot:"Vence",nw:true,cartao:"vence",cel:f=>fmtData(f.vencimento)},
          {rot:"Total",r:true,cel:f=>h`<b>${R(f.total)}</b>`},{rot:"Pago",r:true,oc:true,cel:f=>f.pago?R(f.pago):"—"},{rot:"Falta",r:true,oc:true,cel:f=>f.restante>0?R(f.restante):"—"},
          {rot:"Situação",cel:f=>chipSt(f.status)}]})}</div></div>`;
  });
}});
function detalhe(L,cid,ref){
  const c=L.cartoes.get(cid); if(!c) return vazio({titulo:"Cartão não encontrado"});
  const f=fatura(L,cid,ref);
  const pags=[...L.pagamentos.values()].filter(p=>p.alocacoes.some(a=>f.itens.some(i=>i.p.id===a.parcela))).sort((a,b)=>a.data<b.data?-1:1);
  const ant=addMesesMes(ref,-1), prox=addMesesMes(ref,1);
  return h`<div class="btns" style="justify-content:space-between;margin-bottom:14px">
      <div class="btns"><button class="btn fant peq" data-a="ir" data-v="faturas">${I("undo","p")} Todas</button>
        <button class="btn sec peq" data-a="ir" data-v="faturas" data-p="${cid}|${ant}">‹ ${rotuloMesCurto(ant)}</button>
        <button class="btn sec peq" data-a="ir" data-v="faturas" data-p="${cid}|${prox}">${rotuloMesCurto(prox)} ›</button></div>
      ${f.restante>0?h`<button class="btn" data-a="fatura-pagar" data-id="${cid}|${ref}">${I("check")} Pagar fatura</button>`:""}</div>
    <div class="card hero" style="margin-bottom:18px"><div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap"><span class="cap">${c.nome} · fatura de ${rotuloMes(ref)}</span>${chipSt(f.status)}</div>
      <div class="grande">${R(f.restante>0?f.restante:f.total)}</div>
      <div class="fraco">${f.restante>0&&f.pago?"falta pagar, de "+R(f.total):f.restante<=0&&f.total?"total pago":"total da fatura"}</div>
      <div class="linhas"><div><span class="cap">Fecha</span><b>${fmtData(f.fechamento)}</b></div><div><span class="cap">Vence</span><b>${fmtData(f.vencimento)}</b></div>
        <div><span class="cap">Total</span><b>${R(f.total)}</b></div><div><span class="cap">Pago</span><b>${R(f.pago)}</b></div></div></div>
    ${f.creditos?aviso(h`Esta fatura tem ${R(f.creditos)} em estornos ainda não usados; eles abatem o valor no pagamento.`,{tipo:"info"}):""}
    ${divisao(L,f)}
    <div class="secao"><div class="sec-cab"><h2 class="t2">Lançamentos</h2></div><div class="card">${tabela({linhas:f.itens,vazioTxt:"Nenhuma compra nesta fatura",
      clic:i=>String(clic("doc-abrir",i.doc.id)),
      colunas:[{rot:"Data",nw:true,cel:i=>fmtDataCurta(i.doc.data)},
        {rot:"Compra",cel:i=>h`<div class="t">${i.doc.descricao}</div><div class="sub"><span class="num-doc">${i.doc.numero}</span>${i.doc.parceiro?" · "+L.nomeParceiro(i.doc.parceiro):""}${i.doc.terceiro?h` · <span class="terc">${I("handshake","p")} de ${L.nomeParceiro(i.doc.terceiro.pessoa)}</span>`:""}</div>`},
        {rot:"Parcela",nw:true,cel:i=>i.doc.parcelas.length>1||i.p.de>1?i.p.n+"/"+i.p.de:"à vista"},
        {rot:"Categoria",oc:true,cel:i=>L.nomeCategoria(i.doc.categoria)||"—"},
        {rot:"Total da compra",r:true,oc:true,cel:i=>i.p.de>1?R(i.doc.valor):"—"},
        {rot:"Valor",r:true,cel:i=>h`<b class="${i.sinal<0?"up":""}">${i.sinal<0?"−":""}${R(i.p.valor)}</b>`}]})}</div></div>
    <div class="secao"><div class="sec-cab"><h2 class="t2">Pagamentos desta fatura</h2></div>
      ${pags.length?h`<div class="card lista">${juntar(pags,p=>h`<div class="clic"${clic("pag-abrir",p.id)}><span class="bola ${p.estornoDe?"warn":"down"}">${I(p.estornoDe?"undo":"check","p")}</span>
        <div class="meio"><div class="t">${p.numero} · ${fmtData(p.data)}</div><div class="s">${p.conta?L.nomeConta(p.conta):"crédito de estorno"} · ${FORMAS[p.forma]||""}</div></div>
        <div class="dir num" style="font-weight:600">${R(p.valor)}</div></div>`)}</div>`:h`<div class="fraco">Nenhum pagamento registrado.</div>`}</div>`;
}
/* O que é meu e o que é dos outros nesta fatura. O total é o do banco e
   não muda; a divisão é leitura das compras (divisaoDaFatura). */
function divisao(L,f){
  const dv=divisaoDaFatura(L,f); if(!dv.terceiros) return "";
  return h`<div class="secao"><div class="sec-cab"><div><h2 class="t2">${I("handshake")} De quem é esta fatura</h2>
      <div class="fraco peq">O total não muda: é o que o banco cobra. Aqui se vê o que é seu e o que outras pessoas vão te devolver. Compra parcelada entra com a parcela do mês; o a receber é da compra inteira.</div></div></div>
    <div class="kpis" style="margin-bottom:12px">${kpi({rotulo:"Total da fatura",valor:R(dv.total)})}${kpi({rotulo:"Minhas despesas",valor:R(dv.minhas)})}
      ${kpi({rotulo:"De terceiros",valor:R(dv.terceiros)})}${kpi({rotulo:"A receber dessas compras",valor:R(dv.aReceber),sub:dv.devolvido?R(dv.devolvido)+" já devolvido":"nada devolvido ainda"})}</div>
    <div class="card">${tabela({linhas:dv.pessoas,
      clic:x=>x.compras.length===1?String(clic("doc-abrir",x.compras[0].terceiro.receber)):' data-a="ir" data-v="parceiros" data-p="'+x.pessoa+'"',
      colunas:[{rot:"Pessoa",cel:x=>h`<div class="t">${L.nomeParceiro(x.pessoa)}</div><div class="sub">${x.compras.length} compra${x.compras.length>1?"s":""}${x.total!==x.nestaFatura?" · "+R(x.total)+" no total":""}</div>`},
        {rot:"Nesta fatura",r:true,cel:x=>h`<b>${R(x.nestaFatura)}</b>`},
        {rot:"Já devolveu",r:true,oc:true,cel:x=>x.devolvido?h`<span class="up">${R(x.devolvido)}</span>`:"—"},
        {rot:"Falta devolver",r:true,cel:x=>x.falta?R(x.falta):chipStLado("PAGA",true)}],
      rodape:h`<td>Total</td><td class="r"><b>${R(dv.terceiros)}</b></td><td class="r oc">${R(dv.devolvido)}</td><td class="r">${R(dv.aReceber)}</td>`})}</div></div>`;
}
