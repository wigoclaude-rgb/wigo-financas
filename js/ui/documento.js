/* ══════════ DOCUMENTO E PAGAMENTO ══════════
   Resumo primeiro; depois parcelas, pagamentos, lançamentos e histórico —
   a cadeia inteira de "o que aconteceu" até "qual conta mexeu". Só aparecem
   as ações que o estado permite: documento pago não oferece "editar valor",
   oferece "estornar". */
import { app, acao, abrirPainel, fecharPainel, executar, toast, ir } from "./base.js";
import { h, raw, juntar } from "./html.js";
import { I, R, Rs, chipSt, chipStLado, chip, fmtData, rotuloMes, rotuloMesCurto, aviso, valorCor } from "./componentes.js";
import { clic, rotuloTipo } from "./util.js";
import { DOC, COM_PARCELAS, DO_CARTAO, FORMAS, CATEGORIA_SISTEMA, K } from "../financas/modelo.js";
import * as C from "../financas/comandos.js";
import { datasFatura } from "../financas/cartoes.js";
import { hoje } from "../nucleo/datas.js";

const ORIGEM={MANUAL:"Digitado",IMPORTACAO:"Importado do extrato",MIGRACAO:"Migrado do 2.2",RECORRENCIA:"Recorrência mensal",SISTEMA:"Sistema"};
/* nome amigável de uma chave do razão */
export function nomeChave(k){
  const L=app.L, t=k[0], id=k.slice(2);
  if(t==="A") return L.nomeConta(id);
  if(t==="C") return "Cartão "+L.nomeCartao(id);
  if(t==="P") return "A pagar"+(id!=="-"?" · "+L.nomeParceiro(id):"");
  if(t==="R") return "A receber"+(id!=="-"?" · "+L.nomeParceiro(id):"");
  if(t==="E") return "Despesa · "+(CATEGORIA_SISTEMA[id]||L.nomeCategoria(id)||"sem categoria");
  if(t==="I") return "Receita · "+(CATEGORIA_SISTEMA[id]||L.nomeCategoria(id)||"sem categoria");
  if(k===K.ABERTURA) return "Contrapartida do saldo inicial";
  if(k===K.AJUSTE) return "Ajuste de saldo";
  return k;
}
const NATUREZA={DOCUMENTO:"Reconhecimento",PAGAMENTO:"Pagamento",TRANSFERENCIA:"Transferência",ABERTURA:"Saldo inicial",
  AJUSTE:"Ajuste",ESTORNO:"Estorno",RECLASSIFICACAO:"Reclassificação"};
function blocoLancamentos(lancs){
  if(!lancs.length) return h`<div class="fraco peq">Nenhum lançamento — um documento planejado só mexe no razão quando é efetivado.</div>`;
  return juntar(lancs,l=>{ const est=app.L.lancamentoEstornado(l);
    return h`<div class="card" style="margin-bottom:8px;padding:10px 12px">
      <div style="display:flex;justify-content:space-between;gap:8px;margin-bottom:6px"><span class="peq"><b>${NATUREZA[l.natureza]||l.natureza}</b> · ${fmtData(l.data)} · competência ${rotuloMesCurto(l.competencia)}</span>
      ${est?chip("estornado"):l.natureza==="ESTORNO"?chip("estorno","atencao"):""}</div>
      ${juntar(l.linhas,x=>h`<div style="display:flex;justify-content:space-between;gap:8px;font-size:13px;padding:2px 0">
        <span class="${x.k.startsWith("A:")?"":"fraco"}">${nomeChave(x.k)} ${x.conc?h`<span class="chip bom" style="height:18px">conciliado</span>`:""}</span>
        <span class="num">${x.v>0?"D ":"C "}${R(Math.abs(x.v))}</span></div>`)}</div>`; });
}
async function carregarHistorico(ids){
  const alvo=document.getElementById("historicoDoc"); if(!alvo) return;
  try{ const hs=await app.repo.historico(ids);
    alvo.innerHTML=String(hs.length?h`<div class="linha-tempo">${juntar(hs,x=>h`<div><div class="peq"><b>${x.resumo}</b></div>
      <div class="muito-fraco peq">${new Date(x.em).toLocaleString("pt-BR")}</div>
      ${(x.mudancas||[]).length?h`<div class="fraco peq">${juntar(x.mudancas,m=>h`<div>${m.campo}: ${String(m.de??"—")} → ${String(m.para??"—")}</div>`)}</div>`:""}</div>`)}</div>`
      :h`<div class="fraco peq">Sem registros de auditoria (itens migrados do 2.2 começam o histórico na migração).</div>`); }
  catch(e){ alvo.innerHTML=String(h`<div class="fraco peq">Histórico indisponível agora (${e.message}).</div>`); }
}

