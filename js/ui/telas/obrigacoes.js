/* ══════════ CONTAS A PAGAR / A RECEBER ══════════
   Uma linha por PARCELA — é a parcela que vence e que é paga. O documento
   aparece junto (AP-000012 · 2/3) e abre com um clique. Selecionar várias e
   "Registrar pagamento" leva direto ao formulário com elas marcadas: um
   pagamento só pode quitar várias, de vários documentos. */
import { app, tela, filtro, selecao, render, renderParte, aoDigitar, aoMudar, acao } from "../base.js";
import { h, raw, juntar } from "../html.js";
import { I, R, fmtData, chipSt, chipStLado, kpi, tabela, vazio } from "../componentes.js";
import { clic, opcoesParceiro, opcoesCategoria, opcoesContas, seletorPeriodo, intervalo, PERIODOS_VENC } from "../util.js";
import { faixas } from "../../financas/relatorios.js";
import { hoje, diasEntre } from "../../nucleo/datas.js";
import { normalizar } from "../../nucleo/texto.js";
import { soma, centavos, numero } from "../../nucleo/dinheiro.js";

const SIT=[["abertas","Em aberto"],["vencidas","Vencidas"],["hoje","Vence hoje"],["7","7 dias"],["30","30 dias"],["parciais","Parciais"],["pagas","Pagas"],["canceladas","Canceladas"],["todas","Todas"]];
function itens(L,lado,f){
  const h0=hoje(); const {de,ate}=intervalo(f.periodo,f.de,f.ate);
  let xs=L.obrigacoes(lado);
  xs=xs.filter(({doc,p,e})=>{
    switch(f.sit){
      case "abertas": if(e.restante<=0||doc.status==="CANCELADO") return false; break;
      case "vencidas": if(!e.vencida) return false; break;
      case "hoje": if(e.restante<=0||p.vencimento!==h0) return false; break;
      case "7": { const d=diasEntre(h0,p.vencimento); if(e.restante<=0||d<0||d>7) return false; break; }
      case "30": { const d=diasEntre(h0,p.vencimento); if(e.restante<=0||d<0||d>30) return false; break; }
      case "parciais": if(!e.parcial) return false; break;
      case "pagas": if(e.status!=="PAGA") return false; break;
      case "canceladas": if(doc.status!=="CANCELADO") return false; break;
    }
    if(de&&p.vencimento<de) return false; if(ate&&p.vencimento>ate) return false;
    if(f.pn==="-"){ if(doc.parceiro) return false; } else if(f.pn&&doc.parceiro!==f.pn) return false;
    if(f.cat&&doc.categoria!==f.cat&&L.grupoCategoria(doc.categoria)!==f.cat) return false;
    if(f.conta&&doc.conta!==f.conta) return false;
    if(f.min&&p.valor<centavos(f.min)) return false; if(f.max&&p.valor>centavos(f.max)) return false;
    if(f.q){ const q=normalizar(f.q), qv=f.q.replace(/[^\d,]/g,"");
      if(!normalizar(doc.numero+" "+doc.descricao+" "+L.nomeParceiro(doc.parceiro)+" "+L.nomeCategoria(doc.categoria)).includes(q)&&
        !(qv.length>=2&&numero(p.valor).replace(/\./g,"").includes(qv.replace(/\./g,"")))) return false; }
    return true;
  });
  const ord={venc:(a,b)=>a.p.vencimento<b.p.vencimento?-1:a.p.vencimento>b.p.vencimento?1:0,
    valor:(a,b)=>b.e.restante-a.e.restante,pn:(a,b)=>L.nomeParceiro(a.doc.parceiro).localeCompare(L.nomeParceiro(b.doc.parceiro),"pt-BR"),
    doc:(a,b)=>a.doc.numero<b.doc.numero?-1:1};
  return xs.sort(ord[f.ord]||ord.venc);
}
/* de onde veio: o reembolso aponta para a compra; a despesa de outra pessoa, para quem devolve */
function origem(L,d){
  if(d.reembolsoDe){ const c=L.documentos.get(d.reembolsoDe); return h` · <span class="terc">${I("link","p")} reembolso de ${c?.numero||"compra"}</span>`; }
  if(d.terceiro) return h` · <span class="terc">${I("handshake","p")} de ${L.nomeParceiro(d.terceiro.pessoa)}</span>`;
  return "";
}
function grade(L,lado,f,sel){
  const xs=itens(L,lado,f), corte=xs.slice(0,500), receber=lado==="RECEBER";
  const selecionaveis=corte.filter(x=>x.e.restante>0);
  const todos=selecionaveis.length&&selecionaveis.every(x=>sel.has(x.p.id));
  return tabela({linhas:corte,vazioTxt:"Nada com esses filtros",
    sel:x=>x.e.restante>0?{on:sel.has(x.p.id),acao:"obr-pick",id:x.p.id}:{on:false,acao:"",id:""},
    marcaTodos:{on:todos,acao:"obr-todos"},
    clic:x=>String(clic("doc-abrir",x.doc.id)),
    classeLinha:x=>x.doc.status==="CANCELADO"?"fraca":"",
    colunas:[
      {rot:"Documento",cel:x=>h`<div class="t">${x.doc.descricao}</div><div class="sub"><span class="num-doc">${x.doc.numero}</span>${x.doc.parcelas.length>1?" · "+x.p.n+"/"+x.p.de:""}${origem(L,x.doc)}</div>`},
      {rot:receber?"Pagador":"Parceiro",oc:true,cel:x=>x.doc.parceiro?L.nomeParceiro(x.doc.parceiro):h`<span class="muito-fraco">—</span>`},
      {rot:"Data",oc:true,nw:true,cel:x=>fmtData(x.doc.data)},
      {rot:"Vencimento",nw:true,cartao:"vence",cel:x=>h`<span class="${x.e.vencida?"down":""}">${fmtData(x.p.vencimento)}</span>`},
      {rot:"Original",r:true,oc:true,cel:x=>R(x.p.valor)},
      {rot:receber?"Recebido":"Pago",r:true,oc:true,cel:x=>x.e.pago?R(x.e.pago):h`<span class="muito-fraco">—</span>`},
      {rot:"Restante",r:true,cel:x=>h`<b>${R(x.e.restante)}</b>`},
      {rot:"Situação",cel:x=>chipStLado(x.e.status,receber)}
    ],
    rodape:xs.length?h`<td colspan="4">${xs.length} parcela${xs.length>1?"s":""}${xs.length>500?" · mostrando 500":""}</td><td class="r oc">${R(soma(xs,x=>x.p.valor))}</td><td class="r oc">${R(soma(xs,x=>x.e.pago))}</td><td class="r">${R(soma(xs,x=>x.e.restante))}</td><td></td>`:""});
}
function telaObrig(lado){
  const nome=lado==="PAGAR"?"pagar":"receber", receber=lado==="RECEBER";
  return {titulo:receber?"Contas a receber":"Contas a pagar",grupo:"Documentos",render(app){
    const L=app.L, f=filtro(nome,{sit:"abertas",periodo:"ate30",pn:"",cat:"",conta:"",q:"",ord:"venc",min:"",max:""}), sel=selecao(nome);
    const fx=faixas(L,lado);
    const pagosMes=[...L.pagamentos.values()].filter(p=>p.direcao===(receber?"ENTRADA":"SAIDA")&&!p.cartao&&p.data.slice(0,7)===hoje().slice(0,7)).reduce((s,p)=>s+p.valor,0);
    const k=(rot,v,n,sit,tom="")=>kpi({rotulo:rot,valor:R(v),sub:n!=null?n+" parcela"+(n===1?"":"s"):"",acao:"obr-sit",v:sit,tom,cls:f.sit===sit&&f.periodo==="tudo"?"on":""});
    return h`<div class="btns" style="justify-content:space-between;margin-bottom:14px">
        <div class="fraco">${receber?"Tudo que alguém ainda vai te pagar.":"Tudo que você ainda vai pagar — menos as compras no cartão, que vivem nas faturas."}</div>
        <div class="btns"><button class="btn sec peq" data-a="obr-csv" data-v="${lado}">${I("download","p")} Exportar</button>
        <button class="btn peq" data-a="doc-novo" data-v="${lado}">${I("plus","p")} ${receber?"Nova receita":"Nova despesa"}</button></div></div>
      <div class="kpis rolar secao">
        ${k("Em aberto",fx.total,fx.n,"abertas")}${k("Vencido",fx.vencido,fx.nVencido,"vencidas",fx.vencido?"down":"")}
        ${k("Vence hoje",fx.hoje,fx.nHoje,"hoje")}${k("Próximos 7 dias",fx.sete,fx.nSete,"7")}${k("Próximos 30 dias",fx.trinta,fx.nTrinta,"30")}
        ${k("Parcialmente "+(receber?"recebido":"pago"),fx.parcial,fx.nParcial,"parciais")}
        ${kpi({rotulo:(receber?"Recebido":"Pago")+" este mês",valor:R(pagosMes),sub:"",acao:"obr-sit",v:"pagas",cls:f.sit==="pagas"?"on":""})}
      </div>
      <div class="filtros">
        <input type="search" class="busca" placeholder="Buscar documento, descrição, parceiro, valor…" value="${f.q}" data-i="obr-q" data-tela="${nome}">
        <select data-c="obr-f" data-k="sit" data-tela="${nome}">${juntar(SIT,([k,r])=>h`<option value="${k}"${f.sit===k?raw(" selected"):""}>${r}</option>`)}</select>
        ${seletorPeriodo(f,nome,{opcoes:PERIODOS_VENC})}
        <select data-c="obr-f" data-k="pn" data-tela="${nome}">${opcoesParceiro(f.pn,{todos:true})}<option value="-"${f.pn==="-"?raw(" selected"):""}>Sem parceiro</option></select>
        <select data-c="obr-f" data-k="cat" data-tela="${nome}">${opcoesCategoria(receber?"RECEITA":"DESPESA",f.cat,{filtro:true})}</select>
        <select data-c="obr-f" data-k="conta" data-tela="${nome}">${opcoesContas(f.conta)}</select>
        <input class="valor" style="width:110px;height:36px" placeholder="Valor mín." value="${f.min}" data-c="obr-f" data-k="min" data-tela="${nome}">
        <input class="valor" style="width:110px;height:36px" placeholder="Valor máx." value="${f.max}" data-c="obr-f" data-k="max" data-tela="${nome}">
        <select data-c="obr-f" data-k="ord" data-tela="${nome}"><option value="venc">Por vencimento</option><option value="valor"${f.ord==="valor"?raw(" selected"):""}>Por valor</option><option value="pn"${f.ord==="pn"?raw(" selected"):""}>Por parceiro</option><option value="doc"${f.ord==="doc"?raw(" selected"):""}>Por documento</option></select>
      </div>
      <div class="card" data-parte="obr">${grade(L,lado,f,sel)}</div>`;
  },
  barraSelecao(app){
    const sel=selecao(nome); if(!sel.size) return null;
    const xs=[...sel].map(id=>app.L.ix.parcela.get(id)).filter(Boolean).map(r=>({...r,e:app.L.estadoParcela(r.p,r.doc)}));
    const total=soma(xs,x=>x.e.restante), venc=xs.filter(x=>x.e.vencida).length;
    return h`<div class="info">${xs.length} selecionada${xs.length>1?"s":""}${venc?h` · <span style="color:#ff8fa3">${venc} vencida${venc>1?"s":""}</span>`:""}<br><b>${R(total)}</b></div>
      <button class="btn peq" data-a="obr-pagar" data-v="${lado}">${I("check","p")} Registrar ${receber?"recebimento":"pagamento"}</button>
      <button class="btn peq sec" data-a="obr-limpar" data-v="${nome}">Limpar</button>`;
  }};
}
tela("pagar",telaObrig("PAGAR"));
tela("receber",telaObrig("RECEBER"));
const nomeAtual=()=>app.rota.nome;
/* os cartões de total mostram tudo, então clicar num deles tira o recorte de período */
acao("obr-sit",el=>{ const f=app.f[nomeAtual()]; f.sit=el.dataset.v; f.periodo="tudo"; render(); });
aoMudar("obr-f",el=>{ app.f[el.dataset.tela][el.dataset.k]=el.value; selecao(el.dataset.tela).clear(); render(); });
aoDigitar("obr-q",el=>{ const n=el.dataset.tela, f=app.f[n]; f.q=el.value; renderParte("obr",grade(app.L,n==="pagar"?"PAGAR":"RECEBER",f,selecao(n))); });
acao("obr-pick",el=>{ const n=nomeAtual(), s=selecao(n); s.has(el.dataset.id)?s.delete(el.dataset.id):s.add(el.dataset.id);
  renderParte("obr",grade(app.L,n==="pagar"?"PAGAR":"RECEBER",app.f[n],s)); });
