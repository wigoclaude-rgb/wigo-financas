/* ══════════ VISÃO GERAL ══════════
   Não calcula nada: pergunta ao livro e aos relatórios. O número grande é o
   saldo previsto no fim do mês (pedido do usuário no 2.2); o resto são
   respostas curtas às perguntas de todo dia — quanto tenho, quanto devo,
   o que vence, o que falta conferir. */
import { app, tela, ir, acao, render } from "../base.js";
import { h, raw, juntar } from "../html.js";
import { I, R, Rs, kpi, chipSt, chipStLado, chip, fmtData, fmtDataCurta, rotuloMes, rotuloMesCurto, graficoColunas, barrasRanking, vazio, aviso } from "../componentes.js";
import { clic } from "../util.js";
import { saldoPrevistoDoMes, compromissos, faixas, patrimonio, fluxoDeCaixa, resultado, resumoDoMes } from "../../financas/relatorios.js";
import { faturasDoCartao, faturaCorrente, fatura, limiteCartao } from "../../financas/cartoes.js";
import { verificar } from "../../financas/integridade.js";
import { hoje, mesDe, addMesesMes, inicioDoMes, fimDoMes, addDias, diasEntre } from "../../nucleo/datas.js";
import { DISPONIVEL, TIPO_CONTA, DOC, COM_PARCELAS } from "../../financas/modelo.js";

/* ‹ mês › no topo, como no 2.2: as setas trocam o mês que a tela mostra, e
   tocar no nome volta para hoje. Não é gravado — abrir o app é sempre no
   mês atual. O que é "de hoje" (saldo das contas, avisos, o que vence nos
   próximos dias, cartões, patrimônio) não muda com o mês. */
acao("vg-mes",el=>{ const atual=mesDe(hoje()), v=+el.dataset.v;
  app.mesVisto=v?addMesesMes(app.mesVisto||atual,v):atual; app.vgTodos=false; render(); });
acao("vg-todos",()=>{ app.vgTodos=true; render(); });

