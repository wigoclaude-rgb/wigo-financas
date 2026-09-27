/* ══════════ MIGRAÇÃO DO 2.2 ══════════
   Lê o JSON antigo (users/{uid}.data) e reconstrói tudo no modelo novo,
   passando pelos MESMOS comandos que a tela usa — um lançamento migrado é
   igual a um digitado. O JSON antigo nunca é alterado nem apagado: se algo
   der errado, ele continua lá.

   Como cada coisa do 2.2 vira documento:
     à vista            → 1 documento, 1 parcela (+ pagamento se estava pago)
     parcelado          → 1 documento com as N parcelas
     fixo mensal        → 1 recorrência + 1 documento por mês
     compra no cartão   → compra com parcelas nas mesmas faturas
     fatura paga        → 1 pagamento por (cartão, data, conta), quitando as parcelas
     transferência      → transferência (um lançamento, duas pernas)
     guardar em meta    → transferência para a conta de reserva da meta
     meta               → conta de RESERVA (alvo, aporte, CDI preservados)
     ticket             → conta de BENEFÍCIO; recargas viram recebimentos
     lixeira            → documento CANCELADO, sem efeito no saldo
     pago com juros     → pagamento com juros (payAmt > valor) ou desconto

   Saldo inicial: o 2.2 ignorava tudo que foi pago ANTES do mês de abertura
   (já estava dentro do valor informado). Aqui esses pagamentos entram no
   razão, então o saldo inicial é recalculado para descontá-los — e a partir
   do mês de abertura o saldo de cada conta fica idêntico ao do 2.2.

   No fim, a migração CONFERE: saldo de cada conta, dívida de cada cartão e
   total em aberto, 2.2 × 3. O relatório mostra o resultado. */

import { Livro } from "../financas/livro.js";
import * as C from "../financas/comandos.js";
import { DOC, PREFIXO } from "../financas/modelo.js";
import { verificar } from "../financas/integridade.js";
import { hoje, mesDe, fimDoMes, diaNoMes, addMesesMes, valida } from "../nucleo/datas.js";
import { novoId } from "../nucleo/ids.js";
import { saldoLegado, cartaoLegado, abertoLegado, legadoAtivos } from "./legado.js";

export const VERSAO_DADOS=3;
const TIPO_CONTA={corrente:"BANCO",poupanca:"BANCO",dinheiro:"DINHEIRO",investimento:"RESERVA",outro:"OUTRA"};
const FORMA={cartao:"cartao",ticket:"beneficio",pix:"pix",boleto:"boleto",debito:"debito",transferencia:"transferencia",dinheiro:"dinheiro"};
const c=v=>Math.round((Number(v)||0)*100);
const mk=iso=>(iso||"").slice(0,7);
const pagoEm=t=>t.payDate||t.due;
const efMes=t=>t.comp||(t.paid?mk(pagoEm(t)):mk(t.due));

