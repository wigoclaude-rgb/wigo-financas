/* ══════════ CARTÕES E FATURAS ══════════
   A fatura não é guardada: ela é o conjunto das parcelas de compra (e de
   estorno) marcadas com aquele mês de referência. Total, pago, restante e
   situação saem dessas parcelas e dos pagamentos que as liquidaram. Guardar
   um "total da fatura" criaria um segundo número que pode discordar do
   primeiro — foi exatamente assim que o limite do cartão no 2.2 passou a
   depender do mês que estava na tela.

   Referência da fatura = mês do VENCIMENTO ("fatura de outubro" vence em
   outubro). Mesma convenção do 2.2, então as faturas migradas caem no
   mesmo lugar. */

import { DOC, ST } from "./modelo.js";
import { diaNoMes, mesDe, addMesesMes, hoje } from "../nucleo/datas.js";

/* Regra do 2.2 (cardFirstDue), mantida: compra ATÉ o dia do fechamento entra
   na fatura que fecha naquele mês; depois dele, na seguinte. Se o vencimento
   cai antes do fechamento no calendário (fecha 28, vence 5), a fatura vence
   no mês seguinte ao do fechamento. */
export function faturaDaCompra(cartao,dataCompra){
  const dia=+dataCompra.slice(8,10);
  let mesFecha=mesDe(dataCompra);
  if(dia>cartao.fechamento) mesFecha=addMesesMes(mesFecha,1);
  return cartao.vencimento<=cartao.fechamento?addMesesMes(mesFecha,1):mesFecha;
}
export function datasFatura(cartao,ref){
  const mesFecha=cartao.vencimento<=cartao.fechamento?addMesesMes(ref,-1):ref;
  return { fechamento:diaNoMes(mesFecha,cartao.fechamento), vencimento:diaNoMes(ref,cartao.vencimento) };
}
/* a fatura em que uma compra feita hoje entraria */
export function faturaCorrente(cartao){ return faturaDaCompra(cartao,hoje()); }

export function itensDaFatura(L,cartaoId,ref){
  return (L.ix.parcelasCartao.get(cartaoId)||[])
    .filter(x=>x.p.fatura===ref&&x.doc.status!=="CANCELADO")
    .map(x=>({...x,e:L.estadoParcela(x.p,x.doc),sinal:L.sinalParcela(x.doc)}))
    .sort((a,b)=>(a.doc.data<b.doc.data?-1:a.doc.data>b.doc.data?1:(a.doc.numero<b.doc.numero?-1:1)));
}

export function fatura(L,cartaoId,ref){
  const cartao=L.cartoes.get(cartaoId);
  const itens=itensDaFatura(L,cartaoId,ref);
  const {fechamento,vencimento}=datasFatura(cartao,ref);
  let total=0,pago=0,restante=0,creditos=0;
  for(const it of itens){
    total+=it.sinal*it.p.valor; pago+=it.sinal*it.e.pago; restante+=it.sinal*it.e.restante;
    if(it.sinal<0) creditos+=it.e.restante;
  }
  const h=hoje();
  let status;
  if(!itens.length) status="VAZIA";
  else if(restante<=0) status=ST.PAGA;
  else if(h<fechamento) status=ST.ABERTA;
  else if(h<=vencimento) status=pago>0?ST.PARCIAL:"FECHADA";
  else status=ST.VENCIDA;
  return { cartao, ref, fechamento, vencimento, itens, total, pago, restante, creditos, status,
    parcial:pago>0&&restante>0 };
}

/* todas as faturas com algum item, mais a corrente mesmo vazia */
export function faturasDoCartao(L,cartaoId){
  const cartao=L.cartoes.get(cartaoId);
  const refs=new Set((L.ix.parcelasCartao.get(cartaoId)||[]).filter(x=>x.doc.status!=="CANCELADO").map(x=>x.p.fatura));
  refs.add(faturaCorrente(cartao));
  return [...refs].sort().map(r=>fatura(L,cartaoId,r));
}

