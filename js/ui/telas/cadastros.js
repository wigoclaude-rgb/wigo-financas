/* ══════════ CADASTROS ══════════
   Parceiros de negócio, contas, cartões e categorias. Cada ficha mostra a
   posição financeira vinda do livro — nunca um saldo digitado. */
import { app, tela, filtro, render, renderParte, aoDigitar, acao, ir } from "../base.js";
import { h, raw, juntar } from "../html.js";
import { I, R, Rs, fmtData, chipSt, chip, kpi, tabela, vazio, aviso, rotuloMes, rotuloMesCurto, barrasRanking } from "../componentes.js";
import { clic } from "../util.js";
import { saldosParceiros, razao, relatorioCartoes, resultado } from "../../financas/relatorios.js";
import { faturasDoCartao, limiteCartao, faturaCorrente } from "../../financas/cartoes.js";
import { TIPO_CONTA, TIPO_PN, DISPONIVEL, K, DOC } from "../../financas/modelo.js";
import { normalizar } from "../../nucleo/texto.js";
import { hoje, mesDe, inicioDoMes, fimDoMes, addMesesMes } from "../../nucleo/datas.js";
import { soma } from "../../nucleo/dinheiro.js";

/* ═════════ PARCEIROS ═════════ */
function listaParceiros(L,f){
  const saldos=new Map(saldosParceiros(L).map(x=>[x.parceiro,x]));
  let ps=[...L.parceiros.values()].filter(p=>f.arq?p.ativo===false:p.ativo!==false);
  if(f.q){ const q=normalizar(f.q); ps=ps.filter(p=>normalizar(p.nome+" "+(p.documento||"")+" "+(p.email||"")).includes(q)); }
  ps.sort((a,b)=>a.nome.localeCompare(b.nome,"pt-BR"));
  return tabela({linhas:ps,vazioTxt:"Nenhum parceiro",clic:p=>' data-a="ir" data-v="parceiros" data-p="'+p.id+'"',
    colunas:[{rot:"Nome",cel:p=>h`<div class="t">${p.nome}</div><div class="sub">${TIPO_PN[p.tipo]||""}${p.documento?" · "+p.documento:""}</div>`},
      {rot:"A pagar",r:true,cel:p=>{ const s=saldos.get(p.id); return s?.aPagar?R(s.aPagar):h`<span class="muito-fraco">—</span>`; }},
      {rot:"A receber",r:true,oc:true,cel:p=>{ const s=saldos.get(p.id); return s?.aReceber?R(s.aReceber):h`<span class="muito-fraco">—</span>`; }},
      {rot:"Vencido",r:true,oc:true,cel:p=>{ const s=saldos.get(p.id), v=(s?.vencidoPagar||0)+(s?.vencidoReceber||0); return v?h`<span class="down">${R(v)}</span>`:h`<span class="muito-fraco">—</span>`; }},
      {rot:"Saldo",r:true,oc:true,cel:p=>{ const s=saldos.get(p.id); return s?.saldo?h`<b class="${s.saldo>0?"up":"down"}">${Rs(s.saldo)}</b>`:"—"; }}]});
}
tela("parceiros",{titulo:app=>app.rota.params[0]?(app.L.parceiros.get(app.rota.params[0])?.nome||"Parceiro"):"Parceiros de negócio",grupo:"Cadastros",nav:"parceiros",render(app){
  const L=app.L, id=app.rota.params[0];
  if(id) return fichaParceiro(L,id);
  const f=filtro("parceiros",{q:"",arq:false});
  return h`<div class="btns" style="justify-content:space-between;margin-bottom:14px"><div class="fraco">Quem te paga e a quem você paga: clientes, fornecedores, pessoas.</div>
      <div class="btns"><label class="check peq"><input type="checkbox" data-a="pn-arq"${f.arq?raw(" checked"):""}> Arquivados</label><button class="btn peq" data-a="parceiro-novo">${I("plus","p")} Novo parceiro</button></div></div>
    <div class="filtros"><input type="search" class="busca" placeholder="Buscar nome, CPF/CNPJ, e-mail…" value="${f.q}" data-i="pn-q"></div>
    <div class="card" data-parte="pn">${listaParceiros(L,f)}</div>`;
}});
aoDigitar("pn-q",el=>{ app.f.parceiros.q=el.value; renderParte("pn",listaParceiros(app.L,app.f.parceiros)); });
acao("pn-arq",()=>{ app.f.parceiros.arq=!app.f.parceiros.arq; render(); });
function fichaParceiro(L,id){
  const p=L.parceiros.get(id); if(!p) return vazio({titulo:"Parceiro não encontrado"});
  const s=saldosParceiros(L).find(x=>x.parceiro===id)||{aPagar:0,aReceber:0,vencidoPagar:0,vencidoReceber:0,pago:0,recebido:0,saldo:0};
  const docs=[...L.documentos.values()].filter(d=>d.parceiro===id).sort((a,b)=>a.data<b.data?1:-1);
  const abertos=docs.filter(d=>d.status!=="CANCELADO"&&L.estadoDocumento(d).restante>0);
  const pags=[...L.pagamentos.values()].filter(pg=>pg.parceiro===id||pg.alocacoes.some(a=>L.documentos.get(a.documento)?.parceiro===id)).sort((a,b)=>a.data<b.data?1:-1);
  /* extrato do parceiro: o que ele deve e o que se deve a ele, com saldo acumulado */
  const rzR=razao(L,K.receber(id)), rzP=razao(L,K.pagar(id));
  const mov=[...rzR.linhas.map(x=>({...x,v:x.valor})),...rzP.linhas.map(x=>({...x,v:x.valor}))].sort((a,b)=>a.data<b.data?-1:a.data>b.data?1:(a.lanc.criadoEm<b.lanc.criadoEm?-1:1));
  let acum=0; for(const x of mov){ acum+=x.v; x.acum=acum; }
  const docTab=ds=>tabela({linhas:ds,vazioTxt:"Nada aqui",clic:d=>String(clic("doc-abrir",d.id)),classeLinha:d=>d.status==="CANCELADO"?"fraca":"",
    colunas:[{rot:"Documento",cel:d=>h`<div class="t">${d.descricao}</div><div class="sub"><span class="num-doc">${d.numero}</span> · ${d.tipo==="RECEBER"?"a receber":d.tipo==="PAGAR"?"a pagar":"cartão"}</div>`},
      {rot:"Data",oc:true,nw:true,cel:d=>fmtData(d.data)},{rot:"Valor",r:true,oc:true,cel:d=>R(d.valor)},
      {rot:"Restante",r:true,cel:d=>{ const e=L.estadoDocumento(d); return e.restante?h`<b>${R(e.restante)}</b>`:"—"; }},{rot:"Situação",cel:d=>chipSt(L.estadoDocumento(d).status)}]});
  return h`<div class="btns" style="justify-content:space-between;margin-bottom:14px">
      <button class="btn fant peq" data-a="ir" data-v="parceiros">${I("undo","p")} Parceiros</button>
      <div class="btns">${s.aPagar?h`<button class="btn peq" data-a="pag-pn" data-v="SAIDA" data-id="${id}">${I("check","p")} Registrar pagamento</button>`:""}
        ${s.aReceber?h`<button class="btn peq" data-a="pag-pn" data-v="ENTRADA" data-id="${id}">${I("coin","p")} Registrar recebimento</button>`:""}
        <button class="btn peq sec" data-a="parceiro-editar" data-id="${id}">Editar</button>
        <button class="btn peq fant" data-a="parceiro-arquivar" data-id="${id}" data-v="${p.ativo===false?"1":"0"}">${p.ativo===false?"Reativar":"Arquivar"}</button></div></div>
    <div class="fraco" style="margin:-4px 0 16px">${TIPO_PN[p.tipo]}${p.documento?" · "+p.documento:""}${p.email?" · "+p.email:""}${p.telefone?" · "+p.telefone:""}</div>
    <div class="kpis secao">${kpi({rotulo:"Você deve",valor:R(s.aPagar),sub:s.vencidoPagar?h`<span class="down">${R(s.vencidoPagar)} vencido</span>`:""})}
      ${kpi({rotulo:"Te devem",valor:R(s.aReceber),sub:s.vencidoReceber?h`<span class="down">${R(s.vencidoReceber)} vencido</span>`:""})}
      ${kpi({rotulo:"Saldo",valor:Rs(s.saldo),tom:s.saldo>0?"up":s.saldo<0?"down":"",sub:s.saldo>0?"a seu favor":s.saldo<0?"você deve":"zerado"})}
      ${kpi({rotulo:"Já pago",valor:R(s.pago)})}${kpi({rotulo:"Já recebido",valor:R(s.recebido)})}</div>
    ${p.obs?h`<div class="fraco secao">${p.obs}</div>`:""}
    <div class="secao"><div class="sec-cab"><h2 class="t2">Em aberto</h2></div><div class="card">${docTab(abertos)}</div></div>
    <div class="secao"><div class="sec-cab"><div><h2 class="t2">Extrato do parceiro</h2><div class="fraco peq">Cada documento e cada pagamento, com o saldo acumulado (positivo: te devem)</div></div></div>
      <div class="card">${tabela({linhas:mov,vazioTxt:"Sem movimento",clic:x=>String(x.lanc.pagamento?clic("pag-abrir",x.lanc.pagamento):clic("doc-abrir",x.lanc.documento)),
        colunas:[{rot:"Data",nw:true,cel:x=>fmtData(x.data)},{rot:"Descrição",cel:x=>h`<div class="t">${x.descricao}</div><div class="sub"><span class="num-doc">${x.numero}</span></div>`},
          {rot:"Movimento",r:true,cel:x=>Rs(x.v)},{rot:"Saldo",r:true,cel:x=>h`<b class="${x.acum<0?"down":""}">${Rs(x.acum)}</b>`}]})}</div></div>
    <div class="secao"><div class="sec-cab"><h2 class="t2">Todos os documentos</h2></div><div class="card">${docTab(docs)}</div></div>
    <div class="secao"><div class="sec-cab"><h2 class="t2">Pagamentos e recebimentos</h2></div><div class="card">${tabela({linhas:pags,vazioTxt:"Nenhum",clic:pg=>String(clic("pag-abrir",pg.id)),
      colunas:[{rot:"Data",nw:true,cel:pg=>fmtData(pg.data)},{rot:"Pagamento",cel:pg=>h`<div class="t">${pg.descricao}</div><div class="sub"><span class="num-doc">${pg.numero}</span></div>`},
        {rot:"Valor",r:true,cel:pg=>h`<b class="${pg.direcao==="ENTRADA"?"up":""}">${pg.direcao==="ENTRADA"?"+":"−"}${R(Math.abs(pg.valor))}</b>`}]})}</div></div>`;
}
acao("pag-pn",el=>app.abrirFormPagamento({direcao:el.dataset.v,parceiro:el.dataset.id}));

