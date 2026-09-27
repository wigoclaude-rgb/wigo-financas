/* ══════════ MOVIMENTAÇÕES ══════════
   Todo dinheiro que se moveu, em qualquer conta, direto do razão. Uma linha
   por movimento de conta (e, se pedir, por compra no cartão). É a resposta
   para "o que aconteceu com meu dinheiro" — sem regra própria de saldo. */
import { app, tela, filtro, render, renderParte, aoDigitar, aoMudar, acao } from "../base.js";
import { h, raw, juntar } from "../html.js";
import { I, R, fmtData, chip, tabela, vazio } from "../componentes.js";
import { clic, seletorPeriodo, intervalo, opcoesContas } from "../util.js";
import { razao } from "../../financas/relatorios.js";
import { normalizar } from "../../nucleo/texto.js";
import { soma, numero } from "../../nucleo/dinheiro.js";

function linhas(L,f){
  const {de,ate}=intervalo(f.periodo,f.de,f.ate);
  const chaves=f.conta?[f.conta.startsWith("card:")?"C:"+f.conta.slice(5):"A:"+f.conta]
    :[...L.contas.values()].map(c=>"A:"+c.id).concat(f.cartoes?[...L.cartoes.values()].map(c=>"C:"+c.id):[]);
  let out=[];
  for(const k of chaves){
    const nomeConta=k.startsWith("A:")?L.nomeConta(k.slice(2)):"Cartão "+L.nomeCartao(k.slice(2));
    for(const x of razao(L,k,{de,ate}).linhas){
      /* no cartão, o que interessa aqui é a compra (a dívida nova), não a
         contrapartida do pagamento — que já aparece do lado da conta */
      if(k.startsWith("C:")&&x.valor>0&&x.natureza==="PAGAMENTO") continue;
      out.push({...x,chave:k,nomeConta,cartao:k.startsWith("C:"),valor:k.startsWith("C:")?-x.valor:x.valor});
    }
  }
  if(f.tipo==="ent") out=out.filter(x=>x.valor>0); else if(f.tipo==="sai") out=out.filter(x=>x.valor<0);
  if(f.conc==="sim") out=out.filter(x=>x.conciliado); else if(f.conc==="nao") out=out.filter(x=>!x.conciliado&&!x.cartao);
  if(f.q){ const q=normalizar(f.q), qv=f.q.replace(/[^\d,]/g,"");
    out=out.filter(x=>normalizar(x.descricao+" "+x.numero+" "+x.referencia+" "+L.nomeParceiro(x.parceiro)+" "+x.nomeConta).includes(q)||
      (qv.length>=2&&numero(Math.abs(x.valor)).replace(/\./g,"").includes(qv.replace(/\./g,"")))); }
  return out.sort((a,b)=>a.data<b.data?1:a.data>b.data?-1:(a.lanc.criadoEm<b.lanc.criadoEm?1:-1));
}
function lista(L,f){
  const ls=linhas(L,f), corte=ls.slice(0,500);
  const ent=soma(ls.filter(x=>x.valor>0),x=>x.valor), sai=-soma(ls.filter(x=>x.valor<0),x=>x.valor);
  return h`${tabela({linhas:corte,vazioTxt:f.q||f.tipo||f.conc?"Nenhum movimento com esses filtros":"Nenhum movimento no período",
    clic:x=>String(x.lanc.pagamento?clic("pag-abrir",x.lanc.pagamento):x.lanc.documento?clic("doc-abrir",x.lanc.documento):""),
    classeLinha:x=>x.estornado?"fraca":"",
    colunas:[
      {rot:"Data",nw:true,cel:x=>fmtData(x.data)},
      {rot:"Descrição",cel:x=>h`<div class="t">${x.descricao}</div><div class="sub"><span class="num-doc">${x.numero}</span>${x.referencia?" · "+x.referencia:""}${x.parceiro?" · "+L.nomeParceiro(x.parceiro):""}</div>`},
      {rot:"Conta",oc:true,cel:x=>h`<span class="fraco">${x.nomeConta}</span>`},
      {rot:"",oc:true,cel:x=>x.estornado?chip(x.natureza==="ESTORNO"?"estorno":"estornado","atencao"):x.conciliado?chip("conciliado","bom"):""},
      {rot:"Valor",r:true,cel:x=>h`<b class="${x.valor>0?"up":""}">${x.valor>0?"+":"−"}${R(Math.abs(x.valor))}</b>`}
    ],
    rodape:ls.length?h`<td colspan="2">${ls.length} movimento${ls.length>1?"s":""}${ls.length>500?" (mostrando 500)":""}</td><td class="oc"></td><td class="oc"></td><td class="r"><span class="up">+${R(ent)}</span> · <span>−${R(sai)}</span></td>`:""})}`;
}
tela("movimentos",{titulo:"Movimentações",grupo:"Todas as contas",render(app){
  const L=app.L, f=filtro("movimentos",{periodo:"mes",conta:"",tipo:"",conc:"",q:"",cartoes:false});
  if(!L.contas.size) return h`<div class="card">${vazio({icone:"bank",titulo:"Nenhuma conta ainda",texto:"Movimentações são o dinheiro entrando e saindo das suas contas.",acoes:h`<button class="btn" data-a="conta-nova">Cadastrar conta</button>`})}</div>`;
  return h`<div class="filtros">
      <input type="search" class="busca" placeholder="Buscar descrição, documento, parceiro, valor…" value="${f.q}" data-i="mov-q">
      ${seletorPeriodo(f,"movimentos")}
      <select data-c="mov-f" data-k="conta">${opcoesContas(f.conta,{cartoes:true})}</select>
      <select data-c="mov-f" data-k="tipo"><option value="">Entradas e saídas</option><option value="ent"${f.tipo==="ent"?raw(" selected"):""}>Só entradas</option><option value="sai"${f.tipo==="sai"?raw(" selected"):""}>Só saídas</option></select>
      <select data-c="mov-f" data-k="conc"><option value="">Conciliados ou não</option><option value="sim"${f.conc==="sim"?raw(" selected"):""}>Conciliados</option><option value="nao"${f.conc==="nao"?raw(" selected"):""}>Não conciliados</option></select>
      <label class="check peq"><input type="checkbox" data-c="mov-cartoes"${f.cartoes?raw(" checked"):""}> Incluir compras no cartão</label>
    </div>
    <div class="card" data-parte="mov">${lista(L,f)}</div>`;
}});
aoDigitar("mov-q",el=>{ const f=app.f.movimentos; f.q=el.value; renderParte("mov",lista(app.L,f)); });
aoMudar("mov-f",el=>{ app.f.movimentos[el.dataset.k]=el.value; render(); });
aoMudar("mov-cartoes",el=>{ app.f.movimentos.cartoes=el.checked; render(); });
