/* ══════════ RECONCILIAÇÃO ══════════
   Conta + período + saldo do banco → o WIGO mostra o próprio saldo, a
   diferença e DE ONDE ela vem. Nenhum botão aqui "acerta" o saldo: os
   caminhos são lançar o que falta, conciliar o que bate e investigar o
   resto. O ajuste manual existe, mas mora na conta e pede motivo. */
import { app, tela, filtro, render, acao, aoMudar, form, executar, abrirPainel, toast } from "../base.js";
import { h, raw, juntar } from "../html.js";
import { I, R, Rs, fmtData, fmtDataCurta, chip, vazio, aviso } from "../componentes.js";
import { clic, contaPadrao, opcoesCategoria, opcoesParceiro, opcoesFormas } from "../util.js";
import { resumoConciliacao } from "../../financas/conciliacao.js";
import * as C from "../../financas/comandos.js";
import { lancarLinhaExtrato, sugerirParaLinha, ignorarLinhaExtrato } from "../../importacao/analise.js";
import { hoje, mesDe, inicioDoMes } from "../../nucleo/datas.js";
import { centavos, numero } from "../../nucleo/dinheiro.js";

function saldoDoExtrato(L,conta,ate){
  const lotes=[...L.importacoes.values()].filter(l=>l.conta===conta&&l.saldoInformado&&l.saldoInformado.data&&l.saldoInformado.data<=ate)
    .sort((a,b)=>a.saldoInformado.data<b.saldoInformado.data?1:-1);
  return lotes[0]?.saldoInformado||null;
}
tela("reconciliacao",{titulo:"Reconciliação",grupo:"Financeiro",render(app){
  const L=app.L, contas=L.contasAtivas();
  if(!contas.length) return h`<div class="card">${vazio({icone:"scale",titulo:"Nenhuma conta para conciliar"})}</div>`;
  const f=filtro("reconciliacao",{conta:contaPadrao(),de:inicioDoMes(mesDe(hoje())),ate:hoje(),bancoIni:"",bancoFim:""});
  if(!L.contas.get(f.conta)) f.conta=contas[0].id;
  const sugerido=saldoDoExtrato(L,f.conta,f.ate);
  const r=resumoConciliacao(L,{conta:f.conta,de:f.de,ate:f.ate,bancoInicial:f.bancoIni===""?null:centavos(f.bancoIni),bancoFinal:f.bancoFim===""?null:centavos(f.bancoFim)});
  const temExtrato=[...L.extrato.values()].some(e=>e.conta===f.conta);
  const topo=h`<div class="card pad secao"><div class="grade g4" style="align-items:end">
    <div class="campo" style="margin:0"><label>Conta</label><select data-c="rc-f" data-k="conta">${juntar(contas,c=>h`<option value="${c.id}"${c.id===f.conta?raw(" selected"):""}>${c.nome}</option>`)}</select></div>
    <div class="campo" style="margin:0"><label>De</label><input type="date" value="${f.de}" data-c="rc-f" data-k="de"></div>
    <div class="campo" style="margin:0"><label>Até</label><input type="date" value="${f.ate}" data-c="rc-f" data-k="ate"></div>
    <div class="campo" style="margin:0"><label>Saldo final no banco</label><input class="valor" inputmode="decimal" placeholder="${sugerido?numero(sugerido.valor):"0,00"}" value="${f.bancoFim}" data-c="rc-f" data-k="bancoFim"></div>
  </div>
  <details style="margin-top:10px"><summary class="link" style="list-style:none">Saldo inicial do banco (opcional)</summary>
    <div class="campo" style="margin:10px 0 0;max-width:240px"><input class="valor" inputmode="decimal" placeholder="0,00" value="${f.bancoIni}" data-c="rc-f" data-k="bancoIni">
    <span class="ajuda">Com ele, a diferença de saldo inicial aparece separada.</span></div></details>
  ${sugerido&&f.bancoFim===""?h`<div class="peq fraco" style="margin-top:8px">O último extrato importado informa ${R(sugerido.valor)} em ${fmtData(sugerido.data)}. <a class="link" data-a="rc-usar" data-v="${numero(sugerido.valor)}">Usar</a></div>`:""}</div>`;

  let veredito;
  if(r.bancoFinal==null) veredito=aviso("Informe o saldo final que o app do banco mostra para comparar.",{tipo:"info",icone:"scale"});
  else if(r.diferenca===0) veredito=aviso(h`<b>O WIGO bate com o banco.</b> ${r.soNoWigo.length?r.soNoWigo.length+" movimento(s) ainda sem conferir, mas o saldo fecha.":"Tudo conferido."}`,{tipo:"bom",icone:"check"});
  /* Sem extrato do período, "só no WIGO" quer dizer "ainda não conferido", não
     "o banco não tem". Decompor a diferença nesse caso afirmava coisas que o
     app não sabe (e sobrava um "não explicado" enorme). */
  else if(!r.comExtrato) veredito=h`<div class="aviso ruim">${I("alert")}<div style="flex:1"><b>Diferença de ${R(Math.abs(r.diferenca))}</b> — o banco tem ${r.diferenca>0?"mais":"menos"} que o WIGO.
    <div style="margin-top:6px">Sem extrato deste período no WIGO, não dá para saber quais movimentos o banco tem. Dois caminhos:</div>
    <div class="rank" style="margin-top:8px">
      <div><span><b>Importar o extrato</b> — o WIGO casa cada linha sozinho e mostra exatamente o que falta de cada lado.</span><button class="btn peq sec" data-a="ir" data-v="importacao">${I("import","p")} Importar</button></div>
      ${r.soNoWigo.length?h`<div><span><b>Conferir à mão</b> os ${r.soNoWigo.length} movimento(s) abaixo com o app do banco. O que não estiver lá explica a diferença.</span></div>`:""}
    </div></div></div>`;
  else veredito=h`<div class="aviso ruim">${I("alert")}<div style="flex:1"><b>Diferença de ${R(Math.abs(r.diferenca))}</b> — o banco tem ${r.diferenca>0?"mais":"menos"} que o WIGO. Veja de onde vem:
    <div class="rank" style="margin-top:8px">
      ${r.difInicial?h`<div><span>Saldo inicial diferente</span><span class="num">${Rs(r.difInicial)}</span></div>`:""}
      ${r.soNoBanco.length?h`<div><span>${r.soNoBanco.length} movimento(s) só no banco (falta lançar)</span><span class="num">${Rs(r.somaSoBanco)}</span></div>`:""}
      ${r.soNoWigo.length?h`<div><span>${r.soNoWigo.length} movimento(s) só no WIGO (o banco não mostra)</span><span class="num">${Rs(-r.somaSoWigo)}</span></div>`:""}
      ${r.naoExplicado?h`<div><span>Não explicado — há movimento do banco fora do extrato importado (dias sem extrato, ou saldo inicial do banco não informado)</span><span class="num">${Rs(r.naoExplicado)}</span></div>`:""}
    </div></div></div>`;

  const lado=(tit,v,sub)=>h`<div><span class="cap">${tit}</span><b style="font-size:18px">${v}</b>${sub?h`<span class="fraco peq">${sub}</span>`:""}</div>`;
  const quadro=h`<div class="card secao"><div class="resumo q4" style="margin:0;border:0;border-radius:0">
    ${lado("WIGO no início",R(r.wigoInicial),fmtData(r.de))}${lado("Entradas",h`<span class="up">+${R(r.entradas)}</span>`)}
    ${lado("Saídas",h`−${R(r.saidas)}`)}${lado("WIGO no fim",R(r.wigoFinal),r.bancoFinal!=null?"banco: "+R(r.bancoFinal):fmtData(r.ate))}</div></div>`;

  const pistas=r.pistas.length?h`<div class="secao"><div class="sec-cab"><h2 class="t2">Pistas</h2></div><div class="grade">${juntar(r.pistas,p=>aviso(p.texto,{tipo:"info",icone:"bulb"}))}</div></div>`:"";
  const pares=r.pares.length?h`<div class="secao"><div class="sec-cab"><div><h2 class="t2">Correspondências sugeridas</h2><div class="fraco peq">Mesmo valor, data próxima. Nada é conciliado sem você confirmar.</div></div>
    ${r.pares.some(p=>p.pontos>=90)?h`<button class="btn peq" data-a="rc-todas">Conciliar as de 90% ou mais</button>`:""}</div>
    <div class="card lista">${juntar(r.pares,p=>h`<div><div class="meio"><div class="t">${fmtDataCurta(p.b.data)} · ${p.b.descricao}</div>
      <div class="s">${I("link","p")} ${fmtDataCurta(p.w.data)} · ${p.w.descricao} ${p.w.numero?h`<span class="num-doc">${p.w.numero}</span>`:""} · ${p.motivos.join(", ")}</div></div>
      <div class="dir"><div class="num" style="font-weight:650">${Rs(p.b.valor)}</div>${chip("Possível correspondência — "+p.pontos+"%",p.pontos>=90?"bom":"atencao")}</div>
      <button class="btn peq" data-a="rc-par" data-e="${p.b.id}" data-l="${p.w.lancamento}" data-ln="${p.w.linha}">Conciliar</button></div>`)}</div></div>`:"";
  const noPar=new Set(r.pares.map(p=>p.b.id)), noParW=new Set(r.pares.map(p=>p.w.id));
  const soBanco=r.soNoBanco.filter(e=>!noPar.has(e.id)), soWigo=r.soNoWigo.filter(x=>!noParW.has(x.id));
  const blocoBanco=h`<div class="card"><div class="card-cab"><div><h2 class="t2">Só no banco</h2><div class="fraco peq">${temExtrato?"Está no extrato e não no WIGO: lançar ou ignorar.":"Importe o extrato desta conta para ver o que o banco tem e o WIGO não."}</div></div>
    ${temExtrato?"":h`<button class="btn sec peq" data-a="ir" data-v="importacao">Importar</button>`}</div>
    <div class="lista" style="margin-top:8px">${soBanco.length?juntar(soBanco,e=>h`<div><div class="meio"><div class="t">${e.descricao}</div><div class="s">${fmtData(e.data)}</div></div>
      <div class="dir num" style="font-weight:650">${Rs(e.valor)}</div>
      <div class="btns"><button class="btn peq" data-a="rc-lancar" data-id="${e.id}">Lançar</button><button class="btn peq fant" data-a="rc-ignorar" data-id="${e.id}">Ignorar</button></div></div>`)
      :h`<div class="fraco peq" style="display:block">Nada pendente.</div>`}</div></div>`;
  const blocoWigo=h`<div class="card"><div class="card-cab"><div><h2 class="t2">Só no WIGO</h2><div class="fraco peq">Ainda não conferido contra o banco. Se está no app do banco, marque como conferido.</div></div></div>
    <div class="lista" style="margin-top:8px">${soWigo.length?juntar(soWigo,x=>h`<div><div class="meio clic"${x.numero?clic("rc-abrir",x.lancamento):""}><div class="t">${x.descricao}</div><div class="s">${fmtData(x.data)} ${x.numero?h`· <span class="num-doc">${x.numero}</span>`:""}${x.parceiro?" · "+x.parceiro:""}</div></div>
      <div class="dir num" style="font-weight:650">${Rs(x.valor)}</div>
      <button class="btn peq sec" data-a="rc-manual" data-l="${x.lancamento}" data-ln="${x.linha}">${I("check","p")} Conferido</button></div>`)
      :h`<div class="fraco peq" style="display:block">Tudo conferido.</div>`}</div></div>`;
  const concl=r.conciliados.length?h`<details class="secao"><summary class="link" style="list-style:none">${r.conciliados.length} movimento(s) conciliado(s) no período</summary>
    <div class="card lista" style="margin-top:10px">${juntar(r.conciliados,x=>h`<div><div class="meio"><div class="t">${x.descricao}</div><div class="s">${fmtData(x.data)} · conciliado em ${fmtData(x.conc.em)}${x.conc.extrato?" com o extrato":" à mão"}</div></div>
      <div class="dir num">${Rs(x.valor)}</div><button class="btn peq fant" data-a="rc-desfazer" data-l="${x.lancamento}" data-ln="${x.linha}">Desfazer</button></div>`)}</div></details>`:"";
  return h`${topo}<div class="secao">${veredito}</div>${quadro}${pistas}${pares}<div class="grade g2 secao">${blocoBanco}${blocoWigo}</div>${concl}
    <div class="fraco peq">Diferença que nada explica? Em último caso, a conta tem <a class="link" data-a="conta-ajuste" data-id="${f.conta}">ajuste de saldo</a> — com data e motivo, visível no razão.</div>`;
}});
aoMudar("rc-f",el=>{ app.f.reconciliacao[el.dataset.k]=el.value; render(); });
acao("rc-usar",el=>{ app.f.reconciliacao.bancoFim=el.dataset.v; render(); });
acao("rc-par",el=>executar(()=>C.conciliar(app.L,[{lancamento:el.dataset.l,linha:+el.dataset.ln,extrato:el.dataset.e}]),{ok:"Conciliado",fechar:false}));
acao("rc-manual",el=>executar(()=>C.conciliar(app.L,[{lancamento:el.dataset.l,linha:+el.dataset.ln}]),{ok:"Marcado como conferido",fechar:false}));
acao("rc-desfazer",el=>executar(()=>C.desconciliar(app.L,{lancamento:el.dataset.l,linha:+el.dataset.ln}),{ok:"Conciliação desfeita",fechar:false}));
acao("rc-ignorar",el=>executar(()=>ignorarLinhaExtrato(app.L,el.dataset.id),{ok:"Linha ignorada",fechar:false}));
acao("rc-abrir",el=>{ const l=app.L.lancamentos.get(el.dataset.id); if(l?.pagamento) app.abrirPagamento(l.pagamento); else if(l?.documento) app.abrirDocumento(l.documento); });
acao("rc-todas",()=>{ const f=app.f.reconciliacao;
  const r=resumoConciliacao(app.L,{conta:f.conta,de:f.de,ate:f.ate,bancoFinal:null});
  const itens=r.pares.filter(p=>p.pontos>=90).map(p=>({lancamento:p.w.lancamento,linha:p.w.linha,extrato:p.b.id}));
  executar(()=>C.conciliar(app.L,itens),{ok:itens.length+" conciliado(s)",fechar:false}); });