/* ═════════ CONTAS ═════════ */
tela("contas",{titulo:app=>app.rota.params[0]?(app.L.contas.get(app.rota.params[0])?.nome||"Conta"):"Contas",grupo:"Cadastros",nav:"contas",render(app){
  const L=app.L, id=app.rota.params[0];
  if(id) return fichaConta(L,id);
  const f=filtro("contas",{arq:false}), h0=hoje();
  const cs=[...L.contas.values()].filter(c=>f.arq?c.ativa===false:c.ativa!==false).sort((a,b)=>a.nome.localeCompare(b.nome,"pt-BR"));
  const tot=t=>soma([...L.contas.values()].filter(c=>t(c.tipo)),c=>L.saldoConta(c.id,h0));
  const principal=L.preferencias().contaPadrao;
  return h`<div class="btns" style="justify-content:space-between;margin-bottom:14px"><div class="fraco">Onde o dinheiro está. O saldo de cada conta é a soma do que o razão registrou — não existe saldo digitado.</div>
      <div class="btns"><label class="check peq"><input type="checkbox" data-a="ct-arq"${f.arq?raw(" checked"):""}> Arquivadas</label><button class="btn peq" data-a="conta-nova">${I("plus","p")} Nova conta</button></div></div>
    <div class="kpis secao">${kpi({rotulo:"Disponível",icone:"wallet",valor:R(tot(t=>DISPONIVEL.has(t)))})}${kpi({rotulo:"Reservas",icone:"piggy",valor:R(tot(t=>t==="RESERVA"))})}
      ${kpi({rotulo:"Benefícios",icone:"ticket",valor:R(tot(t=>t==="BENEFICIO"))})}${kpi({rotulo:"Total em contas",icone:"bank",valor:R(tot(()=>true))})}</div>
    ${cs.length?h`<div class="grade g3">${juntar(cs,c=>{ const s=L.saldoConta(c.id,h0), alvo=c.reserva?.alvo;
      const pend=L.linhasDaChave(K.conta(c.id)).filter(x=>x.data<=h0&&!x.l.linhas[x.i].conc).length;
      return h`<div class="card kpi tap" data-a="ir" data-v="contas" data-p="${c.id}"><span class="cap"><span class="ponto" style="background:${c.cor}"></span>${c.nome}${c.id===principal?" · principal":""}</span>
        <b class="${s<0?"down":""}">${R(s)}</b><span class="s">${TIPO_CONTA[c.tipo]}${c.instituicao?" · "+c.instituicao:""}</span>
        ${alvo?h`<div class="barra up" style="margin-top:8px"><i style="width:${Math.min(100,Math.max(0,s/alvo*100))}%"></i></div><span class="s">${Math.round(s/alvo*100)}% de ${R(alvo)}</span>`:""}
        ${pend?h`<span class="s">${pend} movimento${pend>1?"s":""} sem conciliar</span>`:DISPONIVEL.has(c.tipo)&&L.linhasDaChave(K.conta(c.id)).length?h`<span class="s up">tudo conciliado</span>`:""}</div>`; })}</div>`
      :h`<div class="card">${vazio({icone:"bank",titulo:f.arq?"Nenhuma conta arquivada":"Nenhuma conta",acoes:f.arq?"":h`<button class="btn" data-a="conta-nova">Nova conta</button>`})}</div>`}`;
}});
acao("ct-arq",()=>{ app.f.contas.arq=!app.f.contas.arq; render(); });
function fichaConta(L,id){
  const c=L.contas.get(id); if(!c) return vazio({titulo:"Conta não encontrada"});
  const h0=hoje(), s=L.saldoConta(id,h0), futuro=L.saldoConta(id)-s;
  const rz=razao(L,K.conta(id),{de:inicioDoMes(addMesesMes(mesDe(h0),-2))});
  const ab=[...L.documentos.values()].filter(d=>d.tipo==="ABERTURA"&&d.conta===id&&d.status!=="CANCELADO");
  const ajustes=[...L.documentos.values()].filter(d=>d.tipo==="AJUSTE"&&d.conta===id&&d.status!=="CANCELADO");
  const principal=L.preferencias().contaPadrao===id;
  return h`<div class="btns" style="justify-content:space-between;margin-bottom:14px">
      <button class="btn fant peq" data-a="ir" data-v="contas">${I("undo","p")} Contas</button>
      <div class="btns"><button class="btn peq sec" data-a="ir" data-v="relatorios" data-p="razao|${id}">${I("ledger","p")} Razão completo</button>
        <button class="btn peq sec" data-a="rc-conta" data-id="${id}">${I("scale","p")} Conciliar</button>
        <button class="btn peq sec" data-a="conta-editar" data-id="${id}">Editar</button>
        ${!principal&&c.ativa!==false?h`<button class="btn peq fant" data-a="conta-padrao" data-id="${id}">Tornar principal</button>`:""}
        <button class="btn peq fant" data-a="conta-arquivar" data-id="${id}" data-v="${c.ativa===false?"1":"0"}">${c.ativa===false?"Reativar":"Arquivar"}</button></div></div>
    <div class="card hero secao"><span class="cap">${TIPO_CONTA[c.tipo]}${c.instituicao?" · "+c.instituicao:""}${principal?" · conta principal":""}</span>
      <div class="grande ${s<0?"down":""}">${R(s)}</div><div class="fraco">saldo hoje${futuro?" · "+Rs(futuro)+" já lançados com data futura":""}</div>
      <div class="linhas"><div><span class="cap">Saldo inicial</span><b>${ab.length?R(soma(ab,d=>d.valor)):"—"}</b></div><div><span class="cap">Aberta em</span><b>${fmtData(c.abertura)}</b></div>
        <div><span class="cap">Ajustes</span><b>${ajustes.length?Rs(soma(ajustes,d=>d.valor)):"nenhum"}</b></div>
        <div><span class="cap">Sem conciliar</span><b>${L.linhasDaChave(K.conta(id)).filter(x=>x.data<=h0&&!x.l.linhas[x.i].conc).length}</b></div></div>
      <div class="btns" style="margin-top:16px"><button class="btn peq sec" data-a="conta-abertura" data-id="${id}">Corrigir saldo inicial</button>
        <button class="btn peq fant" data-a="conta-ajuste" data-id="${id}">Ajuste de saldo</button></div></div>
    <div class="secao"><div class="sec-cab"><div><h2 class="t2">Últimos movimentos</h2><div class="fraco peq">Desde ${fmtData(inicioDoMes(addMesesMes(mesDe(h0),-2)))} · saldo anterior ${R(rz.anterior)}</div></div></div>
      <div class="card">${tabela({linhas:rz.linhas.slice().reverse(),vazioTxt:"Sem movimento no período",classeLinha:x=>x.estornado?"fraca":"",
        clic:x=>String(x.lanc.pagamento?clic("pag-abrir",x.lanc.pagamento):x.lanc.documento?clic("doc-abrir",x.lanc.documento):""),
        colunas:[{rot:"Data",nw:true,cel:x=>fmtData(x.data)},{rot:"Descrição",cel:x=>h`<div class="t">${x.descricao}</div><div class="sub"><span class="num-doc">${x.numero}</span>${x.conciliado?" · conciliado":""}</div>`},
          {rot:"Entrada",r:true,oc:true,cel:x=>x.entrada?h`<span class="up">${R(x.entrada)}</span>`:""},{rot:"Saída",r:true,oc:true,cel:x=>x.saida?R(x.saida):""},
          {rot:"Valor",r:true,soCel:true,cel:x=>h`<b class="${x.valor>0?"up":""}">${Rs(x.valor)}</b>`},{rot:"Saldo",r:true,oc:true,cel:x=>h`<b>${R(x.saldo)}</b>`}]})}</div></div>`;
}
acao("rc-conta",el=>{ const f=app.f.reconciliacao||(app.f.reconciliacao={}); Object.assign(f,{conta:el.dataset.id,de:inicioDoMes(mesDe(hoje())),ate:hoje(),bancoIni:"",bancoFim:""}); ir("reconciliacao"); });

