/* ══════════ RELATÓRIOS ══════════
   Todo relatório é uma leitura do mesmo livro: linhas do razão (caixa e
   competência) e parcelas em aberto (o futuro). Nenhum tem regra de saldo
   própria — se o Razão, o Fluxo de Caixa e a Visão Geral mostram o saldo de
   setembro, é a mesma soma, feita pela mesma função.

   Duas leituras do tempo, nunca misturadas:
     COMPETÊNCIA — a que mês a despesa/receita pertence (linhas E:/I:, pela
                   competência do lançamento);
     CAIXA       — quando o dinheiro se moveu (linhas A:, pela data). */

import { K, DOC, DISPONIVEL, CATEGORIA_SISTEMA, tipoChave, idChave, COM_PARCELAS } from "./modelo.js";
import { hoje, mesDe, addMesesMes, fimDoMes, inicioDoMes, addDias, diasEntre } from "../nucleo/datas.js";
import { soma } from "../nucleo/dinheiro.js";
import { faturasDoCartao, fatura } from "./cartoes.js";

const disponivel=(L,id)=>DISPONIVEL.has(L.contas.get(id)?.tipo);

/* ── contexto de uma linha do razão: documento, parceiro, categoria ── */
export function contextoLancamento(L,l){
  if(l.pagamento){
    const pg=L.pagamentos.get(l.pagamento);
    const docs=pg?[...new Set(pg.alocacoes.map(a=>a.documento))].map(id=>L.documentos.get(id)).filter(Boolean):[];
    const parceiros=[...new Set(docs.map(d=>d.parceiro).filter(Boolean))];
    return { numero:pg?.numero||"", referencia:docs.map(d=>d.numero).join(", "), pagamento:pg, documentos:docs,
      parceiro:pg?.parceiro||(parceiros.length===1?parceiros[0]:null),
      categorias:[...new Set(docs.map(d=>d.categoria).filter(Boolean))], forma:pg?.forma };
  }
  const d=l.documento?L.documentos.get(l.documento):null;
  return { numero:d?.numero||"", referencia:"", documento:d, documentos:d?[d]:[], parceiro:d?.parceiro||null,
    categorias:d?.categoria?[d.categoria]:[], forma:d?.forma };
}

/* ── RAZÃO de uma conta (ou cartão) com saldo corrente ──
   O período corta, mas não zera: o que ficou antes vira "Saldo anterior",
   como no extrato do banco. A coluna saldo é sempre a da conta naquele
   momento, calculada em ordem pelo razão. */
export function razao(L,chave,{de,ate}={}){
  const linhas=L.linhasDaChave(chave);
  const passivo=chave.startsWith("C:");
  const sg=passivo?-1:1;
  let saldo=0, anterior=0; const out=[];
  for(const x of linhas){
    const v=sg*x.v;
    if(de&&x.data<de){ saldo+=v; anterior=saldo; continue; }
    if(ate&&x.data>ate) break;
    saldo+=v;
    const ctx=contextoLancamento(L,x.l);
    out.push({ data:x.data, lanc:x.l, i:x.i, valor:v, entrada:v>0?v:0, saida:v<0?-v:0, saldo,
      numero:ctx.numero, referencia:ctx.referencia, descricao:x.l.descricao, parceiro:ctx.parceiro,
      categorias:ctx.categorias, natureza:x.l.natureza, conciliado:!!x.l.linhas[x.i].conc,
      estornado:!!L.lancamentoEstornado(x.l)||x.l.natureza==="ESTORNO" });
  }
  return { anterior:de?anterior:0, linhas:out, final:saldo, temAnterior:!!de };
}

/* ── FLUXO DE CAIXA (realizado) do dinheiro disponível ──
   Transferência entre duas contas disponíveis não é entrada nem saída.
   Mandar para a reserva é: o dinheiro sai do disponível. */
