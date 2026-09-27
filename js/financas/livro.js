/* ══════════ O LIVRO ══════════
   A única fonte de verdade financeira. Guarda as coleções em memória, monta
   índices e responde as perguntas — saldo, situação de parcela, dívida do
   cartão. Nenhuma tela calcula dinheiro por conta própria: todas perguntam
   ao livro, e é por isso que o topo, o razão e a reconciliação não têm como
   discordar.

   O livro NÃO altera a si mesmo por dentro de uma regra de negócio. Os
   comandos (comandos.js) devolvem uma Mudanca; quem grava decide quando
   aplicar — e, se o Firestore recusar, desfaz. */

import { DOC, ST, K, DO_CARTAO, COM_PARCELAS, DISPONIVEL, tipoChave, ErroFinanceiro } from "./modelo.js";
import { hoje } from "../nucleo/datas.js";

export const COLECOES=["contas","parceiros","categorias","cartoes","documentos","pagamentos",
  "lancamentos","recorrencias","importacoes","extrato","conciliacoes","meta"];

export class Livro{
  constructor(){
    for(const c of COLECOES) this[c]=new Map();
    this.versao=0; this._ix=null; this._ixVersao=-1;
  }
  /* carga inicial: { contas:[...], documentos:[...], ... } */
  carregar(dados){
    for(const c of COLECOES){ this[c].clear(); for(const d of (dados[c]||[])) this[c].set(d.id,d); }
    this.versao++;
    return this;
  }
  exportar(){
    const out={}; for(const c of COLECOES) out[c]=[...this[c].values()]; return out;
  }
  /* aplica e devolve o que existia antes, para desfazer se a gravação falhar */
  aplicar(mudanca){
    const antes=[];
    for(const g of mudanca.gravar){
      if(g.colecao==="auditoria") continue;          // auditoria não vive em memória
      const col=this[g.colecao]; if(!col) throw new Error("coleção desconhecida: "+g.colecao);
      antes.push({colecao:g.colecao,id:g.id,dados:col.has(g.id)?col.get(g.id):undefined});
      col.set(g.id,g.dados);
    }
    this.versao++;
    return antes;
  }
  desfazer(antes){
    for(let i=antes.length-1;i>=0;i--){ const a=antes[i];
      if(a.dados===undefined) this[a.colecao].delete(a.id); else this[a.colecao].set(a.id,a.dados); }
    this.versao++;
  }

  /* ── índices ──
     Reconstruídos só quando algo mudou (versao). Uma passada em cada coleção:
     com alguns milhares de registros leva poucos milissegundos, e evita que
     cada tela percorra tudo de novo a cada pergunta. */
  get ix(){
    if(this._ixVersao===this.versao) return this._ix;
    const ix={
      parcela:new Map(),      // id da parcela → {doc, p}
      alocacoes:new Map(),    // id da parcela → [{pag, a}]
      linhas:new Map(),       // chave → [{data, v, l, i}] ordenadas
      lancDoc:new Map(),      // doc → [lançamentos]
      lancPag:new Map(),      // pagamento → [lançamentos]
      estornoDe:new Map(),    // lançamento → lançamento que o estorna
      pagEstorno:new Map(),   // pagamento → pagamento que o estorna
      parcelasCartao:new Map(), // cartão → [{doc, p}]
      docsRecorrencia:new Map(),
      linhaExtratoLanc:new Map() // "lanc#i" → linha do extrato conciliada
    };
    for(const d of this.documentos.values()){
      for(const p of (d.parcelas||[])){
        ix.parcela.set(p.id,{doc:d,p});
        if(DO_CARTAO.has(d.tipo)&&d.cartao){
          if(!ix.parcelasCartao.has(d.cartao)) ix.parcelasCartao.set(d.cartao,[]);
          ix.parcelasCartao.get(d.cartao).push({doc:d,p});
        }
      }
      if(d.recorrencia){ if(!ix.docsRecorrencia.has(d.recorrencia)) ix.docsRecorrencia.set(d.recorrencia,[]);
        ix.docsRecorrencia.get(d.recorrencia).push(d); }
    }
    for(const pg of this.pagamentos.values()){
      if(pg.estornoDe) ix.pagEstorno.set(pg.estornoDe,pg);
      for(const a of (pg.alocacoes||[])){
        if(!ix.alocacoes.has(a.parcela)) ix.alocacoes.set(a.parcela,[]);
        ix.alocacoes.get(a.parcela).push({pag:pg,a});
      }
    }
    for(const l of this.lancamentos.values()){
      if(l.estornoDe) ix.estornoDe.set(l.estornoDe,l);
      if(l.documento){ if(!ix.lancDoc.has(l.documento)) ix.lancDoc.set(l.documento,[]); ix.lancDoc.get(l.documento).push(l); }
      if(l.pagamento){ if(!ix.lancPag.has(l.pagamento)) ix.lancPag.set(l.pagamento,[]); ix.lancPag.get(l.pagamento).push(l); }
      l.linhas.forEach((ln,i)=>{
        if(!ix.linhas.has(ln.k)) ix.linhas.set(ln.k,[]);
        ix.linhas.get(ln.k).push({data:l.data,v:ln.v,l,i});
      });
    }
    /* ordem do razão: data, e dentro do dia a ordem em que foi registrado —
       o saldo corrente precisa ser o mesmo toda vez que a tela abre */
    for(const arr of ix.linhas.values())
      arr.sort((a,b)=>a.data<b.data?-1:a.data>b.data?1:(a.l.criadoEm||"")<(b.l.criadoEm||"")?-1:(a.l.criadoEm||"")>(b.l.criadoEm||"")?1:a.i-b.i);
    for(const ln of this.extrato.values())
      if(ln.conciliada) ix.linhaExtratoLanc.set(ln.conciliada.lancamento+"#"+ln.conciliada.linha,ln);
    this._ix=ix; this._ixVersao=this.versao;
    return ix;
  }