app.abrirDocumento=function(id){
  const L=app.L, d=L.documentos.get(id); if(!d){ toast("Documento não encontrado",{erro:true}); return; }
  const e=L.estadoDocumento(d);
  const cancelado=d.status==="CANCELADO", parcelado=COM_PARCELAS.has(d.tipo), noCartao=DO_CARTAO.has(d.tipo);
  const pags=L.pagamentosDoDocumento(d);
  const lancs=[...L.lancamentosDoDocumento(d.id),...pags.flatMap(p=>L.lancamentosDoPagamento(p.id))]
    .sort((a,b)=>a.criadoEm<b.criadoEm?-1:1);
  const receber=d.tipo===DOC.RECEBER;
  /* o vínculo com a outra pessoa, visto dos dois lados */
  const reemb=d.terceiro?L.documentos.get(d.terceiro.receber):null, origem=d.reembolsoDe?L.documentos.get(d.reembolsoDe):null;
  const resumo=parcelado?h`<div class="resumo"><div><span class="cap">Valor</span><b>${R(d.valor)}</b></div>
      <div><span class="cap">${receber?"Recebido":noCartao?"Pago na fatura":"Pago"}</span><b>${R(e.pago)}</b></div>
      <div><span class="cap">Restante</span><b class="${e.restante>0?(e.status==="VENCIDA"?"down":""):"up"}">${R(e.restante)}</b></div></div>`
    :d.tipo===DOC.TRANSF?h`<div class="resumo"><div><span class="cap">Valor</span><b>${R(d.valor)}</b></div>
      <div><span class="cap">De</span><b>${L.nomeConta(d.conta)}</b></div><div><span class="cap">Para</span><b>${L.nomeConta(d.contaDestino)}</b></div></div>`
    :h`<div class="resumo"><div><span class="cap">Valor</span><b>${Rs(d.valor)}</b></div><div><span class="cap">Conta</span><b>${L.nomeConta(d.conta)}</b></div>
      <div><span class="cap">Data</span><b>${fmtData(d.data)}</b></div></div>`;
  const meta=[
    [origem?"Pessoa":noCartao?"Estabelecimento":"Parceiro",d.parceiro?h`<a class="link" data-a="ir" data-v="parceiros" data-p="${d.parceiro}">${L.nomeParceiro(d.parceiro)}</a>`:"—"],
    d.valorOriginal?["Compra original",R(d.valorOriginal)+" em "+d.parcelas[0].de+"x · "+(d.parcelas[0].n-1)+" paga"+(d.parcelas[0].n>2?"s":"")+" antes de entrar no WIGO"]:null,
    d.terceiro?["Responsável",h`<a class="link" data-a="ir" data-v="parceiros" data-p="${d.terceiro.pessoa}">${L.nomeParceiro(d.terceiro.pessoa)}</a> (terceiro)`]:null,
    origem?null:["Categoria",L.nomeCategoria(d.categoria)||"—"],
    ["Data do documento",fmtData(d.data)],["Competência",rotuloMes(d.competencia)],
    parcelado&&!noCartao?["Próximo vencimento",e.proximoVencimento?fmtData(e.proximoVencimento):"—"]:null,
    noCartao?["Cartão",h`<a class="link" data-a="ir" data-v="cartoes" data-p="${d.cartao}">${L.nomeCartao(d.cartao)}</a>`]:null,
    parcelado&&!noCartao&&!origem?["Conta prevista",d.conta?L.nomeConta(d.conta):"—"]:null,
    /* no reembolso, forma e origem são as da compra, que o aviso do topo já mostra */
    origem?null:["Forma",FORMAS[d.forma]||"—"],origem?null:["Origem",ORIGEM[d.origem]||d.origem],
    d.recorrencia?["Recorrência",(d.sequencia?"ocorrência "+d.sequencia:"")]:null
  ].filter(Boolean);
  const tabParcelas=parcelado?h`<div class="bloco"><div class="cap">${I("split","p")} Parcelas</div><div class="card"><div class="tab-wrap"><table class="tab cartoes">
    <thead><tr><th>Parcela</th><th>${noCartao?"Fatura":"Vencimento"}</th><th class="r">Valor</th><th class="r">${receber?"Recebido":"Pago"}</th><th class="r">Restante</th><th>Situação</th><th></th></tr></thead>
    <tbody>${juntar(e.parcelas,({p,e:pe})=>h`<tr><td class="nw" data-r="Parcela">${p.n}/${p.de}</td>
      <td class="nw">${noCartao?h`<a class="link" data-a="ir" data-v="faturas" data-p="${d.cartao}|${p.fatura}">${rotuloMesCurto(p.fatura)}</a> <span class="fraco peq">vence ${fmtData(p.vencimento)}</span>`:fmtData(p.vencimento)}</td>
      <td class="r oc">${R(p.valor)}</td><td class="r oc">${pe.pago?R(pe.pago):"—"}</td><td class="r"><span class="cel-only fraco peq">${pe.restante?"resta ":""}</span>${pe.restante?R(pe.restante):h`<span class="cel-only">${R(p.valor)}</span><span class="oc-inline">—</span>`}</td>
      <td>${chipStLado(pe.status,receber)}</td>
      <td class="r">${!cancelado&&pe.restante>0&&!noCartao?h`<button class="btn peq sec" data-a="pag-parcela" data-id="${p.id}">${receber?"Receber":"Pagar"}</button>`:""}
        ${!cancelado&&noCartao&&!pe.pago?h`<button class="btn peq fant" data-a="parcela-mover" data-id="${p.id}" title="Mover para outra fatura">${I("swap","p")}</button>`:""}</td></tr>`)}</tbody>
    ${e.juros||e.desconto?h`<tfoot><tr><td colspan="7" class="peq">${e.juros?h`Juros e multas: ${R(e.juros)} `:""}${e.desconto?h`· Descontos: ${R(e.desconto)}`:""}</td></tr></tfoot>`:""}
    </table></div></div></div>`:"";
  const blocoPags=parcelado?h`<div class="bloco"><div class="cap">${I("check","p")} Pagamentos</div>${pags.length?h`<div class="card lista">${juntar(pags,pg=>{
      const est=L.pagamentoEstornado(pg);
      return h`<div class="clic"${clic("pag-abrir",pg.id)}><span class="bola ${pg.estornoDe?"warn":receber?"up":"down"}">${I(pg.estornoDe?"undo":"check","p")}</span>
        <div class="meio"><div class="t">${pg.numero} · ${pg.estornoDe?"estorno":fmtData(pg.data)}</div><div class="s">${pg.conta?L.nomeConta(pg.conta):"sem movimento de conta"} · ${FORMAS[pg.forma]||"—"}</div></div>
        <div class="dir"><div class="num" style="font-weight:600">${R(pg.valor)}</div>${est?chip("estornado"):""}</div></div>`; })}</div>`:h`<div class="fraco peq">Nenhum pagamento ainda.</div>`}</div>`:"";
  const blocoVinculo=reemb?(()=>{ const er=L.estadoDocumento(reemb), quem=L.nomeParceiro(reemb.parceiro);
      return h`<div class="bloco"><div class="cap">${I("handshake","p")} Reembolso</div>
        ${reemb.status==="CANCELADO"?aviso(h`A conta a receber ${reemb.numero} foi cancelada.`,{tipo:"ruim"}):h`<div class="card pad vinculo">
          <div>Este lançamento gerou um contas a receber de <b>${R(reemb.valor)}</b>: ${quem} devolve ${reemb.parcelas.length>1?"em "+reemb.parcelas.length+" parcelas":"de uma vez"}.</div>
          <div class="resumo" style="margin:10px 0"><div><span class="cap">Devolvido</span><b class="${er.pago?"up":""}">${R(er.pago)}</b></div>
            <div><span class="cap">Falta</span><b>${R(er.restante)}</b></div><div><span class="cap">Situação</span><b>${chipStLado(er.status,true)}</b></div></div>
          <div class="btns">${!cancelado&&er.restante>0?h`<button class="btn peq" data-a="pag-doc" data-id="${reemb.id}">${I("coin","p")} Registrar recebimento</button>`:""}
            <button class="btn sec peq" data-a="doc-abrir" data-id="${reemb.id}">${I("link","p")} Ver ${reemb.numero}</button></div></div>`}
        ${noCartao?h`<div class="fraco peq" style="margin-top:6px">A fatura continua com o valor total: o cartão controla a dívida com o banco; a conta a receber, a dívida de ${quem} com você.</div>`:""}</div>`; })():"";
  const blocoOrigem=origem?aviso(h`<b>Origem: ${DO_CARTAO.has(origem.tipo)?"compra realizada no cartão "+L.nomeCartao(origem.cartao):"despesa paga por você"}.</b>
      ${origem.numero} · ${origem.descricao} · ${R(origem.valor)}${origem.parcelas.length>1?" em "+origem.parcelas.length+"x":""} em ${fmtData(origem.data)}.
      <a class="link" data-a="doc-abrir" data-id="${origem.id}">Abrir ${origem.numero}</a>
      <div class="fraco peq" style="margin-top:4px">Receber é dinheiro que volta: não conta como receita.</div>`,{tipo:"info",icone:"link"}):"";
  const acoes=[];
  if(!cancelado){
    if(parcelado&&!noCartao&&e.restante>0) acoes.push(h`<button class="btn" data-a="pag-doc" data-id="${d.id}">${I("check")} ${receber?"Registrar recebimento":"Registrar pagamento"}</button>`);
    if(noCartao&&e.restante>0){ const p0=e.parcelas.find(x=>x.e.restante>0)?.p; if(p0) acoes.push(h`<button class="btn sec" data-a="ir" data-v="faturas" data-p="${d.cartao}|${p0.fatura}">${I("card")} Ver fatura</button>`); }
    if(d.tipo===DOC.TRANSF&&d.status==="PLANEJADA") acoes.push(h`<button class="btn" data-a="trf-efetivar" data-id="${d.id}">${I("check")} Marcar como feita</button>`);
    acoes.push(h`<button class="btn sec" data-a="doc-editar" data-id="${d.id}">Editar</button>`);
    /* a conta a receber de um reembolso não se duplica nem se cancela
       sozinha: ela segue a compra */
    if(parcelado&&!origem) acoes.push(h`<button class="btn sec" data-a="doc-duplicar" data-id="${d.id}">${I("copy","p")} Duplicar</button>`);
    const temPag=parcelado&&e.pago!==0;
    const rot=!parcelado&&d.status!=="PLANEJADA"?"Estornar":temPag?"Estornar e cancelar":"Cancelar";
    if(!origem||origem.status==="CANCELADO") acoes.push(h`<button class="btn fant" data-a="doc-cancelar" data-id="${d.id}" style="color:var(--down)">${rot}</button>`);
  }
  abrirPainel({id:"doc:"+d.id,
    topo:h`<div class="doc-cab"><div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap"><span class="doc-num">${d.numero}</span>${chip(origem?"Reembolso":rotuloTipo(d.tipo),"acc")}${chipStLado(e.status,receber)}${d.terceiro?chip("de "+L.nomeParceiro(d.terceiro.pessoa)):""}${L.documentoConciliado(d)?chip("conciliado","bom"):""}</div></div>`,
    titulo:d.descricao,
    corpo:h`${cancelado?aviso(h`<b>Cancelado em ${fmtData(d.canceladoEm)}.</b> ${d.motivoCancelamento||""} O documento e os estornos continuam no histórico.`,{tipo:"ruim"}):""}
      ${blocoOrigem}${resumo}<div class="meta-doc">${juntar(meta,([r,v])=>h`<div><span class="cap">${r}</span><b>${v}</b></div>`)}</div>
      ${d.obs?h`<div class="fraco peq" style="margin-top:8px">${d.obs}</div>`:""}
      ${blocoVinculo}${tabParcelas}${blocoPags}
      <div class="bloco"><div class="cap">${I("ledger","p")} Lançamentos no razão</div>${blocoLancamentos(lancs)}</div>
      <div class="bloco"><div class="cap">${I("history","p")} Histórico</div><div id="historicoDoc"><div class="sk" style="height:40px"></div></div></div>`,
    rodape:acoes.length?raw(acoes.map(String).join("")):""});
  carregarHistorico([d.id,...pags.map(p=>p.id)]);
};