export function fluxoDeCaixa(L,{de,ate}){
  const meses=new Map();
  const mes=m=>{ if(!meses.has(m)) meses.set(m,{mes:m,entradas:0,saidas:0,paraReservas:0,dasReservas:0,ajustes:0,paraTerceiros:0,deTerceiros:0}); return meses.get(m); };
  const tipoDoc=l=>l.documento?L.documentos.get(l.documento)?.tipo:null;
  for(let m=mesDe(de);m<=mesDe(ate);m=addMesesMes(m,1)) mes(m);
  for(const c of L.contas.values()){
    if(!disponivel(L,c.id)) continue;
    for(const x of L.linhasDaChave(K.conta(c.id))){
      if(x.data<de||x.data>ate) continue;
      const r=mes(mesDe(x.data));
      /* saldo inicial é o ponto de partida, não dinheiro que entrou; ajuste
         é correção — os dois ficam fora de entradas e saídas */
      const td=tipoDoc(x.l);
      if(td==="ABERTURA") continue;
      if(td==="AJUSTE"){ r.ajustes+=x.v; continue; }
      if(x.l.natureza==="TRANSFERENCIA"||(x.l.natureza==="ESTORNO"&&x.l.linhas.every(y=>y.k.startsWith("A:")))){
        const outra=x.l.linhas.find((y,j)=>j!==x.i&&y.k.startsWith("A:"));
        const outraDisp=outra&&disponivel(L,idChave(outra.k));
        if(outraDisp) continue;
        if(x.v<0) r.paraReservas+=-x.v; else r.dasReservas+=x.v;
        continue;
      }
      if(x.v>0) r.entradas+=x.v; else r.saidas+=-x.v;
      /* a parte que foi dinheiro adiantado a outra pessoa, ou devolvido por
         ela: continua nas entradas e saídas (o dinheiro se moveu), mas à vista */
      if(x.l.pagamento){ const t=parteDeTerceiros(L,L.pagamentos.get(x.l.pagamento));
        if(t.pago) r.paraTerceiros+=Math.sign(-x.v)*Math.min(Math.abs(t.pago),Math.abs(x.v));
        if(t.devolvido) r.deTerceiros+=Math.sign(x.v)*Math.min(Math.abs(t.devolvido),Math.abs(x.v)); }
    }
  }
  const lista=[...meses.values()].sort((a,b)=>a.mes<b.mes?-1:1);
  for(const r of lista){
    r.saldoInicial=L.saldoDisponivel(addDias(inicioDoMes(r.mes),-1));
    r.saldoFinal=L.saldoDisponivel(fimDoMes(r.mes));
    r.resultado=r.entradas-r.saidas;
  }
  return lista;
}

/* quanto de um pagamento foi compra de outra pessoa (pago) e quanto foi o
   reembolso dela (devolvido) — estorno entra negativo */
export function parteDeTerceiros(L,pg){
  let pago=0,devolvido=0;
  for(const a of (pg?.alocacoes||[])){ const d=L.documentos.get(a.documento); if(!d) continue;
    const din=L.sinalParcela(d)*a.valor+(a.juros||0)-(a.desconto||0);
    if(d.terceiro) pago+=din; else if(d.reembolsoDe) devolvido+=din; }
  return {pago,devolvido};
}

/* ── O QUE VAI ACONTECER ──
   Parcelas em aberto de contas a pagar/receber e faturas de cartão, por mês
   de vencimento. O que já venceu entra no mês corrente: dívida vencida
   continua na frente até ser paga (mesma regra do 2.2). */
export function compromissos(L,{meses=6}={}){
  const atual=mesDe(hoje()), fim=addMesesMes(atual,meses-1);
  const linhas=new Map();
  const at=m=>{ const k=m<atual?atual:m; if(k>fim) return null;
    if(!linhas.has(k)) linhas.set(k,{mes:k,receber:0,pagar:0,faturas:0,reservas:0,itens:[]}); return linhas.get(k); };
  for(let m=atual;m<=fim;m=addMesesMes(m,1)) at(m);
  for(const lado of ["PAGAR","RECEBER"]) for(const {doc,p,e} of L.obrigacoes(lado)){
    if(e.restante<=0||doc.status==="CANCELADO") continue;
    /* conta a pagar pelo vale não sai do dinheiro disponível */
    if(doc.conta&&!disponivel(L,doc.conta)) continue;
    const r=at(mesDe(p.vencimento)); if(!r) continue;
    if(lado==="PAGAR") r.pagar+=e.restante; else r.receber+=e.restante;
    r.itens.push({tipo:lado,doc,p,valor:e.restante,vencimento:p.vencimento});
  }
  for(const c of L.cartoes.values()) for(const f of faturasDoCartao(L,c.id)){
    if(f.restante<=0) continue;
    const r=at(mesDe(f.vencimento)); if(!r) continue;
    r.faturas+=f.restante; r.itens.push({tipo:"FATURA",cartao:c,fatura:f,valor:f.restante,vencimento:f.vencimento});
  }
  for(const d of L.documentos.values()){
    if(d.tipo!==DOC.TRANSF||d.status!=="PLANEJADA") continue;
    const sai=disponivel(L,d.conta), entra=disponivel(L,d.contaDestino);
    if(sai===entra) continue;
    const r=at(mesDe(d.data)); if(!r) continue;
    r.reservas+=sai?d.valor:-d.valor; r.itens.push({tipo:"TRANSFERENCIA",doc:d,valor:d.valor,vencimento:d.data});
  }
  const lista=[...linhas.values()].sort((a,b)=>a.mes<b.mes?-1:1);
  let saldo=L.saldoDisponivel(hoje());
  for(const r of lista){ r.saldoInicial=saldo; r.saldoFinal=saldo+r.receber-r.pagar-r.faturas-r.reservas; saldo=r.saldoFinal; }
  return lista;
}
/* o número do topo: onde o mês termina se tudo que vence nele acontecer */
export function saldoPrevistoDoMes(L){ const c=compromissos(L,{meses:1})[0];
  return { hoje:L.saldoDisponivel(hoje()), receber:c.receber, pagar:c.pagar, faturas:c.faturas, reservas:c.reservas, final:c.saldoFinal }; }