  /* ── saldo ──
     Saldo de qualquer chave do razão até uma data (inclusive). O saldo de uma
     conta é SEMPRE isto: soma das linhas A:<conta>. Não existe campo "saldo"
     guardado em lugar nenhum — então não existe saldo que possa ficar velho. */
  saldoChave(k,ate){
    const arr=this.ix.linhas.get(k); if(!arr) return 0;
    let s=0; for(const x of arr){ if(ate&&x.data>ate) break; s+=x.v; } return s;
  }
  saldoConta(id,ate){ return this.saldoChave(K.conta(id),ate); }
  /* o que se deve ao cartão: passivo, então o sinal inverte */
  dividaCartao(id,ate){ return -this.saldoChave(K.cartao(id),ate); }
  linhasDaChave(k){ return this.ix.linhas.get(k)||[]; }

  contasAtivas(){ return [...this.contas.values()].filter(c=>c.ativa!==false).sort(ordemNome); }
  cartoesAtivos(){ return [...this.cartoes.values()].filter(c=>c.ativo!==false).sort(ordemNome); }
  parceirosAtivos(){ return [...this.parceiros.values()].filter(p=>p.ativo!==false).sort(ordemNome); }
  /* subcategoria de uma categoria arquivada também sai dos formulários */
  categoriasAtivas(natureza){ return [...this.categorias.values()]
    .filter(c=>c.ativa!==false&&(!natureza||c.natureza===natureza)&&(!c.pai||this.categorias.get(c.pai)?.ativa!==false)).sort(ordemNome); }
  /* a categoria mãe de uma subcategoria — ou ela mesma, se não tem mãe */
  grupoCategoria(id){ const c=this.categorias.get(id); return c?.pai&&this.categorias.has(c.pai)?c.pai:id; }
  subcategorias(id){ return [...this.categorias.values()].filter(c=>c.pai===id).sort(ordemNome); }

  saldoDisponivel(ate){
    let s=0; for(const c of this.contas.values()) if(DISPONIVEL.has(c.tipo)) s+=this.saldoConta(c.id,ate); return s;
  }
  saldoTodasContas(ate){ let s=0; for(const c of this.contas.values()) s+=this.saldoConta(c.id,ate); return s; }

