/* ══════════ SAÚDE DOS DADOS ══════════
   Confere que as duas pontas de cada relação contam a mesma história. Se
   alguma divergir, a tela mostra ONDE — nunca corrige sozinha, porque
   "ajustar para bater" esconderia justamente o erro que precisa aparecer.

   O que é conferido:
   1. todo lançamento soma zero;
   2. a dívida de cada cartão no razão = parcelas de compra em aberto;
   3. o a pagar / a receber de cada parceiro no razão = parcelas em aberto;
   4. todo pagamento: dinheiro = Σ(valor + juros − desconto) das alocações,
      e existe o lançamento correspondente;
   5. nenhuma parcela foi paga além do valor;
   6. transferência efetivada tem exatamente um lançamento ativo, com as duas
      pernas;
   7. documento com parcelas: a soma das parcelas = total;
   8. compra de outra pessoa tem exatamente uma conta a receber ativa, do
      mesmo valor e da mesma pessoa, que aponta de volta para ela — e a
      conta a receber vinculada não lança nada por conta própria. */

import { DOC, K, COM_PARCELAS, DO_CARTAO } from "./modelo.js";
import { soma, formatar } from "../nucleo/dinheiro.js";

export function verificar(L){
  const problemas=[];
  const p=(tipo,msg,ref)=>problemas.push({tipo,msg,ref});

  for(const l of L.lancamentos.values()){
    const t=soma(l.linhas,x=>x.v);
    if(t!==0) p("DESBALANCEADO","Lançamento \""+l.descricao+"\" soma "+formatar(t)+" em vez de zero.",{lancamento:l.id});
  }
  /* cartão: razão × parcelas */
  for(const c of L.cartoes.values()){
    const razao=L.dividaCartao(c.id);
    let parcelas=0;
    for(const {doc,p:pp} of (L.ix.parcelasCartao.get(c.id)||[])){
      if(doc.status==="CANCELADO") continue;
      parcelas+=L.sinalParcela(doc)*L.estadoParcela(pp,doc).restante;
    }
    if(razao!==parcelas) p("CARTAO","Cartão "+c.nome+": o razão deve "+formatar(razao)+" mas as parcelas em aberto somam "+formatar(parcelas)+".",{cartao:c.id});
  }
  /* parceiros: razão × parcelas */
  const abertoPN={P:new Map(),R:new Map()};
  for(const d of L.documentos.values()){
    if(d.tipo!==DOC.PAGAR&&d.tipo!==DOC.RECEBER||d.status==="CANCELADO") continue;
    const lado=d.tipo===DOC.PAGAR?"P":"R", pn=d.parceiro||"-";
    const r=L.estadoDocumento(d).restante;
    abertoPN[lado].set(pn,(abertoPN[lado].get(pn)||0)+r);
  }
  const chaves=new Set();
  for(const k of L.ix.linhas.keys()) if(k.startsWith("P:")||k.startsWith("R:")) chaves.add(k);
  for(const lado of ["P","R"]) for(const pn of abertoPN[lado].keys()) chaves.add(lado+":"+pn);
  for(const k of chaves){
    const lado=k[0], pn=k.slice(2);
    const razao=lado==="P"?-L.saldoChave(k):L.saldoChave(k);
    const parc=abertoPN[lado].get(pn)||0;
    if(razao!==parc) p("PARCEIRO",(lado==="P"?"A pagar":"A receber")+" de "+(pn==="-"?"sem parceiro":L.nomeParceiro(pn))+
      ": razão "+formatar(razao)+", parcelas "+formatar(parc)+".",{parceiro:pn});
  }
  /* pagamentos */
  for(const pg of L.pagamentos.values()){
    let calc=0;
    for(const a of pg.alocacoes){
      const r=L.ix.parcela.get(a.parcela);
      if(!r){ p("PAGAMENTO",pg.numero+" aponta para uma parcela que não existe.",{pagamento:pg.id}); continue; }
      calc+=L.sinalParcela(r.doc)*a.valor+(a.juros||0)-(a.desconto||0);
    }
    if(calc!==pg.valor) p("PAGAMENTO",pg.numero+": dinheiro "+formatar(pg.valor)+", alocações "+formatar(calc)+".",{pagamento:pg.id});
    if(pg.valor&&!L.lancamentosDoPagamento(pg.id).length) p("PAGAMENTO",pg.numero+" não tem lançamento no razão.",{pagamento:pg.id});
  }
  /* documentos */
  for(const d of L.documentos.values()){
    if(COM_PARCELAS.has(d.tipo)){
      const s=soma(d.parcelas,x=>x.valor);
      if(s!==d.valor) p("DOCUMENTO",d.numero+": parcelas somam "+formatar(s)+", total "+formatar(d.valor)+".",{documento:d.id});
      for(const pp of d.parcelas){ const e=L.estadoParcela(pp,d);
        if(e.pago>pp.valor) p("DOCUMENTO",d.numero+" parcela "+pp.n+" foi paga além do valor.",{documento:d.id}); }
    }
    if(d.tipo===DOC.TRANSF&&d.status==="EFETIVADO"){
      const ativos=L.lancamentosDoDocumento(d.id).filter(l=>l.natureza!=="ESTORNO"&&!L.lancamentoEstornado(l));
      const ok=ativos.length===1&&ativos[0].linhas.length===2&&
        ativos[0].linhas.some(x=>x.k===K.conta(d.conta)&&x.v===-d.valor)&&
        ativos[0].linhas.some(x=>x.k===K.conta(d.contaDestino)&&x.v===d.valor);
      if(!ok) p("TRANSFERENCIA",d.numero+" não tem as duas pernas no razão.",{documento:d.id});
    }
  }
  /* compra de outra pessoa ↔ conta a receber */
  for(const d of L.documentos.values()){
    if(d.status==="CANCELADO") continue;
    if(d.terceiro){
      const r=L.documentos.get(d.terceiro.receber);
      if(!r||r.status==="CANCELADO"||r.reembolsoDe!==d.id) p("TERCEIRO",d.numero+" é de outra pessoa mas não tem a conta a receber vinculada.",{documento:d.id});
      else if(r.valor!==d.valor||r.parceiro!==d.terceiro.pessoa) p("TERCEIRO",d.numero+" e "+r.numero+" não batem: compra de "+formatar(d.valor)+
        ", a receber "+formatar(r.valor)+(r.parceiro!==d.terceiro.pessoa?", de outra pessoa":"")+".",{documento:d.id});
    }
    if(d.reembolsoDe){
      const c=L.documentos.get(d.reembolsoDe);
      if(!c||c.status==="CANCELADO"||c.terceiro?.receber!==d.id) p("TERCEIRO",d.numero+" é um reembolso sem a compra de origem.",{documento:d.id});
      if(L.lancamentosDoDocumento(d.id).length) p("TERCEIRO",d.numero+" lançou no razão por conta própria; o a receber já nasce na compra.",{documento:d.id});
    }
  }
  return { ok:!problemas.length, problemas };
}
