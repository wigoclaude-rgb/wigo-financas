/* Transferências: um documento, um lançamento com as duas pernas. As
   planejadas vêm primeiro, porque são as que pedem ação. */
import { app, tela, filtro, render, aoMudar } from "../base.js";
import { h, raw, juntar } from "../html.js";
import { I, R, fmtData, chipSt, tabela } from "../componentes.js";
import { clic, seletorPeriodo, intervalo } from "../util.js";
import { soma } from "../../nucleo/dinheiro.js";

tela("transferencias",{titulo:"Transferências",grupo:"Financeiro",render(app){
  const L=app.L, f=filtro("transferencias",{periodo:"tudo"});
  const {de,ate}=intervalo(f.periodo,f.de,f.ate);
  const xs=[...L.documentos.values()].filter(d=>d.tipo==="TRANSFERENCIA"&&(!de||d.data>=de)&&(!ate||d.data<=ate))
    .sort((a,b)=>(a.status==="PLANEJADA")!==(b.status==="PLANEJADA")?(a.status==="PLANEJADA"?-1:1):a.data<b.data?1:-1);
  return h`<div class="btns" style="justify-content:space-between;margin-bottom:14px"><div class="fraco">Dinheiro trocando de conta: não é receita nem despesa, e o total não muda.</div>
      <button class="btn peq" data-a="trf-nova">${I("plus","p")} Nova transferência</button></div>
    <div class="filtros">${seletorPeriodo(f,"transferencias")}</div>
    <div class="card">${tabela({linhas:xs,vazioTxt:"Nenhuma transferência",clic:d=>String(clic("doc-abrir",d.id)),classeLinha:d=>d.status==="CANCELADO"?"fraca":"",
      colunas:[{rot:"Data",nw:true,cel:d=>fmtData(d.data)},{rot:"Descrição",cel:d=>h`<div class="t">${d.descricao}</div><div class="sub"><span class="num-doc">${d.numero}</span></div>`},
        {rot:"De",oc:true,cel:d=>L.nomeConta(d.conta)},{rot:"Para",oc:true,cel:d=>L.nomeConta(d.contaDestino)},
        {rot:"Situação",cel:d=>chipSt(L.estadoDocumento(d).status)},{rot:"Valor",r:true,cel:d=>h`<b>${R(d.valor)}</b>`}]})}</div>`;
}});