export function migrarLegado(S0){
  const S={...S0,tx:(S0.tx||[]).filter(t=>t&&t.id),accounts:S0.accounts||[],cards:S0.cards||[],tickets:S0.tickets||[],
    goals:S0.goals||[],people:S0.people||[],expCats:S0.expCats||[],incCats:S0.incCats||[]};
  const L=new Livro(), avisos=[], cont={contas:0,parceiros:0,categorias:0,cartoes:0,documentos:0,pagamentos:0,recorrencias:0,cancelados:0,ignorados:0};
  const run=m=>{ L.aplicar(m); return m; };
  const primeiroId=(m,col)=>m.gravar.find(x=>x.colecao===col).id;
  const h=hoje(), mesAtual=mesDe(h);

  /* ── categorias ── */
  const catId={DESPESA:new Map(),RECEITA:new Map()};
  const categoria=(nome,natureza)=>{
    if(!nome) return null; const mapa=catId[natureza];
    if(mapa.has(nome)) return mapa.get(nome);
    const igual=[...L.categorias.values()].find(x=>x.natureza===natureza&&x.nome.toLowerCase()===String(nome).toLowerCase());
    if(igual){ mapa.set(nome,igual.id); return igual.id; }
    const id=primeiroId(run(C.salvarCategoria(L,{nome:String(nome),natureza,legado:{nome}})),"categorias");
    mapa.set(nome,id); cont.categorias++; return id;
  };
  S.expCats.forEach(n=>categoria(n,"DESPESA")); S.incCats.forEach(n=>categoria(n,"RECEITA"));

  /* ── parceiros ── */
  const pn=new Map();
  for(const p of S.people){ pn.set(p.id,primeiroId(run(C.salvarParceiro(L,{nome:p.name||"Sem nome",obs:p.note||"",tipo:"PESSOA",legado:{id:p.id}})),"parceiros")); cont.parceiros++; }

  /* ── contas ── */
  let contas=[...S.accounts];
  const semContaNoLegado=!contas.length&&(S.opening||S.tx.length);
  if(semContaNoLegado) contas=[{id:"__principal",name:"Principal",bank:"",type:"corrente",color:"#6C3BFF",opening:S.opening?{...S.opening}:null}];
  const idsLegado=new Set(contas.map(a=>a.id));
  const ehCartaoOuVale=t=>!!t.cardId||t.method==="cartao"||t.method==="ticket"||!!t.ticketId;
  /* sem conta: movimento de caixa cuja conta não existe — e também compra no
     cartão paga quando o cartão não tinha conta de débito (o 2.2 somava no
     total, mas em conta nenhuma) */
  const orfao=t=>t.type!=="xfer"&&(!t.accId||!idsLegado.has(t.accId))&&
    (!ehCartaoOuVale(t)||(!!t.cardId&&t.paid&&t.method!=="ticket"));
  const orfaos=legadoAtivos(S).filter(orfao);
  let contaOrfaos=null;
  if(semContaNoLegado) contaOrfaos="__principal";
  else if(orfaos.length&&contas.length===1) contaOrfaos=contas[0].id;
  else if(orfaos.length){ contaOrfaos="__semconta";
    contas.push({id:"__semconta",name:"Sem conta (migração)",bank:"",type:"outro",color:"#64748b",opening:null});
    avisos.push(orfaos.length+" lançamento(s) sem conta foram para \"Sem conta (migração)\". O total é o mesmo do 2.2; mova-os para a conta certa quando puder."); }
  const contaDoTx=t=>(t.accId&&idsLegado.has(t.accId))?t.accId:(orfao(t)?contaOrfaos:null);
  const minAbertura=contas.reduce((m,a)=>(a.opening&&(!m||a.opening.month<m))?a.opening.month:m,null);
  const acc=new Map();
  for(const a of contas){
    /* efeito, nesta conta, do que foi pago antes do mês de abertura */
    const mesAb=a.id==="__semconta"?minAbertura:(a.opening?.month||null);
    let pre=0, maisCedo=null;
    for(const t of legadoAtivos(S)){
      if(!t.paid) continue;
      const alvo=t.type==="xfer"?(t.accId===a.id||t.accTo===a.id):contaDoTx(t)===a.id; if(!alvo) continue;
      const d=pagoEm(t); if(!maisCedo||d<maisCedo) maisCedo=d;
      if(mesAb&&mk(d)<mesAb){
        const v=c(t.payAmt??t.amount);
        pre+=t.type==="xfer"?(t.accTo===a.id?v:-v):(t.type==="inc"?v:-v);
      }
    }
    const temAbertura=!!a.opening||(a.id==="__semconta"&&pre);
    const dataAb=temAbertura?[mesAb?mesAb+"-01":null,maisCedo].filter(Boolean).sort()[0]:(maisCedo||h);
    const saldoIni=temAbertura?c(a.opening?.amount)-pre:0;
    const m=run(C.criarConta(L,{nome:a.name||"Conta",tipo:TIPO_CONTA[a.type]||"BANCO",instituicao:a.bank||"",cor:a.color||"#7c5cff",
      origem:"MIGRACAO",legado:{id:a.id}},{saldoInicial:saldoIni,dataAbertura:dataAb}));
    acc.set(a.id,primeiroId(m,"contas")); cont.contas++;
    if(pre&&a.opening) avisos.push("Saldo inicial de "+a.name+": R$ "+(c(a.opening.amount)/100).toFixed(2)+" em "+a.opening.month+
      ", descontados "+(pre/100).toFixed(2)+" de movimentos anteriores que o 2.2 não somava. O saldo a partir de "+a.opening.month+" é o mesmo.");
    if(a.type==="investimento") avisos.push("A conta "+a.name+" (investimento) passa a ser Reserva: continua no patrimônio, fora do disponível.");
  }

  /* ── metas → contas de reserva ── */
  const meta=new Map();
  for(const g of S.goals){
    const datas=(g.moves||[]).map(mv=>mv.date).filter(valida).sort();
    const m=run(C.criarConta(L,{nome:g.name||"Meta",tipo:"RESERVA",instituicao:g.bank||"",cor:g.color||"#0f766e",origem:"MIGRACAO",
      reserva:{alvo:c(g.goal),aporte:c(g.monthly),cdi:g.cdi||0,naInicio:!!g.showHome},legado:{id:g.id,tipo:"meta"}},
      {dataAbertura:datas[0]||h}));
    const id=primeiroId(m,"contas"); meta.set(g.id,id); cont.contas++;
    for(const mv of (g.moves||[])){
      if(mv.txId||!(mv.amount>0)||!valida(mv.date)) continue;
      run(C.ajustarSaldo(L,{conta:id,valor:(mv.kind==="out"?-1:1)*c(mv.amount),data:mv.date,
        motivo:mv.kind==="out"?"Retirada registrada direto na meta (2.2)":"Aporte registrado direto na meta (2.2)"}));
    }
  }

  /* ── tickets → contas de benefício ── */
  const vale=new Map();
  const catBeneficio=S.tickets.length?categoria("Benefícios","RECEITA"):null;
  for(const tk of S.tickets){
    const gastos=legadoAtivos(S).filter(t=>t.ticketId===tk.id);
    const primeiroMes=gastos.map(t=>mk(t.due)).sort()[0]||mesAtual;
    const m=run(C.criarConta(L,{nome:tk.name||tk.brand||"Vale",tipo:"BENEFICIO",instituicao:tk.brand||"",cor:tk.color||"#b45309",
      origem:"MIGRACAO",legado:{id:tk.id,tipo:"ticket"}},{dataAbertura:primeiroMes+"-01"}));
    const id=primeiroId(m,"contas"); vale.set(tk.id,id); cont.contas++;
    const r=C.criarDocumento; // recargas passadas: recebidas no dia da recarga
    for(let mm=primeiroMes;mm<=mesAtual;mm=addMesesMes(mm,1)){
      const v=c(tk.overrides&&tk.overrides[mm]!=null?tk.overrides[mm]:tk.monthly); if(!(v>0)) continue;
      const data=diaNoMes(mm,tk.day||1); if(data>h) continue;
      run(r(L,{tipo:DOC.RECEBER,descricao:"Recarga "+(tk.name||"vale"),valor:v,data,categoria:catBeneficio,conta:id,forma:"beneficio",
        origem:"MIGRACAO",silencioso:true,quitar:{data,conta:id,forma:"beneficio"}})); cont.documentos++; cont.pagamentos++;
    }
    avisos.push("O vale "+(tk.name||"")+" virou conta de benefício: as recargas entram como receita e o saldo passa a acumular de um mês para o outro, como no cartão de verdade.");
  }

  /* ── cartões ── */
  const card=new Map();
  for(const k of S.cards){
    const m=run(C.salvarCartao(L,{nome:k.nick||k.bank||"Cartão",instituicao:k.bank||"",bandeira:"",cor:k.color||"#5b21b6",
      limite:k.noLimit?null:c(k.limit),fechamento:Math.min(31,Math.max(1,k.closeDay||1)),vencimento:Math.min(31,Math.max(1,k.dueDay||10)),
      contaPagamento:acc.get(k.accId)||null,legado:{id:k.id}}));
    card.set(k.id,primeiroId(m,"cartoes")); cont.cartoes++;
  }

  /* ── lançamentos, em ordem cronológica de grupo ── */
  const M=new C.Mudanca(L);
  const grupos=new Map();
  for(const t of S.tx){ const g=t.gid||t.id; if(!grupos.has(g)) grupos.set(g,[]); grupos.get(g).push(t); }
  const ordem=[...grupos.values()].map(g=>g.sort((a,b)=>(a.due||"")<(b.due||"")?-1:(a.due||"")>(b.due||"")?1:(a.i||0)-(b.i||0)))
    .sort((a,b)=>(a[0].due||"")<(b[0].due||"")?-1:1);
  const faturasPagas=new Map();   // cartão|data|conta → [{parcela, t}]
  const pagar=(t,parcelaId,dir,conta,forma)=>{
    const v=c(t.amount), pv=c(t.payAmt??t.amount);
    C.registrarPagamento(L,{direcao:dir,data:pagoEm(t),conta,forma,origem:"MIGRACAO",silencioso:true,legado:{tx:[t.id]},
      alocacoes:[{parcela:parcelaId,valor:v,juros:Math.max(0,pv-v),desconto:Math.max(0,v-pv)}]},M);
    cont.pagamentos++;
  };
  const cancelado=(t,tipo)=>{
    const id=novoId("d");
    M.set("documentos",id,{id,numero:M.numero(PREFIXO[tipo]),tipo,status:"CANCELADO",descricao:t.desc||"Sem descrição",
      valor:c(t.amount),data:t.due||h,competencia:efMes(t),parceiro:pn.get(t.pesId)||null,categoria:null,conta:null,cartao:card.get(t.cardId)||null,
      forma:FORMA[t.method]||null,obs:"",origem:"MIGRACAO",parcelas:[{id:id+".1",n:1,de:1,valor:c(t.amount),vencimento:t.due||h}],canceladoEm:mk(t.deletedAt||"")?String(t.deletedAt).slice(0,10):h,
      motivoCancelamento:"Estava na lixeira do 2.2",legado:{tx:[t.id]},criadoEm:new Date().toISOString(),atualizadoEm:new Date().toISOString()});
    cont.cancelados++;
  };

  for(const g of ordem){
    const t0=g[0];
    /* lixeira: preserva o registro, sem efeito */
    const vivos=g.filter(t=>!t.deleted);
    for(const t of g.filter(t=>t.deleted)) if(c(t.amount)>0) cancelado(t,t.type==="inc"?DOC.RECEBER:(t.cardId?DOC.COMPRA:DOC.PAGAR));
    if(!vivos.length) continue;
    const zerados=vivos.filter(t=>!(c(t.amount)>0));
    if(zerados.length){ cont.ignorados+=zerados.length; avisos.push(zerados.length+" lançamento(s) de valor zero não foram migrados ("+t0.desc+")."); }
    const itens=vivos.filter(t=>c(t.amount)>0);
    if(!itens.length) continue;

    /* transferência */
    if(t0.type==="xfer"){
      for(const t of itens){
        const de=acc.get(t.accId), para=acc.get(t.accTo);
        if(de&&para&&de!==para) C.criarTransferencia(L,{de,para,valor:c(t.payAmt??t.amount),data:pagoEm(t),
          descricao:t.desc,origem:"MIGRACAO",silencioso:true,legado:{tx:[t.id]}},M);
        else { const so=de||para;
          if(so){ const v=c(t.payAmt??t.amount)*(de?-1:1);
            const r=C.ajustarSaldo(L,{conta:so,valor:v,data:pagoEm(t),motivo:"Transferência incompleta no 2.2 (a outra conta foi apagada)"});
            for(const x of r.gravar) if(x.colecao!=="meta") M.set(x.colecao,x.id,x.dados);
            avisos.push("\""+t.desc+"\" era uma transferência com uma perna só; virou ajuste em "+L.nomeConta(so)+"."); }
          else { cont.ignorados++; avisos.push("Transferência \""+t.desc+"\" sem nenhuma conta existente foi ignorada."); } }
        cont.documentos++;
      }
      continue;
    }
    /* guardar em meta */
    if(t0.dest==="savings"&&meta.get(t0.goalId)){
      for(const t of itens){
        const de=contaDoTx(t)?acc.get(contaDoTx(t)):null;
        const origemConta=de||acc.get(contaOrfaos)||[...acc.values()][0];
        if(!origemConta){ cont.ignorados++; continue; }
        C.criarTransferencia(L,{de:origemConta,para:meta.get(t.goalId),valor:c(t.paid?(t.payAmt??t.amount):t.amount),
          data:t.paid?pagoEm(t):t.due,planejada:!t.paid,descricao:t.desc,origem:"MIGRACAO",silencioso:true,legado:{tx:[t.id]}},M);
        cont.documentos++;
      }
      continue;
    }
    const noCartao=!!t0.cardId&&card.has(t0.cardId);
    const noVale=!!t0.ticketId&&vale.has(t0.ticketId);
    const tipo=noCartao?(t0.type==="inc"?DOC.ESTORNO_CARTAO:DOC.COMPRA):(t0.type==="inc"?DOC.RECEBER:DOC.PAGAR);
    const natureza=tipo===DOC.RECEBER?"RECEITA":"DESPESA";
    const cat=categoria(t0.dest==="savings"?"Poupança":t0.cat,natureza);
    const conta=noVale?vale.get(t0.ticketId):(contaDoTx(t0)?acc.get(contaDoTx(t0)):null);
    const base={tipo,parceiro:pn.get(t0.pesId)||null,categoria:cat,cartao:noCartao?card.get(t0.cardId):null,
      forma:noVale?"beneficio":(FORMA[t0.method]||null),conta:noCartao?null:conta,origem:"MIGRACAO",silencioso:true};
    const grupoDoc=(lista)=>{
      const id=novoId("d");
      C.criarDocumento(L,{...base,id,descricao:t0.desc,valor:lista.reduce((s,t)=>s+c(t.amount),0),data:lista[0].due,
        competencia:efMes(lista[0]),parcelas:lista.map(t=>noCartao?{valor:c(t.amount),fatura:mk(t.due),vencimento:t.due}:{valor:c(t.amount),vencimento:t.due}),
        legado:{gid:t0.gid||null,tx:lista.map(t=>t.id),impId:lista[0].impId||null}},M);
      cont.documentos++;
      lista.forEach((t,i)=>{
        const pid=id+"."+(i+1);
        if(noVale){ pagar({...t,paid:true},pid,"SAIDA",conta,"beneficio"); return; }
        if(!t.paid) return;
        if(noCartao){ const contaPg=acc.get(t.accId)||acc.get(contaOrfaos)||[...acc.values()][0];
          const k=t0.cardId+"|"+pagoEm(t)+"|"+contaPg; if(!faturasPagas.has(k)) faturasPagas.set(k,{cartao:card.get(t0.cardId),data:pagoEm(t),conta:contaPg,itens:[]});
          faturasPagas.get(k).itens.push({parcela:pid,t,sinal:tipo===DOC.ESTORNO_CARTAO?-1:1}); return; }
        const cp=conta||acc.get(contaOrfaos);
        if(!cp){ avisos.push("\""+t.desc+"\" estava pago sem conta; ficou em aberto."); return; }
        pagar(t,pid,tipo===DOC.RECEBER?"ENTRADA":"SAIDA",cp,base.forma);
      });
      return id;
    };
    if(t0.kind==="parcelado"&&itens.length>1&&!t0.perp) grupoDoc(itens);
    else if(t0.kind==="fixo"||t0.perp){
      const rid=novoId("r"), ult=itens[itens.length-1];
      itens.forEach((t,i)=>{ const id=grupoDoc([t]); const d=M.obter("documentos",id); M.set("documentos",id,{...d,recorrencia:rid,sequencia:i+1}); });
      M.set("recorrencias",rid,{id:rid,tipo,ativa:true,inicio:itens[0].due,quantidade:t0.perp?null:(t0.n||itens.length),
        geradas:itens.length,ultima:ult.due,modelo:{descricao:ult.desc,valor:c(ult.amount),parceiro:base.parceiro,categoria:cat,
        conta:base.conta,cartao:base.cartao,forma:base.forma,obs:""},legado:{gid:t0.gid},criadoEm:new Date().toISOString(),atualizadoEm:new Date().toISOString()});
      cont.recorrencias++;
    }
    else for(const t of itens) grupoDoc([t]);
  }
  /* faturas pagas: um pagamento por evento, como foi feito no 2.2 */
  for(const f of faturasPagas.values()){
    const alocacoes=f.itens.map(({parcela,t,sinal})=>{ const v=c(t.amount), pv=c(t.payAmt??t.amount);
      return sinal>0?{parcela,valor:v,juros:Math.max(0,pv-v),desconto:Math.max(0,v-pv)}:{parcela,valor:v}; });
    try{ C.registrarPagamento(L,{direcao:"SAIDA",data:f.data,conta:f.conta,cartao:f.cartao,forma:"debito",origem:"MIGRACAO",
      silencioso:true,descricao:"Fatura "+L.nomeCartao(f.cartao),alocacoes},M); cont.pagamentos++; }
    catch(e){ avisos.push("Pagamento de fatura de "+f.data+" não pôde ser migrado: "+e.message); }
  }
  M.fechar();
  L.aplicar(M);

  /* preferências e marca da migração */
  const prefs={id:"preferencias",nomeApp:S.appName||"WIGO",cdiRef:S.cdiRef||null,tutorialVisto:!!S.tutorialSeen,
    contaPadrao:acc.get(contas[0]?.id)||null};

  /* ── conferência 2.2 × 3 ── */
  const conferencia=[];
  const fim=fimDoMes(mesAtual);
  for(const a of contas){
    const antes=a.id==="__principal"&&semContaNoLegado?saldoLegado(S,mesAtual,null):saldoLegado(S,mesAtual,a.id==="__semconta"?"__semconta":a.id);
    const depois=L.saldoConta(acc.get(a.id),fim);
    if(a.id==="__semconta") continue;
    conferencia.push({item:"Saldo de "+(a.name||"conta"),antes,depois,ok:antes===depois});
  }
  const legadoTotal=saldoLegado(S,mesAtual,null);
  const novoTotal=contas.reduce((s,a)=>s+L.saldoConta(acc.get(a.id),fim),0);
  conferencia.push({item:"Saldo total (sem metas nem vales)",antes:legadoTotal,depois:novoTotal,ok:legadoTotal===novoTotal});
  for(const k of S.cards){ const antes=cartaoLegado(S,k.id), depois=L.dividaCartao(card.get(k.id));
    conferencia.push({item:"Em aberto no cartão "+(k.nick||k.bank),antes,depois,ok:antes===depois}); }
  const valeContas=new Set(vale.values());
  const aberto=tipo=>[...L.documentos.values()].filter(d=>d.tipo===tipo&&!valeContas.has(d.conta)&&d.status!=="CANCELADO")
    .reduce((s,d)=>s+L.estadoDocumento(d).restante,0);
  const apAntes=abertoLegado(S,"exp"), arAntes=abertoLegado(S,"inc");
  conferencia.push({item:"Total a pagar em aberto",antes:apAntes,depois:aberto(DOC.PAGAR)-L.documentos.size*0,ok:apAntes===aberto(DOC.PAGAR)});
  conferencia.push({item:"Total a receber em aberto",antes:arAntes,depois:aberto(DOC.RECEBER),ok:arAntes===aberto(DOC.RECEBER)});
  const saude=verificar(L);
  const relatorio={versao:VERSAO_DADOS,origem:"2.2",em:new Date().toISOString(),contagem:cont,conferencia,avisos,
    integridade:saude.problemas.map(p=>p.msg),ok:conferencia.every(x=>x.ok)&&saude.ok};
  L.meta.set("preferencias",prefs);
  return { livro:L, relatorio };
}

/* há dados do 2.2 para migrar? */
export function temLegado(dados){
  if(!dados||typeof dados!=="string") return false;
  try{ const S=JSON.parse(dados); return !!(S&&((S.tx&&S.tx.length)||(S.accounts&&S.accounts.length)||(S.cards&&S.cards.length)||(S.goals&&S.goals.length)||(S.people&&S.people.length))); }
  catch{ return false; }
}
