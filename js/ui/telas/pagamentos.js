/* ══════════ PAGAMENTOS / RECEBIMENTOS ══════════
   A lista das liquidações — cada uma com o que quitou. Estorno aparece como
   pagamento próprio (negativo), ao lado do original marcado: nada some. */
import { app, tela, filtro, render, renderParte, aoDigitar, aoMudar } from "../base.js";
import { h, raw, juntar } from "../html.js";
import { I, R, fmtData, chip, tabela, vazio } from "../componentes.js";
import { clic, seletorPeriodo, intervalo, opcoesContas, opcoesParceiro } from "../util.js";
import { FORMAS } from "../../financas/modelo.js";
import { normalizar } from "../../nucleo/texto.js";
import { soma } from "../../nucleo/dinheiro.js";

function lista(L,dir,f){
  const {de,ate}=intervalo(f.periodo,f.de,f.ate);
  let xs=[...L.pagamentos.values()].filter(p=>p.direcao===dir&&(!de||p.data>=de)&&(!ate||p.data<=ate));
  if(f.conta) xs=xs.filter(p=>p.conta===f.conta);
  if(f.pn) xs=xs.filter(p=>p.parceiro===f.pn||p.alocacoes.some(a=>L.documentos.get(a.documento)?.parceiro===f.pn));
  if(f.tipo==="fatura") xs=xs.filter(p=>p.cartao); else if(f.tipo==="contas") xs=xs.filter(p=>!p.cartao);
  if(f.q){ const q=normalizar(f.q); xs=xs.filter(p=>normalizar(p.numero+" "+p.descricao+" "+L.nomeParceiro(p.parceiro)+" "+p.alocacoes.map(a=>L.documentos.get(a.documento)?.numero).join(" ")).includes(q)); }
  xs.sort((a,b)=>a.data<b.data?1:a.data>b.data?-1:(a.criadoEm<b.criadoEm?1:-1));
  return h`${tabela({linhas:xs.slice(0,500),vazioTxt:"Nenhum "+(dir==="SAIDA"?"pagamento":"recebimento")+" no período",
    clic:p=>String(clic("pag-abrir",p.id)),classeLinha:p=>L.pagamentoEstornado(p)||p.estornoDe?"fraca":"",
    colunas:[{rot:"Data",nw:true,cel:p=>fmtData(p.data)},
      {rot:"Descrição",cel:p=>h`<div class="t">${p.descricao}</div><div class="sub"><span class="num-doc">${p.numero}</span> · ${p.alocacoes.length} item${p.alocacoes.length>1?"s":""}${p.parceiro?" · "+L.nomeParceiro(p.parceiro):""}</div>`},
      {rot:"Conta",oc:true,cel:p=>p.conta?L.nomeConta(p.conta):"—"},{rot:"Forma",oc:true,cel:p=>FORMAS[p.forma]||"—"},
      {rot:"",oc:true,cel:p=>L.pagamentoEstornado(p)?chip("estornado","ruim"):p.estornoDe?chip("estorno","atencao"):p.cartao?chip("fatura","acc"):""},
      {rot:"Valor",r:true,cel:p=>h`<b>${R(p.valor)}</b>`}],
    rodape:xs.length?h`<td colspan="2">${xs.length} registro${xs.length>1?"s":""}</td><td class="oc"></td><td class="oc"></td><td class="oc"></td><td class="r">${R(soma(xs,p=>p.valor))}</td>`:""})}`;
}
function def(dir){
  const nome=dir==="SAIDA"?"pagamentos":"recebimentos";
  return {titulo:dir==="SAIDA"?"Pagamentos":"Recebimentos",grupo:"Financeiro",render(app){
    const L=app.L, f=filtro(nome,{periodo:"mes",conta:"",pn:"",tipo:"",q:""});
    return h`<div class="btns" style="justify-content:space-between;margin-bottom:14px"><div class="fraco">${dir==="SAIDA"?"Cada saída de dinheiro que quitou uma conta ou fatura.":"Cada entrada de dinheiro que quitou algo a receber."}</div>
      <button class="btn peq" data-a="pag-novo" data-v="${dir}">${I("plus","p")} ${dir==="SAIDA"?"Registrar pagamento":"Registrar recebimento"}</button></div>
      <div class="filtros"><input type="search" class="busca" placeholder="Buscar número, descrição, documento…" value="${f.q}" data-i="pg-q" data-tela="${nome}">
        ${seletorPeriodo(f,nome)}<select data-c="pg-f" data-k="conta" data-tela="${nome}">${opcoesContas(f.conta)}</select>
        <select data-c="pg-f" data-k="pn" data-tela="${nome}">${opcoesParceiro(f.pn,{todos:true})}</select>
        ${dir==="SAIDA"?h`<select data-c="pg-f" data-k="tipo" data-tela="${nome}"><option value="">Contas e faturas</option><option value="contas"${f.tipo==="contas"?raw(" selected"):""}>Só contas</option><option value="fatura"${f.tipo==="fatura"?raw(" selected"):""}>Só faturas</option></select>`:""}</div>
      <div class="card" data-parte="pg">${lista(L,dir,f)}</div>`;
  }};
}
tela("pagamentos",def("SAIDA")); tela("recebimentos",def("ENTRADA"));
aoDigitar("pg-q",el=>{ const n=el.dataset.tela, f=app.f[n]; f.q=el.value; renderParte("pg",lista(app.L,n==="pagamentos"?"SAIDA":"ENTRADA",f)); });
aoMudar("pg-f",el=>{ app.f[el.dataset.tela][el.dataset.k]=el.value; render(); });