tela("visao",{titulo:"Visão geral",render(app){
  const L=app.L, h0=hoje(), mesHoje=mesDe(h0), mes=app.mesVisto||mesHoje, rm=resumoDoMes(L,mes);
  if(!L.contas.size&&!L.documentos.size) return primeiroUso();
  const prev=saldoPrevistoDoMes(L);
  /* o que vence até o fim do mês (vencidos incluídos): 24 meses de aluguel
     lançados pela recorrência são compromisso futuro, não conta de agora */
  const fimMes=fimDoMes(mesHoje);
  const pagar=faixas(L,"PAGAR",{ate:fimMes}), receber=faixas(L,"RECEBER",{ate:fimMes});
  const pat=patrimonio(L);
  const cartoes=L.cartoesAtivos();
  const dividaCartoes=cartoes.reduce((s,c)=>s+L.dividaCartao(c.id),0);
  const comp=compromissos(L,{meses:6});

  /* alertas: só o que pede ação */
  const alertas=[];
  if(pagar.nVencido) alertas.push({tom:"ruim",icone:"alert",t:h`<b>${pagar.nVencido} conta${pagar.nVencido>1?"s":""} a pagar vencida${pagar.nVencido>1?"s":""}</b> · ${R(pagar.vencido)}`,a:"ir",v:"pagar"});
  if(receber.nVencido) alertas.push({tom:"",icone:"clock",t:h`<b>${receber.nVencido} recebimento${receber.nVencido>1?"s":""} atrasado${receber.nVencido>1?"s":""}</b> · ${R(receber.vencido)}`,a:"ir",v:"receber"});
  for(const c of cartoes){ for(const f of faturasDoCartao(L,c.id)){ if(f.restante<=0) continue; const d=diasEntre(h0,f.vencimento);
    if(d>=0&&d<=7) alertas.push({tom:"",icone:"card",t:h`<b>Fatura ${c.nome}</b> vence ${d===0?"hoje":"em "+d+" dia"+(d>1?"s":"")} · ${R(f.restante)}`,a:"ir",v:"faturas",p:c.id+"|"+f.ref});
    else if(d<0) alertas.push({tom:"ruim",icone:"card",t:h`<b>Fatura ${c.nome} vencida</b> · ${R(f.restante)}`,a:"ir",v:"faturas",p:c.id+"|"+f.ref}); } }
  const semConc=[...L.contas.values()].filter(c=>DISPONIVEL.has(c.tipo)).map(c=>({c,n:L.linhasDaChave("A:"+c.id).filter(x=>x.data>=addDias(h0,-45)&&x.data<=h0&&!x.l.linhas[x.i].conc).length})).filter(x=>x.n);
  if(semConc.length) alertas.push({tom:"info",icone:"scale",t:h`<b>${semConc.reduce((s,x)=>s+x.n,0)} movimentos dos últimos 45 dias sem conciliar</b> · ${semConc.map(x=>x.c.nome).join(", ")}`,a:"ir",v:"reconciliacao"});
  const saude=verificar(L);
  if(!saude.ok) alertas.push({tom:"ruim",icone:"shield",t:h`<b>${saude.problemas.length} inconsistência(s) nos dados</b> · ver detalhes`,a:"ir",v:"ajustes"});

  const seletor=h`<div class="mpick"><button class="seta" data-a="vg-mes" data-v="-1" aria-label="Mês anterior">${I("chevron","p esq")}</button>
    <button class="cur" data-a="vg-mes" data-v="0"><b>${rotuloMes(mes)}</b><small>${mes===mesHoje?"mês atual":"toque para voltar a hoje"}</small></button>
    <button class="seta" data-a="vg-mes" data-v="1" aria-label="Próximo mês">${I("chevron","p")}</button></div>`;
  const hero=rm.tipo==="ATUAL"?h`<div class="card hero">
    <span class="cap">Saldo previsto no fim de ${rotuloMes(mes)}</span>
    <div class="grande ${prev.final<0?"down":""}">${R(prev.final)}</div>
    <div class="fraco">Hoje em contas: <b style="color:var(--ink)">${R(prev.hoje)}</b> · ${prev.receber||prev.pagar||prev.faturas?"considera o que ainda vence neste mês":"nada mais vence neste mês"}</div>
  </div>`:rm.tipo==="PASSADO"?h`<div class="card hero">
    <span class="cap">Saldo no fim de ${rotuloMes(mes)}</span>
    <div class="grande ${rm.saldoFim<0?"down":""}">${R(rm.saldoFim)}</div>
    <div class="fraco">No mês entrou <b class="up">${R(rm.fluxo.entradas)}</b> e saiu <b style="color:var(--ink)">${R(rm.fluxo.saidas)}</b> nas contas do dia a dia</div>
  </div>`:h`<div class="card hero">
    <span class="cap">Saldo previsto no fim de ${rotuloMes(mes)}</span>
    <div class="grande ${rm.saldoFim<0?"down":""}">${R(rm.saldoFim)}</div>
    <div class="fraco">Hoje em contas: <b style="color:var(--ink)">${R(prev.hoje)}</b> · considera tudo que vence até lá</div>
  </div>`;

  const acoesRapidas=h`<div class="btns rapidas">
    <button class="btn peq" data-a="doc-novo" data-v="PAGAR">${I("outflow","p")} Despesa</button>
    <button class="btn peq sec" data-a="doc-novo" data-v="RECEBER">${I("inflow","p")} Receita</button>
    <button class="btn peq sec" data-a="doc-novo" data-v="COMPRA_CARTAO">${I("card","p")} Compra no cartão</button>
    <button class="btn peq sec" data-a="pag-novo" data-v="SAIDA">${I("check","p")} Pagamento</button>
    <button class="btn peq sec" data-a="pag-novo" data-v="ENTRADA">${I("coin","p")} Recebimento</button>
    <button class="btn peq sec" data-a="trf-nova">${I("swap","p")} Transferência</button>
    <button class="btn peq sec" data-a="ir" data-v="importacao">${I("import","p")} Importar</button>
    <button class="btn peq sec" data-a="ir" data-v="reconciliacao">${I("scale","p")} Conciliar</button></div>`;

  const kpis=h`<div class="kpis secao">
    ${kpi({rotulo:"Em contas",icone:"bank",valor:R(L.saldoDisponivel(h0)),sub:pat.reservas?"+ "+R(pat.reservas)+" em reservas":"disponível hoje",acao:"ir",v:"contas"})}
    ${rm.tipo==="ATUAL"?h`${kpi({rotulo:"A pagar no mês",icone:"outflow",valor:R(pagar.total),sub:pagar.vencido?h`<span class="down">${R(pagar.vencido)} vencido</span>`:pagar.sete?R(pagar.sete)+" em 7 dias":"nada vencido",acao:"ir",v:"pagar"})}
    ${kpi({rotulo:"A receber no mês",icone:"inflow",valor:R(receber.total),sub:receber.vencido?h`<span class="down">${R(receber.vencido)} atrasado</span>`:receber.sete?R(receber.sete)+" em 7 dias":"em dia",acao:"ir",v:"receber"})}`
    :h`${kpiMes("A pagar em "+rotuloMesCurto(mes),"outflow",rm.pagar,rm.tipo,"pagar","pago")}${kpiMes("A receber em "+rotuloMesCurto(mes),"inflow",rm.receber,rm.tipo,"receber","recebido")}`}
    ${cartoes.length?kpi({rotulo:"Cartões",icone:"card",valor:R(dividaCartoes),sub:"inclui parcelas futuras",acao:"ir",v:"faturas"}):""}
    ${kpi({rotulo:"Patrimônio",icone:"gem",valor:R(pat.liquido),sub:"contas + a receber − dívidas",acao:"ir",v:"relatorios",p:"avancados"})}
  </div>`;

  /* próximos 6 meses: saldo projetado — uma série, uma cor */
  const graf=graficoColunas({rotulos:comp.map(c=>rotuloMesCurto(c.mes)),destaque:0,altura:200,
    series:[{nome:"Saldo previsto",cor:"--serie1",valores:comp.map(c=>c.saldoFinal)}],
    dicaExtra:i=>`<br><span style="opacity:.7">+${R(comp[i].receber)} a receber · −${R(comp[i].pagar+comp[i].faturas)} a pagar</span>`});
  const proximos=comp.flatMap(c=>c.itens).filter(x=>x.vencimento<=addDias(h0,15)).sort((a,b)=>a.vencimento<b.vencimento?-1:1).slice(0,8);

  const contas=L.contasAtivas();
  const blocoContas=h`<div class="card"><div class="card-cab"><h2 class="t2">${I("bank")} Contas</h2><a class="link" data-a="ir" data-v="contas">Ver todas</a></div>
    <div class="lista" style="margin-top:8px">${contas.length?juntar(contas,c=>{ const s=L.saldoConta(c.id,h0);
      const alvo=c.reserva?.alvo;
      return h`<div class="clic" data-a="ir" data-v="contas" data-p="${c.id}"><span class="ponto" style="background:${c.cor}"></span>
        <div class="meio"><div class="t">${c.nome}</div><div class="s">${TIPO_CONTA[c.tipo]}${alvo?h` · ${Math.round(s/alvo*100)}% da meta`:""}</div>
        ${alvo?h`<div class="barra up" style="margin-top:6px"><i style="width:${Math.min(100,s/alvo*100)}%"></i></div>`:""}</div>
        <div class="dir num ${s<0?"down":""}" style="font-weight:650">${R(s)}</div></div>`; })
      :h`<div>${vazio({icone:"bank",titulo:"Nenhuma conta",texto:"Cadastre onde seu dinheiro está.",acoes:h`<button class="btn peq" data-a="conta-nova">Nova conta</button>`})}</div>`}</div></div>`;

  const blocoCartoes=cartoes.length?h`<div class="card"><div class="card-cab"><h2 class="t2">${I("card")} Faturas</h2><a class="link" data-a="ir" data-v="faturas">Ver faturas</a></div>
    <div class="lista" style="margin-top:8px">${juntar(cartoes,c=>{ const ref=faturaCorrente(c), lim=limiteCartao(L,c.id);
      /* a vencida primeiro — é a que pede ação; depois a próxima a vencer */
      const fa=faturasDoCartao(L,c.id).filter(f=>f.restante>0).sort((a,b)=>a.vencimento<b.vencimento?-1:1)[0]||fatura(L,c.id,ref);
      return h`<div class="clic" data-a="ir" data-v="faturas" data-p="${c.id}|${fa.ref}"><span class="ponto" style="background:${c.cor}"></span>
        <div class="meio"><div class="t">${c.nome} · ${rotuloMesCurto(fa.ref)}</div><div class="s">vence ${fmtData(fa.vencimento)}${lim.limite!=null?" · "+R(lim.disponivel)+" de limite livre":""}</div>
        ${lim.limite?h`<div class="barra ${lim.pct>85?"down":lim.pct>60?"warn":""}" style="margin-top:6px"><i style="width:${lim.pct}%"></i></div>`:""}</div>
        <div class="dir"><div class="num" style="font-weight:650">${R(fa.restante>0?fa.restante:fa.total)}</div>${chipSt(fa.status)}</div></div>`; })}</div></div>`:"";

  const rs=resultado(L,{de:inicioDoMes(mes),ate:fimDoMes(mes)});
  const cats=rs.grupos.filter(c=>c.natureza==="DESPESA").slice(0,6);
  /* entradas × saídas: os seis meses até o escolhido (o futuro ainda não tem caixa) */
  const fimFl=mes<mesHoje?mes:mesHoje;
  const fl=fluxoDeCaixa(L,{de:inicioDoMes(addMesesMes(fimFl,-5)),ate:fimDoMes(fimFl)});

  return h`${seletor}${hero}
    ${alertas.length?h`<div class="grade secao" style="margin-top:14px">${juntar(alertas,a=>h`<div class="aviso ${a.tom} clic" style="cursor:pointer" data-a="${a.a}" data-v="${a.v}" data-p="${a.p||""}">${I(a.icone)}<div style="flex:1">${a.t}</div>${I("chevron","p")}</div>`)}</div>`:""}
    ${acoesRapidas}${kpis}${lancamentosDoMes(L,rm)}
    <div class="grade g-dash secao">
      <div class="card"><div class="card-cab"><div><h2 class="t2">${I("trendUp")} Próximos 6 meses</h2><div class="fraco peq">Saldo disponível ao fim de cada mês, se tudo que vence acontecer</div></div><a class="link" data-a="ir" data-v="relatorios" data-p="fluxo">Detalhes</a></div>
        <div class="card-corpo">${graf}</div>
        <div class="tab-wrap"><table class="tab"><thead><tr><th>Mês</th><th class="r">Entra</th><th class="r">Sai</th><th class="r">Saldo no fim</th></tr></thead>
          <tbody>${juntar(comp,c=>h`<tr><td>${rotuloMes(c.mes)}</td><td class="r up">+${R(c.receber)}</td><td class="r">−${R(c.pagar+c.faturas+c.reservas)}</td>
            <td class="r"><b class="${c.saldoFinal<0?"down":""}">${R(c.saldoFinal)}</b></td></tr>`)}</tbody></table></div></div>
      <div class="card"><div class="card-cab"><h2 class="t2">${I("calendar")} Vence nos próximos 15 dias</h2></div>
        <div class="lista" style="margin-top:8px">${proximos.length?juntar(proximos,x=>{
          const rec=x.tipo==="RECEBER", fat=x.tipo==="FATURA";
          return h`<div class="clic"${fat?raw(' data-a="ir" data-v="faturas" data-p="'+x.cartao.id+"|"+x.fatura.ref+'"'):x.doc?clic("doc-abrir",x.doc.id):""}>
            <span class="bola ${rec?"up":x.vencimento<h0?"down":""}">${I(rec?"inflow":fat?"card":"outflow","p")}</span>
            <div class="meio"><div class="t">${fat?"Fatura "+x.cartao.nome:x.doc.descricao}</div><div class="s">${x.vencimento<h0?h`<span class="down">venceu ${fmtDataCurta(x.vencimento)}</span>`:"vence "+fmtDataCurta(x.vencimento)}${x.doc?.parceiro?" · "+L.nomeParceiro(x.doc.parceiro):""}</div></div>
            <div class="dir num" style="font-weight:600">${rec?"+":"−"}${R(x.valor)}</div></div>`; })
          :h`<div class="vazio peq" style="display:block">Nada vence nos próximos 15 dias.</div>`}</div></div>
    </div>
    <div class="grade g2 secao">${blocoContas}${blocoCartoes||h`<div class="card"><div class="card-cab"><h2 class="t2">${I("card")} Cartões</h2></div>${vazio({icone:"card",titulo:"Nenhum cartão",acoes:h`<button class="btn peq sec" data-a="cartao-novo">Cadastrar cartão</button>`})}</div>`}</div>
    <div class="grade g2 secao">
      <div class="card"><div class="card-cab"><div><h2 class="t2">${I("flow")} Entradas × saídas</h2><div class="fraco peq">Dinheiro disponível, últimos 6 meses (caixa)</div></div></div>
        <div class="card-corpo">${graficoColunas({rotulos:fl.map(x=>rotuloMesCurto(x.mes)),altura:190,
          series:[{nome:"Entradas",cor:"--serie1",valores:fl.map(x=>x.entradas)},{nome:"Saídas",cor:"--serie2",valores:fl.map(x=>x.saidas)}]})}</div></div>
      <div class="card"><div class="card-cab"><div><h2 class="t2">${I("layers")} Gastos de ${rotuloMes(mes)}</h2><div class="fraco peq">Por categoria, competência do mês</div></div><a class="link" data-a="ir" data-v="relatorios" data-p="resultado">Ver tudo</a></div>
        <div class="card-corpo">${cats.length?barrasRanking(cats.map(c=>({id:c.id,nome:c.nome,valor:c.total}))):h`<div class="fraco peq">Nenhuma despesa neste mês.</div>`}
          ${rs.terceiros.total?h`<div class="fraco peq" style="margin-top:10px">${I("handshake","p")} Fora disso, ${R(rs.terceiros.total)} em compras de terceiros (${rs.terceiros.pessoas.map(x=>L.nomeParceiro(x.pessoa)).join(", ")}), que vão te devolver.</div>`:""}</div></div>
    </div>`;
}});

