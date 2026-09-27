/* ══════════ RECONCILIAÇÃO ══════════
   Objetivo: o saldo do WIGO e o do banco serem EXPLICÁVEIS um pelo outro.
   Nunca "saldo += diferença": a diferença é decomposta no que a causa.

   Com o extrato do período importado, a conta fecha exatamente:
       banco final − WIGO final
     = (banco inicial − WIGO inicial)       ← saldo inicial divergente
     + Σ só no banco                         ← falta lançar no WIGO
     − Σ só no WIGO                          ← lançado no WIGO, não no banco
   Pares conciliados têm o mesmo valor dos dois lados e se anulam. O que
   sobrar ("não explicado") é movimento do banco que não está no extrato
   importado. */

import { K, idChave } from "./modelo.js";
import { soma } from "../nucleo/dinheiro.js";
import { diasEntre, addDias, fmtData } from "../nucleo/datas.js";
import { semelhanca, normalizar } from "../nucleo/texto.js";
import { contextoLancamento } from "./relatorios.js";

/* movimentos da conta no período, com o contexto para comparar */
/* saldo inicial não é movimento do banco: é o ponto de partida */
export function ehAbertura(L,l){
  const d=l.documento?L.documentos.get(l.documento):null;
  return !!d&&d.tipo==="ABERTURA";
}
export function movimentosDaConta(L,conta,{de,ate}){
  return L.linhasDaChave(K.conta(conta)).filter(x=>(!de||x.data>=de)&&(!ate||x.data<=ate)&&!ehAbertura(L,x.l)).map(x=>{
    const ctx=contextoLancamento(L,x.l);
    return { id:x.l.id+"#"+x.i, lancamento:x.l.id, linha:x.i, data:x.data, valor:x.v, descricao:x.l.descricao,
      numero:ctx.numero, parceiro:ctx.parceiro?L.nomeParceiro(ctx.parceiro):"", conc:x.l.linhas[x.i].conc||null,
      refBanco:x.l.refBanco||null };
  });
}
export function linhasDoExtrato(L,conta,{de,ate}){
  return [...L.extrato.values()].filter(e=>e.conta===conta&&e.estado!=="IGNORADA"&&e.estado!=="DUPLICADA"&&
    (!de||e.data>=de)&&(!ate||e.data<=ate)).sort((a,b)=>a.data<b.data?-1:a.data>b.data?1:0);
}

/* Pontuação de 0 a 100. Valor diferente nunca casa: conciliar não altera
   valor, então só pares de mesmo valor são candidatos. Com o valor igual,
   pesam a proximidade da data e a semelhança da descrição. Mesmo
   identificador do banco é certeza. */
export function pontuar(banco,wigo){
  if(banco.valor!==wigo.valor) return {pontos:0,motivos:["valor diferente"]};
  if(banco.refBanco&&wigo.refBanco&&banco.refBanco===wigo.refBanco) return {pontos:100,motivos:["mesmo identificador do banco"]};
  const d=Math.abs(diasEntre(banco.data,wigo.data));
  const pd=d===0?1:d===1?.9:d===2?.8:d<=3?.7:d<=7?.45:d<=15?.2:0;
  if(!pd) return {pontos:0,motivos:["datas muito distantes"]};
  const s=Math.max(semelhanca(banco.descricao,wigo.descricao),
    wigo.parceiro?semelhanca(banco.descricao,wigo.parceiro):0,
    wigo.numero&&normalizar(banco.descricao).includes(normalizar(wigo.numero))?1:0);
  const pontos=Math.round(55+30*pd+15*Math.min(1,s*1.6));
  const motivos=["mesmo valor", d===0?"mesmo dia":d+" dia"+(d>1?"s":"")+" de diferença"];
  if(s>=.3) motivos.push("descrição parecida");
  return {pontos:Math.min(99,pontos),motivos};
}

/* Pares sugeridos: cada linha do banco com o melhor movimento ainda livre,
   do par mais certo para o menos certo. Nada é conciliado aqui — sugestão
   só vira conciliação com a confirmação do usuário. */
export function sugerirPares(banco,wigo,{minimo=60}={}){
  const cand=[];
  for(const b of banco){ if(b.conciliada) continue;
    for(const w of wigo){ if(w.conc) continue; const r=pontuar(b,w); if(r.pontos>=minimo) cand.push({b,w,...r}); } }
  cand.sort((x,y)=>y.pontos-x.pontos||Math.abs(diasEntre(x.b.data,x.w.data))-Math.abs(diasEntre(y.b.data,y.w.data)));
  const usadosB=new Set(), usadosW=new Set(), pares=[];
  for(const c of cand){ if(usadosB.has(c.b.id)||usadosW.has(c.w.id)) continue;
    usadosB.add(c.b.id); usadosW.add(c.w.id); pares.push(c); }
  return pares;
}