/* Limite usado = tudo que ainda se deve ao cartão, inclusive parcelas de
   faturas futuras — é assim que o banco calcula. Vem do razão (a dívida),
   e a verificação de integridade confere que bate com a soma das parcelas
   em aberto. */
export function limiteCartao(L,cartaoId){
  const c=L.cartoes.get(cartaoId);
  const usado=Math.max(0,L.dividaCartao(cartaoId));
  const limite=c.limite==null?null:c.limite;
  return { limite, usado, disponivel:limite==null?null:limite-usado,
    pct:limite?Math.min(100,Math.round(usado/limite*100)):0 };
}

/* Distribui um pagamento de fatura pelas parcelas: primeiro os créditos de
   estorno abatem as compras, depois o dinheiro, sempre da compra mais antiga
   para a mais nova. Pagamento parcial deixa as últimas em aberto — e a
   fatura fica PARCIAL, com o restante à vista. */
export function alocarPagamentoFatura(L,cartaoId,ref,valor){
  const f=fatura(L,cartaoId,ref);
  const compras=f.itens.filter(i=>i.sinal>0&&i.e.restante>0);
  const estornos=f.itens.filter(i=>i.sinal<0&&i.e.restante>0);
  const devido=compras.reduce((s,i)=>s+i.e.restante,0);
  const creditos=estornos.reduce((s,i)=>s+i.e.restante,0);
  const quitavel=Math.min(devido,valor+creditos);
  const creditoUsado=Math.min(creditos,quitavel);
  const dinheiro=quitavel-creditoUsado;
  const alocacoes=[];
  let resto=quitavel;
  for(const i of compras){ if(resto<=0) break; const v=Math.min(i.e.restante,resto);
    alocacoes.push({parcela:i.p.id,documento:i.doc.id,valor:v,juros:0,desconto:0}); resto-=v; }
  let cr=creditoUsado;
  for(const i of estornos){ if(cr<=0) break; const v=Math.min(i.e.restante,cr);
    alocacoes.push({parcela:i.p.id,documento:i.doc.id,valor:v,juros:0,desconto:0}); cr-=v; }
  return { alocacoes, dinheiro, creditoUsado, devido, creditos, sobra:valor-dinheiro, fatura:f };
}

/* A fatura dividida: o que é meu e o que comprei para outras pessoas, e
   quanto cada uma já devolveu. O total não muda — é o que o banco cobra; a
   divisão é só uma leitura das compras. "Nesta fatura" é a parcela deste
   mês; devolvido e falta são da compra inteira (a gasolina de R$ 600 em 3x
   aparece com R$ 200 aqui e R$ 600 a devolver). */
export function divisaoDaFatura(L,f){
  let minhas=0,terceiros=0; const porPessoa=new Map();
  for(const it of f.itens){
    const v=it.sinal*it.p.valor, t=it.doc.terceiro;
    if(!t){ minhas+=v; continue; }
    terceiros+=v;
    if(!porPessoa.has(t.pessoa)) porPessoa.set(t.pessoa,{pessoa:t.pessoa,nestaFatura:0,compras:new Map()});
    const x=porPessoa.get(t.pessoa); x.nestaFatura+=v; x.compras.set(it.doc.id,it.doc);
  }
  const pessoas=[...porPessoa.values()].map(x=>{
    let total=0,devolvido=0,falta=0;
    for(const c of x.compras.values()){ const r=L.documentos.get(c.terceiro.receber);
      if(!r||r.status==="CANCELADO") continue;
      const e=L.estadoDocumento(r); total+=r.valor; devolvido+=e.pago; falta+=e.restante; }
    return {pessoa:x.pessoa,nestaFatura:x.nestaFatura,compras:[...x.compras.values()],total,devolvido,falta};
  }).sort((a,b)=>b.nestaFatura-a.nestaFatura);
  return { total:f.total, minhas, terceiros, pessoas,
    devolvido:pessoas.reduce((s,x)=>s+x.devolvido,0), aReceber:pessoas.reduce((s,x)=>s+x.falta,0) };
}