/* Soma as subcategorias na categoria mãe. O que foi lançado direto na mãe
   aparece como "Geral" dentro dela, para a soma das linhas bater. */
export function agruparCategorias(L,cats){
  const g=new Map();
  for(const c of cats){
    const gid=CATEGORIA_SISTEMA[c.id]?c.id:L.grupoCategoria(c.id), key=c.natureza+":"+gid;
    if(!g.has(key)) g.set(key,{id:gid,nome:CATEGORIA_SISTEMA[gid]||L.nomeCurtoCategoria(gid)||"Sem categoria",natureza:c.natureza,total:0,subs:[]});
    const x=g.get(key); x.total+=c.total;
    x.subs.push({...c,nome:gid===c.id?"Geral":(L.nomeCurtoCategoria(c.id)||c.nome)});
  }
  const out=[...g.values()].filter(x=>x.total!==0).sort((a,b)=>b.total-a.total);
  for(const x of out){ x.subs.sort((a,b)=>b.total-a.total);
    /* só a própria mãe, sem subcategoria nenhuma: não há o que detalhar */
    if(x.subs.length===1&&x.subs[0].id===x.id) x.subs=[]; }
  return out;
}

/* ── RESULTADO POR COMPETÊNCIA ── receitas e despesas por categoria e mês */
/* Compra de outra pessoa não é despesa minha (vai para R:<pessoa>, ver
   comandos.js): fica fora de receitas, despesas e resultado, e aparece à
   parte em `terceiros`, pela categoria real e por pessoa. */
export function resultado(L,{de,ate}){
  const mesDeIni=de.slice(0,7), mesAte=ate.slice(0,7);
  const porMes=new Map(), cats=new Map(), tCats=new Map(), tPessoas=new Map();
  for(let m=mesDeIni;m<=mesAte;m=addMesesMes(m,1)) porMes.set(m,{mes:m,receitas:0,despesas:0,ajustes:0,terceiros:0});
  for(const l of L.lancamentos.values()){
    const m=l.competencia; if(m<mesDeIni||m>mesAte) continue;
    for(const x of l.linhas){
      if(x.terceiro){
        const cid=x.categoria||"-";
        if(!tCats.has(cid)) tCats.set(cid,{id:cid,nome:CATEGORIA_SISTEMA[cid]||L.nomeCategoria(cid)||"Sem categoria",natureza:"DESPESA",total:0});
        tCats.get(cid).total+=x.v; porMes.get(m).terceiros+=x.v;
        const pid=idChave(x.k); tPessoas.set(pid,(tPessoas.get(pid)||0)+x.v);
        continue;
      }
      const t=tipoChave(x.k);
      if(t!=="E"&&t!=="I"&&x.k!==K.AJUSTE) continue;
      const r=porMes.get(m);
      if(x.k===K.AJUSTE){ r.ajustes+=-x.v; continue; }
      const cid=idChave(x.k), nome=CATEGORIA_SISTEMA[cid]||L.nomeCategoria(cid)||"Sem categoria";
      const key=t+":"+cid;
      if(!cats.has(key)) cats.set(key,{id:cid,nome,natureza:t==="E"?"DESPESA":"RECEITA",total:0,porMes:{}});
      const c=cats.get(key); const v=t==="E"?x.v:-x.v;
      c.total+=v; c.porMes[m]=(c.porMes[m]||0)+v;
      if(t==="E") r.despesas+=x.v; else r.receitas+=-x.v;
    }
  }
  const meses=[...porMes.values()]; for(const r of meses) r.resultado=r.receitas-r.despesas;
  const categorias=[...cats.values()].filter(c=>c.total!==0).sort((a,b)=>b.total-a.total);
  const tc=[...tCats.values()].filter(c=>c.total!==0).sort((a,b)=>b.total-a.total);
  return { meses, categorias, grupos:agruparCategorias(L,categorias), receitas:soma(meses,r=>r.receitas), despesas:soma(meses,r=>r.despesas),
    terceiros:{ total:soma(meses,r=>r.terceiros), categorias:tc, grupos:agruparCategorias(L,tc),
      pessoas:[...tPessoas].filter(([,v])=>v).map(([pessoa,total])=>({pessoa,total})).sort((a,b)=>b.total-a.total) } };
}