/* ═════════ CARTÕES ═════════ */
tela("cartoes",{titulo:app=>app.rota.params[0]?(app.L.cartoes.get(app.rota.params[0])?.nome||"Cartão"):"Cartões",grupo:"Cadastros",nav:"cartoes",render(app){
  const L=app.L, id=app.rota.params[0];
  if(id) return fichaCartao(L,id);
  const cs=[...L.cartoes.values()].sort((a,b)=>(a.ativo===false)-(b.ativo===false)||a.nome.localeCompare(b.nome,"pt-BR"));
  return h`<div class="btns" style="justify-content:space-between;margin-bottom:14px"><div class="fraco">A compra vira dívida do cartão; a fatura paga tira o dinheiro da conta.</div>
      <button class="btn peq" data-a="cartao-novo">${I("plus","p")} Novo cartão</button></div>
    ${cs.length?h`<div class="grade g3">${juntar(cs,c=>{ const lim=limiteCartao(L,c.id), f=faturasDoCartao(L,c.id).find(x=>x.ref===faturaCorrente(c));
      return h`<div class="card kpi tap ${c.ativo===false?"fraca":""}" data-a="ir" data-v="cartoes" data-p="${c.id}"><span class="cap"><span class="ponto" style="background:${c.cor}"></span>${c.nome}${c.ativo===false?" · arquivado":""}</span>
        <b>${R(lim.usado)}</b><span class="s">em aberto, com parcelas futuras</span>
        ${lim.limite?h`<div class="barra ${lim.pct>85?"down":lim.pct>60?"warn":""}" style="margin-top:8px"><i style="width:${lim.pct}%"></i></div><span class="s">${R(lim.disponivel)} livres de ${R(lim.limite)}</span>`:h`<span class="s">sem limite cadastrado</span>`}
        <span class="s">Fatura atual (${rotuloMesCurto(f.ref)}): <b style="font-size:12px">${R(f.total)}</b> · vence ${fmtData(f.vencimento)}</span></div>`; })}</div>`
      :h`<div class="card">${vazio({icone:"card",titulo:"Nenhum cartão",acoes:h`<button class="btn" data-a="cartao-novo">Cadastrar cartão</button>`})}</div>`}`;
}});
function fichaCartao(L,id){
  const c=L.cartoes.get(id); if(!c) return vazio({titulo:"Cartão não encontrado"});
  const lim=limiteCartao(L,id), rc=relatorioCartoes(L,{meses:12}).find(x=>x.cartao.id===id);
  const fs=faturasDoCartao(L,id);
  return h`<div class="btns" style="justify-content:space-between;margin-bottom:14px">
      <button class="btn fant peq" data-a="ir" data-v="cartoes">${I("undo","p")} Cartões</button>
      <div class="btns"><button class="btn peq" data-a="doc-novo" data-v="COMPRA_CARTAO">${I("plus","p")} Compra</button>
        <button class="btn peq sec" data-a="cartao-editar" data-id="${id}">Editar</button>
        <button class="btn peq fant" data-a="cartao-arquivar" data-id="${id}" data-v="${c.ativo===false?"1":"0"}">${c.ativo===false?"Reativar":"Arquivar"}</button></div></div>
    <div class="kpis secao">${kpi({rotulo:"Limite",valor:lim.limite!=null?R(lim.limite):"sem limite"})}${kpi({rotulo:"Usado",valor:R(lim.usado),sub:"inclui parcelas futuras"})}
      ${lim.limite!=null?kpi({rotulo:"Disponível",valor:R(lim.disponivel),tom:lim.disponivel<0?"down":""}):""}
      ${kpi({rotulo:"Fecha / vence",valor:"dia "+c.fechamento+" / "+c.vencimento,sub:c.contaPagamento?"debita em "+L.nomeConta(c.contaPagamento):""})}</div>
    <div class="grade g2 secao">
      <div class="card"><div class="card-cab"><h2 class="t2">Próximas faturas</h2></div><div class="lista" style="margin-top:8px">${rc.futuras.length?juntar(rc.futuras,f=>h`<div class="clic" data-a="ir" data-v="faturas" data-p="${id}|${f.ref}">
        <div class="meio"><div class="t">${rotuloMes(f.ref)}</div><div class="s">vence ${fmtData(f.vencimento)}</div></div><div class="dir"><div class="num" style="font-weight:650">${R(f.restante)}</div>${chipSt(f.status)}</div></div>`)
        :h`<div class="fraco peq" style="display:block">Nenhuma fatura em aberto.</div>`}</div></div>
      <div class="card"><div class="card-cab"><h2 class="t2">Compras parceladas em aberto</h2></div><div class="lista" style="margin-top:8px">${rc.comprasParceladas.length?juntar(rc.comprasParceladas,d=>{ const e=L.estadoDocumento(d);
        return h`<div class="clic"${clic("doc-abrir",d.id)}><div class="meio"><div class="t">${d.descricao}</div><div class="s">${e.parcelas.filter(x=>x.e.restante>0).length} de ${d.parcelas.length} parcelas a pagar · <span class="num-doc">${d.numero}</span></div></div>
          <div class="dir num" style="font-weight:650">${R(e.restante)}</div></div>`; }):h`<div class="fraco peq" style="display:block">Nenhuma.</div>`}</div></div></div>
    <div class="secao"><div class="sec-cab"><h2 class="t2">Todas as faturas</h2></div><div class="card">${tabela({linhas:fs.filter(f=>f.itens.length).reverse(),vazioTxt:"Nenhuma fatura",
      clic:f=>' data-a="ir" data-v="faturas" data-p="'+id+"|"+f.ref+'"',
      colunas:[{rot:"Fatura",cel:f=>rotuloMes(f.ref)},{rot:"Vence",nw:true,cel:f=>fmtData(f.vencimento)},{rot:"Total",r:true,cel:f=>h`<b>${R(f.total)}</b>`},
        {rot:"Falta",r:true,oc:true,cel:f=>f.restante>0?R(f.restante):"—"},{rot:"Situação",cel:f=>chipSt(f.status)}]})}</div></div>`;
}