acao("rc-lancar",el=>{
  const L=app.L, e=L.extrato.get(el.dataset.id), s=sugerirParaLinha(L,e), entrada=e.valor>0;
  const opcoes=[["CRIAR",entrada?"Nova receita recebida":"Nova despesa paga"]];
  if(s.acao==="QUITAR") opcoes.unshift(["QUITAR",s.motivo]);
  if(s.acao==="PAGAR_FATURA") opcoes.unshift(["PAGAR_FATURA",s.motivo]);
  if(L.contasAtivas().length>1) opcoes.push(["TRANSFERIR","Transferência entre minhas contas"]);
  app._rcLinha={e,s};
  abrirPainel({titulo:"Lançar do extrato",sub:fmtData(e.data)+" · "+(entrada?"+":"")+R(e.valor),estreito:true,id:"rc",corpo:h`<form data-f="rc-lancar">
    <div class="campo"><label>O que é</label>${juntar(opcoes,([k,t],i)=>h`<label class="check" style="margin:6px 0"><input type="radio" name="acao" value="${k}"${i===0?raw(" checked"):""}> ${t}</label>`)}</div>
    <div class="campo"><label>Descrição</label><input name="descricao" value="${e.descricao}"></div>
    <div class="linha2"><div class="campo"><label>Categoria</label><select name="categoria">${opcoesCategoria(entrada?"RECEITA":"DESPESA",s.categoria)}</select></div>
      <div class="campo"><label>Parceiro</label><select name="parceiro">${opcoesParceiro(s.parceiro)}</select></div></div>
    ${L.contasAtivas().length>1?h`<div class="campo"><label>Outra conta (se for transferência)</label><select name="contaDestino"><option value="">—</option>${juntar(L.contasAtivas().filter(c=>c.id!==e.conta),c=>h`<option value="${c.id}">${c.nome}</option>`)}</select></div>`:""}
    <div class="campo"><label>Forma</label><select name="forma">${opcoesFormas(s.forma||"debito")}</select></div>
    <button class="btn larg" type="submit">Lançar e conciliar</button></form>`});
});
form("rc-lancar",(f,d)=>{ const {e,s}=app._rcLinha, acao=d.get("acao");
  return executar(()=>lancarLinhaExtrato(app.L,e.id,{acao,alvo:acao===s.acao?s.alvo:null,descricao:d.get("descricao"),categoria:d.get("categoria")||null,
    parceiro:d.get("parceiro")||null,forma:d.get("forma"),contaDestino:d.get("contaDestino")||null}),{ok:"Lançado e conciliado"}); });