/* ── RESULTADO POR CAIXA ── o que foi pago/recebido, pela categoria do documento */
/* O que foi pago por outra pessoa (a fatura com a gasolina do João) e o que
   ela devolveu ficam em `adiantado` e `devolvido`, por pessoa: dinheiro que
   foi e voltou não é despesa nem receita. Juros e descontos dessas parcelas
   continuam sendo meus. */
export function resultadoCaixa(L,{de,ate}){
  const cats=new Map(), pessoas=new Map(); let entradas=0,saidas=0,adiantado=0,devolvido=0;
  const somar=(nat,cid,v)=>{ const key=(nat==="RECEITA"?"I:":"E:")+cid;
    if(!cats.has(key)) cats.set(key,{id:cid,nome:CATEGORIA_SISTEMA[cid]||L.nomeCategoria(cid)||"Sem categoria",natureza:nat,total:0});
    cats.get(key).total+=v; if(nat==="RECEITA") entradas+=v; else saidas+=v; };
  const pessoa=id=>{ if(!pessoas.has(id)) pessoas.set(id,{pessoa:id,adiantado:0,devolvido:0}); return pessoas.get(id); };
  for(const pg of L.pagamentos.values()){
    if(pg.data<de||pg.data>ate) continue;
    for(const a of pg.alocacoes){
      const d=L.documentos.get(a.documento); if(!d) continue;
      const sinal=d.tipo===DOC.ESTORNO_CARTAO?-1:1;
      if(d.terceiro||d.reembolsoDe){
        const receber=!!d.reembolsoDe, v=sinal*a.valor-(a.desconto||0);
        if(receber){ devolvido+=v; pessoa(d.parceiro).devolvido+=v; } else { adiantado+=v; pessoa(d.terceiro.pessoa).adiantado+=v; }
        if(a.juros) somar(receber?"RECEITA":"DESPESA","#juros",a.juros);
        continue;
      }
      somar(d.tipo===DOC.RECEBER?"RECEITA":"DESPESA",d.categoria||"-",sinal*a.valor+(a.juros||0)-(a.desconto||0));
    }
  }
  const categorias=[...cats.values()].filter(c=>c.total).sort((a,b)=>b.total-a.total);
  return { categorias, grupos:agruparCategorias(L,categorias), entradas, saidas, adiantado, devolvido,
    pessoas:[...pessoas.values()].filter(x=>x.adiantado||x.devolvido).sort((a,b)=>b.adiantado-a.adiantado) };
}

/* ── CONTAS A PAGAR / RECEBER: faixas de vencimento ── */
export function faixas(L,lado,{parceiro,ate}={}){
  const h=hoje(); const f={total:0,vencido:0,hoje:0,sete:0,trinta:0,depois:0,parcial:0,
    nVencido:0,nHoje:0,nSete:0,nTrinta:0,nParcial:0,n:0};
  for(const {doc,p,e} of L.obrigacoes(lado)){
    if(e.restante<=0||doc.status==="CANCELADO") continue;
    if(parceiro&&doc.parceiro!==parceiro) continue;
    if(ate&&p.vencimento>ate) continue;
    f.total+=e.restante; f.n++;
    const d=diasEntre(h,p.vencimento);
    if(d<0){ f.vencido+=e.restante; f.nVencido++; }
    else if(d===0){ f.hoje+=e.restante; f.nHoje++; }
    else if(d<=7){ f.sete+=e.restante; f.nSete++; }
    else if(d<=30){ f.trinta+=e.restante; f.nTrinta++; }
    else f.depois+=e.restante;
    if(e.parcial){ f.parcial+=e.restante; f.nParcial++; }
  }
  return f;
}