app.abrirPagamento=function(id){
  const L=app.L, pg=L.pagamentos.get(id); if(!pg) return;
  const est=L.pagamentoEstornado(pg), entrada=pg.direcao==="ENTRADA";
  const lancs=L.lancamentosDoPagamento(pg.id);
  abrirPainel({id:"pag:"+id,
    topo:h`<div style="display:flex;gap:8px;align-items:center"><span class="doc-num">${pg.numero}</span>${chip(entrada?"Recebimento":"Pagamento","acc")}${est?chip("estornado","ruim"):pg.estornoDe?chip("estorno","atencao"):chipSt("EFETIVADA")}</div>`,
    titulo:pg.descricao||pg.numero,
    corpo:h`${pg.estornoDe?aviso(h`Estorno de ${L.pagamentos.get(pg.estornoDe)?.numero||"—"}: ${pg.obs||""}`,{tipo:"info"}):""}
      <div class="resumo"><div><span class="cap">${entrada?"Entrou":"Saiu"}</span><b>${R(Math.abs(pg.valor))}</b></div>
      <div><span class="cap">Data</span><b>${fmtData(pg.data)}</b></div><div><span class="cap">Conta</span><b>${pg.conta?L.nomeConta(pg.conta):"—"}</b></div></div>
      <div class="meta-doc"><div><span class="cap">Forma</span><b>${FORMAS[pg.forma]||"—"}</b></div><div><span class="cap">Parceiro</span><b>${pg.parceiro?L.nomeParceiro(pg.parceiro):"—"}</b></div>
      ${pg.cartao?h`<div><span class="cap">Fatura</span><b>${L.nomeCartao(pg.cartao)} · ${pg.fatura||""}</b></div>`:""}</div>
      <div class="bloco"><div class="cap">${I("link","p")} O que este ${entrada?"recebimento":"pagamento"} liquidou</div>
      <div class="card lista">${juntar(pg.alocacoes,a=>{ const d=L.documentos.get(a.documento), p=d?.parcelas.find(x=>x.id===a.parcela);
        return h`<div class="clic"${clic("doc-abrir",a.documento)}><div class="meio"><div class="t">${d?.numero} · ${d?.descricao}</div>
          <div class="s">parcela ${p?.n}/${p?.de}${a.juros?h` · juros ${R(a.juros)}`:""}${a.desconto?h` · desconto ${R(a.desconto)}`:""}</div></div>
          <div class="dir num" style="font-weight:600">${R(a.valor)}</div></div>`; })}</div></div>
      <div class="bloco"><div class="cap">${I("ledger","p")} Lançamento no razão</div>${blocoLancamentos(lancs)}</div>
      <div class="bloco"><div class="cap">${I("history","p")} Histórico</div><div id="historicoDoc"><div class="sk" style="height:40px"></div></div></div>`,
    rodape:!est&&!pg.estornoDe?h`<button class="btn fant" data-a="pag-estornar" data-id="${pg.id}" style="color:var(--down)">${I("undo","p")} Estornar</button>`:""});
  carregarHistorico([pg.id]);
};
acao("doc-abrir",el=>app.abrirDocumento(el.dataset.id));
acao("pag-abrir",el=>app.abrirPagamento(el.dataset.id));