/* a pagar / a receber de um mês que não é o atual: o que venceu (ou vai
   vencer) nele, e quanto ficou em aberto */
function kpiMes(rotulo,icone,x,tipo,rota,feito){
  const sub=!x.n?"nada vence":!x.restante?"tudo "+feito:x.restante===x.total?(tipo==="PASSADO"?h`<span class="down">nada ${feito}</span>`:x.n+" parcela"+(x.n>1?"s":""))
    :h`<span class="${tipo==="PASSADO"?"down":""}">${R(x.restante)} em aberto</span>`;
  return kpi({rotulo,icone,valor:R(x.total),sub,acao:"ir",v:rota});
}
/* a lista de lançamentos do mês, como a do 2.2 */
function lancamentosDoMes(L,rm){
  const xs=rm.lancamentos, max=12, mostrar=app.vgTodos?xs:xs.slice(0,max);
  const linha=d=>{
    const trf=d.tipo===DOC.TRANSF, entra=d.tipo===DOC.RECEBER||d.tipo===DOC.ESTORNO_CARTAO, cartao=d.tipo===DOC.COMPRA||d.tipo===DOC.ESTORNO_CARTAO;
    const e=COM_PARCELAS.has(d.tipo)?L.estadoDocumento(d):null;
    const sub=[fmtDataCurta(d.data), trf?L.nomeConta(d.conta)+" → "+L.nomeConta(d.contaDestino):cartao?L.nomeCartao(d.cartao):L.nomeCurtoCategoria(d.categoria), d.parcelas?.length>1?d.parcelas.length+"x":""].filter(Boolean).join(" · ");
    return h`<div class="clic"${clic("doc-abrir",d.id)}><span class="bola ${entra?"up":trf?"":"down"}">${I(trf?"swap":cartao?"card":entra?"inflow":"outflow","p")}</span>
      <div class="meio"><div class="t">${d.descricao}</div><div class="s">${sub}${d.terceiro?h` · <span class="terc">${I("handshake","p")} de ${L.nomeParceiro(d.terceiro.pessoa)}</span>`:""}</div></div>
      <div class="dir"><div class="num ${entra?"up":""}" style="font-weight:600">${trf?"":entra?"+":"−"}${R(d.valor)}</div>
        ${e&&!cartao?chipStLado(e.status,d.tipo===DOC.RECEBER):trf&&d.status==="PLANEJADA"?chipSt("PLANEJADA"):""}</div></div>`; };
  return h`<div class="card secao"><div class="card-cab"><div><h2 class="t2">${I("calendar")} Lançamentos de ${rotuloMes(rm.mes)}</h2>
      <div class="fraco peq">${xs.length?xs.length+" lançamento"+(xs.length>1?"s":"")+" com competência no mês":"O que pertence a este mês aparece aqui"}</div></div></div>
    <div class="lista" style="margin-top:8px">${xs.length?juntar(mostrar,linha):h`<div class="vazio peq" style="display:block">Nenhum lançamento em ${rotuloMes(rm.mes)}.</div>`}</div>
    ${xs.length>mostrar.length?h`<button class="btn sec peq larg" style="margin-top:10px" data-a="vg-todos">Mostrar todos (${xs.length})</button>`:""}</div>`;
}

function primeiroUso(){
  return h`<div class="card hero"><span class="cap">Bem-vindo ao WIGO</span><div class="grande" style="font-size:30px">Vamos montar seu financeiro</div>
    <div class="fraco" style="max-width:560px">Três passos: diga onde seu dinheiro está, registre o que entra e sai (ou importe o extrato do banco) e confira com o saldo real. O resto o WIGO calcula.</div>
    <div class="btns" style="margin-top:18px"><button class="btn" data-a="conta-nova">${I("bank")} Cadastrar conta</button>
    <button class="btn sec" data-a="cartao-novo">${I("card")} Cadastrar cartão</button><button class="btn sec" data-a="ir" data-v="importacao">${I("import")} Importar extrato</button></div></div>`;
}