export function resumoConciliacao(L,{conta,de,ate,bancoInicial,bancoFinal}){
  /* a abertura dentro do período entra no saldo inicial, não na lista */
  const aberturas=L.linhasDaChave(K.conta(conta)).filter(x=>x.data>=de&&x.data<=ate&&ehAbertura(L,x.l));
  const wigoInicial=L.saldoConta(conta,addDias(de,-1))+soma(aberturas,x=>x.v);
  const wigoFinal=L.saldoConta(conta,ate);
  const mov=movimentosDaConta(L,conta,{de,ate});
  const ext=linhasDoExtrato(L,conta,{de,ate});
  const entradas=soma(mov.filter(x=>x.valor>0),x=>x.valor), saidas=-soma(mov.filter(x=>x.valor<0),x=>x.valor);
  const soNoWigo=mov.filter(x=>!x.conc);
  const soNoBanco=ext.filter(e=>!e.conciliada);
  const conciliados=mov.filter(x=>x.conc);
  const temBanco=bancoFinal!=null&&bancoFinal!=="";
  const diferenca=temBanco?bancoFinal-wigoFinal:null;
  const difInicial=bancoInicial!=null&&bancoInicial!==""?bancoInicial-wigoInicial:0;
  const somaSoBanco=soma(soNoBanco,e=>e.valor), somaSoWigo=soma(soNoWigo,x=>x.valor);
  const explicado=difInicial+somaSoBanco-somaSoWigo;
  const pares=sugerirPares(soNoBanco,soNoWigo);
  /* pistas do que costuma causar diferença */
  const pistas=[];
  if(difInicial) pistas.push({tipo:"INICIAL",valor:difInicial,texto:"O saldo inicial do banco e o do WIGO já começam diferentes no dia "+fmtData(de)+"."});
  const repetidos=new Map();
  for(const x of soNoWigo){ const k=x.valor+"|"+x.data; repetidos.set(k,(repetidos.get(k)||[]).concat(x)); }
  for(const [,xs] of repetidos) if(xs.length>1) pistas.push({tipo:"DUPLICADO",valor:xs[0].valor,texto:xs.length+" movimentos iguais no mesmo dia no WIGO — pode ser lançamento em dobro.",itens:xs});
  for(const e of soNoBanco) if(/fatura|cartao|cartão/i.test(e.descricao)&&e.valor<0)
    pistas.push({tipo:"FATURA",valor:e.valor,texto:"\""+e.descricao+"\" parece pagamento de fatura que não foi registrado no WIGO."});
  const planejadas=[...L.documentos.values()].filter(d=>d.tipo==="TRANSFERENCIA"&&d.status==="PLANEJADA"&&
    (d.conta===conta||d.contaDestino===conta)&&d.data>=de&&d.data<=ate);
  for(const d of planejadas) pistas.push({tipo:"TRANSFERENCIA",valor:d.valor,texto:d.numero+" está planejada e ainda não foi marcada como feita."});
  /* o suspeito mais comum: um movimento com exatamente o valor da diferença
     (lançado no WIGO e não no banco, ou o contrário), ou com metade dela
     (lançado com o sinal trocado) */
  if(temBanco&&diferenca){
    for(const x of soNoWigo){
      if(x.valor===-diferenca) pistas.push({tipo:"VALOR",valor:x.valor,texto:"\""+x.descricao+"\" ("+x.data.split("-").reverse().join("/")+") tem exatamente o valor da diferença — confira se ele aparece no banco.",itens:[x]});
      else if(x.valor*2===-diferenca) pistas.push({tipo:"SINAL",valor:x.valor,texto:"\""+x.descricao+"\" vale metade da diferença — pode ter sido lançado como "+(x.valor>0?"entrada":"saída")+" quando era "+(x.valor>0?"saída":"entrada")+".",itens:[x]});
    }
    for(const e of soNoBanco) if(e.valor===diferenca) pistas.push({tipo:"VALOR",valor:e.valor,texto:"\""+e.descricao+"\" está no extrato com exatamente o valor da diferença e ainda não foi lançado.",itens:[e]});
  }
  return { conta, de, ate, wigoInicial, wigoFinal, entradas, saidas, bancoInicial:bancoInicial??null, bancoFinal:temBanco?bancoFinal:null,
    diferenca, difInicial, soNoBanco, soNoWigo, conciliados, somaSoBanco, somaSoWigo, comExtrato:ext.length>0,
    naoExplicado:temBanco?diferenca-explicado:null, pares, pistas,
    fechada:temBanco&&diferenca===0&&!soNoWigo.length&&!soNoBanco.length };
}