/* ── pedir motivo (e data) antes de estornar/cancelar ── */
function pedirMotivo({titulo,texto,botao,data,aoConfirmar,perigo=true}){
  abrirPainel({titulo,estreito:true,id:"motivo",corpo:h`<form data-f="motivo" id="fMotivo">
    <p class="fraco" style="margin-top:0">${texto}</p>
    <div class="campo"><label>Motivo</label><input name="motivo" required placeholder="Ex.: lançado em dobro"></div>
    ${data?h`<div class="campo"><label>Data do estorno</label><input type="date" name="data" value="${data}" required>
      <span class="ajuda">A data do original é o padrão: o caso comum é "registrei errado". Mude se o dinheiro voltou depois.</span></div>`:""}
    <button class="btn larg ${perigo?"perigo":""}" type="submit">${botao}</button></form>`});
  app._motivo=aoConfirmar;
}
import { form } from "./base.js";
form("motivo",(f,d)=>app._motivo&&app._motivo(d.get("motivo"),d.get("data")));

acao("doc-cancelar",el=>{
  const d=app.L.documentos.get(el.dataset.id), parc=COM_PARCELAS.has(d.tipo);
  const temPag=parc&&app.L.estadoDocumento(d).pago!==0;
  const caixa=!parc&&d.status!=="PLANEJADA";
  const r=d.terceiro?app.L.documentos.get(d.terceiro.receber):null;
  const junto=r&&r.status!=="CANCELADO"?" A conta a receber "+r.numero+" de "+app.L.nomeParceiro(r.parceiro)+" é cancelada junto.":"";
  pedirMotivo({titulo:(caixa?"Estornar ":temPag?"Estornar e cancelar ":"Cancelar ")+d.numero,
    texto:(caixa?"Um lançamento com as linhas invertidas anula o efeito no saldo. O original fica no histórico.":
      temPag?"Os pagamentos deste documento serão estornados (voltam para a conta) e o documento fica cancelado. Nada é apagado.":
      "O documento fica cancelado e sai de contas a pagar/receber. Nada é apagado.")+junto,
    botao:caixa?"Estornar":temPag?"Estornar e cancelar":"Cancelar documento", data:caixa||temPag?d.data:null,
    aoConfirmar:(motivo,data)=>executar(()=>C.cancelarDocumento(app.L,d.id,{motivo,data,estornarPagamentos:temPag}),
      {ok:caixa?"Estornado":"Documento cancelado"})});
});
acao("pag-estornar",el=>{
  const pg=app.L.pagamentos.get(el.dataset.id);
  const conc=app.L.lancamentosDoPagamento(pg.id).some(l=>l.linhas.some(x=>x.conc));
  pedirMotivo({titulo:"Estornar "+pg.numero,texto:h`O dinheiro volta para ${pg.conta?app.L.nomeConta(pg.conta):"a conta"} e as parcelas voltam a ficar em aberto. ${conc?h`<b>Atenção: este pagamento já foi conciliado com o extrato do banco.</b>`:""}`,
    botao:"Estornar pagamento",data:pg.data,aoConfirmar:(motivo,data)=>executar(()=>C.estornarPagamento(app.L,pg.id,{motivo,data}),{ok:"Pagamento estornado"})});
});
acao("trf-efetivar",el=>executar(()=>C.efetivarTransferencia(app.L,el.dataset.id,{data:hoje()}),{ok:"Transferência registrada"}));
acao("parcela-mover",el=>{
  const r=app.L.ix.parcela.get(el.dataset.id); if(!r) return;
  const {doc,p}=r, c=app.L.cartoes.get(doc.cartao);
  const refs=[-2,-1,1,2,3].map(n=>{ const [y,m]=p.fatura.split("-").map(Number); const dt=new Date(y,m-1+n,1);
    return dt.getFullYear()+"-"+String(dt.getMonth()+1).padStart(2,"0"); });
  abrirPainel({titulo:"Mover parcela "+p.n+"/"+p.de,sub:doc.descricao,estreito:true,id:"mover",corpo:h`<form data-f="mover-parcela" data-doc="${doc.id}" data-parcela="${p.id}">
    <p class="fraco" style="margin-top:0">Hoje ela está na fatura de ${rotuloMes(p.fatura)}. Use quando o banco lançou a compra em outra fatura.</p>
    <div class="campo"><label>Fatura</label><select name="fatura">${juntar(refs,r=>h`<option value="${r}">${rotuloMes(r)} · vence ${fmtData(datasFatura(c,r).vencimento)}</option>`)}</select></div>
    <button class="btn larg" type="submit">Mover</button></form>`});
});
form("mover-parcela",(f,d)=>executar(()=>C.editarDocumento(app.L,f.dataset.doc,{faturas:[{parcela:f.dataset.parcela,fatura:d.get("fatura")}]}),{ok:"Parcela movida"}));