acao("obr-todos",()=>{ const n=nomeAtual(), s=selecao(n), xs=itens(app.L,n==="pagar"?"PAGAR":"RECEBER",app.f[n]).slice(0,500).filter(x=>x.e.restante>0);
  if(xs.every(x=>s.has(x.p.id))) s.clear(); else xs.forEach(x=>s.add(x.p.id));
  renderParte("obr",grade(app.L,n==="pagar"?"PAGAR":"RECEBER",app.f[n],s)); });
acao("obr-limpar",el=>{ selecao(el.dataset.v).clear(); render(); });
acao("obr-pagar",el=>{ const n=nomeAtual(), ids=[...selecao(n)];
  app.abrirFormPagamento({direcao:el.dataset.v==="RECEBER"?"ENTRADA":"SAIDA",parceiro:"*",parcelas:ids}); selecao(n).clear(); });
acao("obr-csv",el=>{
  const lado=el.dataset.v, n=lado==="PAGAR"?"pagar":"receber", L=app.L, xs=itens(L,lado,app.f[n]);
  const cab=["Documento","Parcela","Descrição","Parceiro","Categoria","Data","Vencimento","Original","Pago","Restante","Situação"];
  const f=v=>String(v??"").replace(/;/g,",");
  const linhas=xs.map(x=>[x.doc.numero,x.p.n+"/"+x.p.de,f(x.doc.descricao),f(L.nomeParceiro(x.doc.parceiro)),f(L.nomeCategoria(x.doc.categoria)),
    x.doc.data,x.p.vencimento,numero(x.p.valor),numero(x.e.pago),numero(x.e.restante),x.e.status].join(";"));
  baixar("WIGO_"+n+"_"+hoje()+".csv","﻿"+[cab.join(";"),...linhas].join("\n"),"text/csv;charset=utf-8");
});
export function baixar(nome,conteudo,tipo){
  const b=new Blob([conteudo],{type:tipo}), a=document.createElement("a");
  a.href=URL.createObjectURL(b); a.download=nome; document.body.appendChild(a); a.click(); setTimeout(()=>{ URL.revokeObjectURL(a.href); a.remove(); },500);
}