  /* ── parcelas ──
     O que foi pago é a soma das alocações de todos os pagamentos, inclusive
     dos estornos (que entram com valor negativo). Nada disso é guardado na
     parcela: o histórico de pagamentos É a situação da parcela. */
  sinalParcela(doc){ return doc.tipo===DOC.ESTORNO_CARTAO?-1:1; }
  estadoParcela(p,doc){
    doc=doc||this.ix.parcela.get(p.id)?.doc;
    const alocs=this.ix.alocacoes.get(p.id)||[];
    let pago=0,juros=0,desconto=0,ultima=null;
    for(const {pag,a} of alocs){ pago+=a.valor; juros+=a.juros||0; desconto+=a.desconto||0;
      if(a.valor>0&&(!ultima||pag.data>ultima)) ultima=pag.data; }
    const restante=p.valor-pago;
    let status;
    if(doc&&doc.status==="CANCELADO") status=ST.CANCELADA;
    else if(restante<=0&&p.valor>0) status=ST.PAGA;
    /* estorno no cartão é um crédito: ele não "vence", só espera ser usado
       no pagamento da fatura */
    else if(doc&&doc.tipo===DOC.ESTORNO_CARTAO) status=ST.ABERTA;
    else if(pago>0) status=p.vencimento<hoje()?ST.VENCIDA:ST.PARCIAL;
    else status=p.vencimento<hoje()?ST.VENCIDA:ST.ABERTA;
    /* parcial vencida continua "parcial" para quem lê, mas conta como vencida */
    const parcial=pago>0&&restante>0;
    return { valor:p.valor, pago, juros, desconto, restante:status===ST.CANCELADA?0:restante,
      status, parcial, vencida:status===ST.VENCIDA, pagoEm:ultima, alocacoes:alocs };
  }
  estadoDocumento(d){
    if(!COM_PARCELAS.has(d.tipo)){
      const st=d.status==="CANCELADO"?ST.CANCELADA:(d.status==="PLANEJADA"?ST.PLANEJADA:ST.EFETIVADA);
      return { valor:d.valor, pago:0, restante:0, status:st, parcelas:[] };
    }
    const ps=(d.parcelas||[]).map(p=>({p,e:this.estadoParcela(p,d)}));
    let pago=0,restante=0,juros=0,desconto=0;
    for(const {e} of ps){ pago+=e.pago; restante+=e.restante; juros+=e.juros; desconto+=e.desconto; }
    let status;
    if(d.status==="CANCELADO") status=ST.CANCELADA;
    else if(ps.every(x=>x.e.status===ST.PAGA)) status=ST.PAGA;
    else if(ps.some(x=>x.e.status===ST.VENCIDA)) status=ST.VENCIDA;
    else if(pago>0) status=ST.PARCIAL;
    else status=ST.ABERTA;
    const proxima=ps.filter(x=>x.e.restante>0).sort((a,b)=>a.p.vencimento<b.p.vencimento?-1:1)[0];
    return { valor:d.valor, pago, restante, juros, desconto, status, parcial:pago>0&&restante>0,
      parcelas:ps, proximoVencimento:proxima?proxima.p.vencimento:null };
  }
  pagamentoEstornado(pg){ return this.ix.pagEstorno.get(pg.id)||null; }
  lancamentoEstornado(l){ return this.ix.estornoDe.get(l.id)||null; }
  lancamentosDoDocumento(id){ return (this.ix.lancDoc.get(id)||[]).slice().sort(ordemLanc); }
  lancamentosDoPagamento(id){ return (this.ix.lancPag.get(id)||[]).slice().sort(ordemLanc); }
  pagamentosDoDocumento(d){
    const set=new Map();
    for(const p of (d.parcelas||[])) for(const {pag} of (this.ix.alocacoes.get(p.id)||[])) set.set(pag.id,pag);
    return [...set.values()].sort((a,b)=>a.data<b.data?-1:a.data>b.data?1:(a.criadoEm<b.criadoEm?-1:1));
  }
  /* Documento com QUALQUER pagamento no histórico — mesmo já estornado — não
     muda de valor nem de parcelas: as alocações antigas apontam para aquelas
     parcelas, e reescrevê-las mudaria o significado de um pagamento passado.
     O caminho é cancelar e criar outro. */
  temPagamento(d){ return (d.parcelas||[]).some(p=>(this.ix.alocacoes.get(p.id)||[]).length>0); }
  pagoLiquido(d){ return this.estadoDocumento(d).pago; }
  linhaConciliada(l,i){ return !!(l.linhas[i]&&l.linhas[i].conc); }
  documentoConciliado(d){
    return this.lancamentosDoDocumento(d.id).some(l=>l.linhas.some(x=>x.conc))||
      this.pagamentosDoDocumento(d).some(pg=>this.lancamentosDoPagamento(pg.id).some(l=>l.linhas.some(x=>x.conc)));
  }

  /* obrigações em aberto (a pagar ou a receber), parcela a parcela */
  obrigacoes(lado){
    const tipo=lado==="RECEBER"?DOC.RECEBER:DOC.PAGAR, out=[];
    for(const d of this.documentos.values()){
      if(d.tipo!==tipo) continue;
      for(const p of (d.parcelas||[])) out.push({doc:d,p,e:this.estadoParcela(p,d)});
    }
    return out;
  }

  nomeConta(id){ return this.contas.get(id)?.nome||"—"; }
  nomeParceiro(id){ return id?(this.parceiros.get(id)?.nome||"—"):""; }
  /* "Alimentação › Mercado"; nomeCurtoCategoria dá só "Mercado" */
  nomeCategoria(id){ if(!id) return ""; const c=this.categorias.get(id); if(!c) return "—";
    const m=c.pai&&this.categorias.get(c.pai); return m?m.nome+" › "+c.nome:c.nome; }
  nomeCurtoCategoria(id){ return id?(this.categorias.get(id)?.nome||"—"):""; }
  nomeCartao(id){ return this.cartoes.get(id)?.nome||"—"; }
  contador(prefixo){ return (this.meta.get("contadores")||{})[prefixo]||0; }
  preferencias(){ return this.meta.get("preferencias")||{}; }
}

export function ordemNome(a,b){ return String(a.nome||"").localeCompare(String(b.nome||""),"pt-BR"); }
export function ordemLanc(a,b){ return a.data<b.data?-1:a.data>b.data?1:((a.criadoEm||"")<(b.criadoEm||"")?-1:1); }
export { ErroFinanceiro };