/* ── PARCEIROS ── */
export function saldosParceiros(L){
  const m=new Map();
  const r=id=>{ if(!m.has(id)) m.set(id,{parceiro:id,aPagar:0,aReceber:0,vencidoPagar:0,vencidoReceber:0,pago:0,recebido:0,documentos:0}); return m.get(id); };
  for(const d of L.documentos.values()){
    if((d.tipo!==DOC.PAGAR&&d.tipo!==DOC.RECEBER&&d.tipo!==DOC.COMPRA)||d.status==="CANCELADO"||!d.parceiro) continue;
    const x=r(d.parceiro), e=L.estadoDocumento(d); x.documentos++;
    if(d.tipo===DOC.RECEBER){ x.aReceber+=e.restante; x.recebido+=e.pago;
      x.vencidoReceber+=soma(e.parcelas.filter(q=>q.e.vencida),q=>q.e.restante); }
    else if(d.tipo===DOC.PAGAR){ x.aPagar+=e.restante; x.pago+=e.pago;
      x.vencidoPagar+=soma(e.parcelas.filter(q=>q.e.vencida),q=>q.e.restante); }
    else x.pago+=d.valor;
  }
  return [...m.values()].map(x=>({...x,saldo:x.aReceber-x.aPagar})).sort((a,b)=>Math.abs(b.saldo)-Math.abs(a.saldo));
}

/* ── PATRIMÔNIO ── contas − dívidas + direitos */
export function patrimonio(L,ate){
  ate=ate||hoje();
  let disp=0,reservas=0,beneficios=0;
  for(const c of L.contas.values()){ const s=L.saldoConta(c.id,ate);
    if(c.tipo==="RESERVA") reservas+=s; else if(c.tipo==="BENEFICIO") beneficios+=s; else disp+=s; }
  let cartoes=0; for(const c of L.cartoes.values()) cartoes+=L.dividaCartao(c.id,ate);
  let aPagar=0,aReceber=0;
  for(const k of L.ix.linhas.keys()){
    if(k.startsWith("P:")) aPagar+=-L.saldoChave(k,ate);
    if(k.startsWith("R:")) aReceber+=L.saldoChave(k,ate);
  }
  return { disponivel:disp, reservas, beneficios, cartoes, aPagar, aReceber,
    liquido:disp+reservas+beneficios+aReceber-cartoes-aPagar };
}

/* ── EVOLUÇÃO MENSAL ── */
export function evolucao(L,{meses=12}={}){
  const fim=mesDe(hoje()), ini=addMesesMes(fim,-(meses-1));
  const r=resultado(L,{de:inicioDoMes(ini),ate:fimDoMes(fim)});
  return r.meses.map(x=>({...x,saldoContas:L.saldoTodasContas(fimDoMes(x.mes)),
    disponivel:L.saldoDisponivel(fimDoMes(x.mes)),patrimonio:patrimonio(L,fimDoMes(x.mes)).liquido}));
}

/* ── CARTÕES ── gastos no período e parcelas futuras por mês */
export function relatorioCartoes(L,{meses=6}={}){
  return [...L.cartoes.values()].filter(c=>c.ativo!==false).map(c=>{
    const fs=faturasDoCartao(L,c.id);
    const futuras=fs.filter(f=>f.restante>0&&f.ref>=mesDe(hoje())).slice(0,meses);
    const parcelados=(L.ix.parcelasCartao.get(c.id)||[]).filter(x=>x.doc.status!=="CANCELADO"&&x.doc.parcelas.length>1);
    const compras=new Map(); for(const x of parcelados) if(L.estadoParcela(x.p,x.doc).restante>0) compras.set(x.doc.id,x.doc);
    return { cartao:c, faturas:fs, futuras, comprasParceladas:[...compras.values()],
      comprometido:soma(futuras,f=>f.restante) };
  });
}

export function comparar(L,mesA,mesB){
  const a=resultado(L,{de:inicioDoMes(mesA),ate:fimDoMes(mesA)}), b=resultado(L,{de:inicioDoMes(mesB),ate:fimDoMes(mesB)});
  const nomes=new Map();
  for(const c of [...a.categorias,...b.categorias]) nomes.set(c.natureza+c.id,{id:c.id,nome:c.nome,natureza:c.natureza});
  const linhas=[...nomes.values()].map(n=>{
    const va=a.categorias.find(c=>c.id===n.id&&c.natureza===n.natureza)?.total||0;
    const vb=b.categorias.find(c=>c.id===n.id&&c.natureza===n.natureza)?.total||0;
    return {...n,a:va,b:vb,dif:vb-va};
  }).sort((x,y)=>Math.abs(y.dif)-Math.abs(x.dif));
  return { a:{mes:mesA,receitas:a.receitas,despesas:a.despesas}, b:{mes:mesB,receitas:b.receitas,despesas:b.despesas}, linhas };
}
export { fatura };