/* ═════════ CATEGORIAS ═════════ */
tela("categorias",{titulo:"Categorias",grupo:"Cadastros",render(app){
  const L=app.L, mes=mesDe(hoje());
  const r=resultado(L,{de:inicioDoMes(addMesesMes(mes,-11)),ate:fimDoMes(mes)});
  const uso=new Map(); for(const d of L.documentos.values()) if(d.categoria) uso.set(d.categoria,(uso.get(d.categoria)||0)+1);
  const col=(nat,tit)=>{ const cs=[...L.categorias.values()].filter(c=>c.natureza===nat).sort((a,b)=>(a.ativa===false)-(b.ativa===false)||a.nome.localeCompare(b.nome,"pt-BR"));
    return h`<div class="card"><div class="card-cab"><h2 class="t2">${tit}</h2><button class="btn peq sec" data-a="categoria-nova" data-v="${nat}">${I("plus","p")} Nova</button></div>
      <div class="lista" style="margin-top:8px">${cs.length?juntar(cs,c=>{ const tot=r.categorias.find(x=>x.id===c.id&&x.natureza===nat)?.total||0;
        return h`<div class="${c.ativa===false?"fraca":""}"><div class="meio"><div class="t">${c.nome}${c.ativa===false?" (arquivada)":""}</div><div class="s">${uso.get(c.id)||0} documento(s) · 12 meses: ${R(tot)}</div></div>
          <button class="btn peq fant" data-a="categoria-editar" data-id="${c.id}">Editar</button>
          <button class="btn peq fant" data-a="categoria-arquivar" data-id="${c.id}" data-v="${c.ativa===false?"1":"0"}">${c.ativa===false?"Reativar":"Arquivar"}</button></div>`; })
        :h`<div class="fraco peq" style="display:block">Nenhuma.</div>`}</div></div>`; };
  return h`<div class="fraco" style="margin-bottom:14px">Arquivar esconde dos formulários; o histórico continua com a categoria.</div>
    <div class="grade g2">${col("DESPESA","Despesas")}${col("RECEITA","Receitas")}</div>`;
}});
