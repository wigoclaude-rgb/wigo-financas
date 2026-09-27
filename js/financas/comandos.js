/* ══════════ COMANDOS ══════════
   Toda alteração financeira passa por aqui, e só por aqui. Cada comando:
     1. valida contra o estado atual do livro;
     2. monta TUDO que precisa ser gravado — documento, parcelas, pagamento,
        lançamento, auditoria, contador — numa Mudanca;
     3. não toca no livro.
   Quem chama grava a Mudanca num writeBatch (tudo ou nada) e só então ela
   vale. Uma transferência nunca fica com uma perna só, um pagamento nunca
   fica "pago" sem o movimento no caixa: ou o lote inteiro entra, ou nada.

   Nada financeiro é apagado. Corrigir é estornar (um lançamento com as linhas
   invertidas) e, se for o caso, lançar de novo. */

import { DOC, PREFIXO, K, COM_PARCELAS, DO_CARTAO, DISPONIVEL, TIPO_CONTA, ErroFinanceiro } from "./modelo.js";
import { dividir, formatar, soma } from "../nucleo/dinheiro.js";
import { hoje, mesDe, addMeses, addMesesMes, valida } from "../nucleo/datas.js";
import { novoId } from "../nucleo/ids.js";
import { faturaDaCompra, datasFatura, alocarPagamentoFatura } from "./cartoes.js";

/* ── o lote de gravação ── */
let SEQ=0;   // global: dois comandos no mesmo milissegundo continuam em ordem
export class Mudanca{
  constructor(L){ this.L=L; this.gravar=[]; this.pos=new Map(); this.pend={}; this.contadores=null;
    this.alocPend=new Map(); this.seq=0; this.base=new Date().toISOString(); this.resumo=[]; }
  set(colecao,id,dados){
    const k=colecao+"/"+id, i=this.pos.get(k);
    if(i!=null) this.gravar[i].dados=dados; else { this.pos.set(k,this.gravar.length); this.gravar.push({colecao,id,dados}); }
    (this.pend[colecao]||(this.pend[colecao]=new Map())).set(id,dados);
    return dados;
  }
  obter(colecao,id){ const p=this.pend[colecao]?.get(id); return p!==undefined?p:this.L[colecao].get(id); }
  /* carimbo que preserva a ordem dentro do lote: a provisão antes do
     pagamento, mesmo que caiam no mesmo milissegundo */
  carimbo(){ this.seq++; return this.base+"#"+String(SEQ++).padStart(7,"0"); }
  numero(prefixo){
    if(!this.contadores) this.contadores={...(this.L.meta.get("contadores")||{})};
    this.contadores[prefixo]=(this.contadores[prefixo]||0)+1;
    return prefixo+"-"+String(this.contadores[prefixo]).padStart(6,"0");
  }
  auditar(acao,entidade,id,numero,resumo,mudancas){
    const aid=novoId("h");
    this.set("auditoria",aid,{id:aid,em:new Date().toISOString(),acao,entidade,entidadeId:id,
      numero:numero||null,resumo,mudancas:mudancas||[]});
  }
  /* parcela vista de dentro do lote: pode ser de um documento criado agora */
  infoParcela(id){
    let doc=null,p=null;
    const pd=this.pend.documentos;
    if(pd) for(const d of pd.values()){ const x=(d.parcelas||[]).find(q=>q.id===id); if(x){ doc=d; p=x; break; } }
    if(!p){ const r=this.L.ix.parcela.get(id); if(r){ doc=this.pend.documentos?.get(r.doc.id)||r.doc; p=(doc.parcelas||[]).find(q=>q.id===id)||r.p; } }
    if(!p) return null;
    const jaExiste=this.L.documentos.has(doc.id);
    const e=jaExiste?this.L.estadoParcela(p,doc):{pago:0,restante:p.valor};
    const restante=(doc.status==="CANCELADO"?0:e.restante)-(this.alocPend.get(id)||0);
    return {doc,p,restante};
  }
  fechar(){
    if(this.contadores) this.set("meta","contadores",{id:"contadores",...this.contadores});
    return this;
  }
  get vazia(){ return !this.gravar.length; }
}

const agora=()=>new Date().toISOString();
const erro=(m,d)=>{ throw new ErroFinanceiro(m,d); };
const exigirData=(d,rotulo="data")=>{ if(!valida(d)) erro("Informe a "+rotulo+"."); return d; };
const inteiro=v=>Number.isInteger(v);
const int=v=>Math.round(Number(v)||0);

/* soma linhas iguais (mesma chave, parceiro e categoria) e descarta zeros */
function consolidar(linhas){
  const m=new Map();
  for(const l of linhas){ if(!l||!l.v) continue;
    const key=l.k+"|"+(l.parceiro||"")+"|"+(l.categoria||"");
    if(m.has(key)) m.get(key).v+=l.v; else m.set(key,{...l}); }
  return [...m.values()].filter(l=>l.v!==0);
}
/* Grava um lançamento. Recusa qualquer um que não some zero: é a regra que
   impede dinheiro de nascer ou sumir sem contrapartida. */
function postar(m,{data,competencia,natureza,documento=null,pagamento=null,descricao,linhas,estornoDe=null,origem="MANUAL",id}){
  const ls=consolidar(linhas);
  if(!ls.length) return null;
  const total=soma(ls,l=>l.v);
  if(total!==0) erro("Lançamento desbalanceado ("+formatar(total)+"). Nada foi gravado.",{linhas:ls});
  if(ls.some(l=>!inteiro(l.v))) erro("Valor fora do padrão de centavos. Nada foi gravado.");
  const lid=id||novoId("l");
  return m.set("lancamentos",lid,{id:lid,data,competencia:competencia||mesDe(data),natureza,documento,pagamento,
    descricao,linhas:ls,estornoDe,origem,criadoEm:m.carimbo()});
}
/* estorno = mesmo lançamento com as linhas invertidas; o original fica */
function estornarLancamento(m,l,{data,descricao,pagamento,origem}={}){
  return postar(m,{data:data||l.data,competencia:data?mesDe(data):l.competencia,natureza:"ESTORNO",
    documento:l.documento,pagamento:pagamento||l.pagamento,descricao:descricao||("Estorno: "+l.descricao),
    linhas:l.linhas.map(x=>({k:x.k,v:-x.v,parceiro:x.parceiro,categoria:x.categoria})),
    estornoDe:l.id,origem:origem||"MANUAL"});
}
function lancamentosAtivos(L,m,lista){
  return lista.filter(l=>!L.ix.estornoDe.get(l.id)&&!m.pendEstornado?.has(l.id)&&l.natureza!=="ESTORNO");
}

/* ═════════ CONTAS ═════════ */
export function criarConta(L,dados,{saldoInicial=0,dataAbertura}={}){
  const nome=(dados.nome||"").trim(); if(!nome) erro("Dê um nome para a conta.");
  if(!TIPO_CONTA[dados.tipo]) erro("Tipo de conta inválido.");
  const m=new Mudanca(L), id=dados.id||novoId("c");
  const abertura=dataAbertura||hoje(); exigirData(abertura,"data de abertura");
  const conta={id,nome,tipo:dados.tipo,instituicao:dados.instituicao||"",cor:dados.cor||"#7c5cff",
    abertura,moeda:"BRL",ativa:true,obs:dados.obs||"",reserva:dados.reserva||null,
    legado:dados.legado||null,criadoEm:agora(),atualizadoEm:agora()};
  m.set("contas",id,conta);
  if(saldoInicial) postarAbertura(m,conta,saldoInicial,abertura,dados.origem);
  m.auditar("CRIAR","conta",id,null,"Conta "+nome+" criada"+(saldoInicial?" com saldo inicial de "+formatar(saldoInicial):""));
  return m.fechar();
}
function postarAbertura(m,conta,valor,data,origem="MANUAL",obs=""){
  const did=novoId("d"), numero=m.numero(PREFIXO.ABERTURA);
  m.set("documentos",did,{id:did,numero,tipo:DOC.ABERTURA,status:"EFETIVADO",descricao:"Saldo inicial · "+conta.nome,
    valor,data,competencia:mesDe(data),conta:conta.id,origem,obs,parcelas:[],criadoEm:agora(),atualizadoEm:agora()});
  postar(m,{data,natureza:"ABERTURA",documento:did,descricao:"Saldo inicial · "+conta.nome,origem,
    linhas:[{k:K.conta(conta.id),v:valor},{k:K.ABERTURA,v:-valor}]});
  return did;
}
export function editarConta(L,id,patch){
  const c=L.contas.get(id); if(!c) erro("Conta não encontrada.");
  const m=new Mudanca(L); const novo={...c}; const mud=[];
  for(const f of ["nome","instituicao","cor","obs","tipo","reserva"]) if(f in patch&&JSON.stringify(patch[f])!==JSON.stringify(c[f])){
    if(f==="nome"&&!String(patch.nome).trim()) erro("Dê um nome para a conta.");
    if(f==="tipo"&&!TIPO_CONTA[patch.tipo]) erro("Tipo de conta inválido.");
    mud.push({campo:f,de:c[f],para:patch[f]}); novo[f]=patch[f]; }
  if(!mud.length) return m;
  novo.atualizadoEm=agora(); m.set("contas",id,novo);
  m.auditar("ALTERAR","conta",id,null,"Conta "+novo.nome+" alterada",mud);
  return m.fechar();
}
/* Saldo inicial errado se corrige estornando o antigo e lançando o certo —
   o histórico mostra os dois, e o motivo. */
export function corrigirSaldoInicial(L,contaId,{valor,data,motivo}){
  const c=L.contas.get(contaId); if(!c) erro("Conta não encontrada.");
  exigirData(data,"data de abertura");
  if(!(motivo||"").trim()) erro("Diga o motivo da correção.");
  const m=new Mudanca(L);
  const antigos=[...L.documentos.values()].filter(d=>d.tipo===DOC.ABERTURA&&d.conta===contaId&&d.status!=="CANCELADO");
  for(const d of antigos){
    for(const l of lancamentosAtivos(L,m,L.lancamentosDoDocumento(d.id))) estornarLancamento(m,l,{descricao:"Correção do saldo inicial"});
    m.set("documentos",d.id,{...d,status:"CANCELADO",canceladoEm:hoje(),motivoCancelamento:motivo,atualizadoEm:agora()});
  }
  if(valor) postarAbertura(m,c,valor,data,"MANUAL",motivo);
  m.set("contas",c.id,{...c,abertura:data,atualizadoEm:agora()});
  m.auditar("CORRIGIR","conta",c.id,null,"Saldo inicial de "+c.nome+" corrigido para "+formatar(valor||0)+" em "+data,
    [{campo:"saldoInicial",de:soma(antigos,d=>d.valor),para:valor||0},{campo:"motivo",de:null,para:motivo}]);
  return m.fechar();
}
/* Ajuste nunca substitui o saldo: é um evento com valor, data e motivo, que
   aparece no razão como qualquer outro. */
export function ajustarSaldo(L,{conta,valor,data,motivo,obs=""}){
  const c=L.contas.get(conta); if(!c) erro("Escolha a conta.");
  if(!inteiro(valor)||!valor) erro("Informe o valor do ajuste.");
  exigirData(data);
  if(!(motivo||"").trim()) erro("Diga o motivo do ajuste.");
  const m=new Mudanca(L), did=novoId("d"), numero=m.numero(PREFIXO.AJUSTE);
  m.set("documentos",did,{id:did,numero,tipo:DOC.AJUSTE,status:"EFETIVADO",descricao:motivo,valor,data,
    competencia:mesDe(data),conta,origem:"MANUAL",obs,parcelas:[],criadoEm:agora(),atualizadoEm:agora()});
  postar(m,{data,natureza:"AJUSTE",documento:did,descricao:"Ajuste · "+motivo,
    linhas:[{k:K.conta(conta),v:valor},{k:K.AJUSTE,v:-valor}]});
  m.auditar("AJUSTAR","documento",did,numero,"Ajuste de "+formatar(valor,{sinal:true})+" em "+c.nome+": "+motivo);
  return m.fechar();
}

/* ═════════ CADASTROS ═════════ */
function salvarCadastro(L,colecao,entidade,dados,validar){
  const m=new Mudanca(L); const antigo=dados.id?L[colecao].get(dados.id):null;
  const id=dados.id||novoId(entidade[0]);
  const novo={...(antigo||{ativa:true,ativo:true,criadoEm:agora()}),...dados,id,atualizadoEm:agora()};
  validar(novo,antigo);
  m.set(colecao,id,novo);
  const mud=antigo?Object.keys(dados).filter(k=>k!=="id"&&JSON.stringify(dados[k])!==JSON.stringify(antigo[k]))
    .map(k=>({campo:k,de:antigo[k]??null,para:dados[k]})):[];
  if(antigo&&!mud.length) return new Mudanca(L);
  m.auditar(antigo?"ALTERAR":"CRIAR",entidade,id,null,(antigo?"Alterado: ":"Criado: ")+novo.nome,mud);
  return m.fechar();
}
export function salvarParceiro(L,dados){
  return salvarCadastro(L,"parceiros","parceiro",dados,p=>{
    if(!(p.nome||"").trim()) erro("Dê um nome ao parceiro.");
    p.nome=p.nome.trim(); p.tipo=p.tipo||"PESSOA"; });
}
export function salvarCategoria(L,dados){
  return salvarCadastro(L,"categorias","categoria",dados,c=>{
    if(!(c.nome||"").trim()) erro("Dê um nome à categoria.");
    if(c.natureza!=="DESPESA"&&c.natureza!=="RECEITA") erro("Escolha se é de despesa ou de receita.");
    c.nome=c.nome.trim();
    const dup=[...L.categorias.values()].find(x=>x.id!==c.id&&x.ativa!==false&&x.natureza===c.natureza&&
      x.nome.toLowerCase()===c.nome.toLowerCase());
    if(dup) erro("Já existe a categoria "+dup.nome+".");
  });
}
export function salvarCartao(L,dados){
  return salvarCadastro(L,"cartoes","cartao",dados,c=>{
    if(!(c.nome||"").trim()) erro("Dê um nome ao cartão.");
    c.fechamento=+c.fechamento; c.vencimento=+c.vencimento;
    if(!(c.fechamento>=1&&c.fechamento<=31)) erro("Dia de fechamento inválido.");
    if(!(c.vencimento>=1&&c.vencimento<=31)) erro("Dia de vencimento inválido.");
    if(c.limite!=null&&(!inteiro(c.limite)||c.limite<0)) erro("Limite inválido.");
    if(c.contaPagamento&&!L.contas.get(c.contaPagamento)) erro("Conta de pagamento não encontrada.");
  });
}
/* arquivar esconde dos seletores; o histórico continua apontando para ele */
export function arquivar(L,colecao,id,ativo=false){
  const x=L[colecao].get(id); if(!x) erro("Registro não encontrado.");
  if(!ativo&&colecao==="contas"){ const s=L.saldoConta(id); if(s) erro("A conta ainda tem "+formatar(s)+". Transfira ou ajuste antes de arquivar."); }
  if(!ativo&&colecao==="cartoes"){ const s=L.dividaCartao(id); if(s) erro("O cartão ainda tem "+formatar(s)+" a pagar."); }
  const m=new Mudanca(L); const campo=colecao==="contas"||colecao==="categorias"?"ativa":"ativo";
  m.set(colecao,id,{...x,[campo]:ativo,atualizadoEm:agora()});
  m.auditar(ativo?"REATIVAR":"ARQUIVAR",colecao,id,null,(ativo?"Reativado: ":"Arquivado: ")+x.nome);
  return m.fechar();
}

/* ═════════ DOCUMENTOS ═════════ */
const NATUREZA_CAT={PAGAR:"DESPESA",COMPRA_CARTAO:"DESPESA",ESTORNO_CARTAO:"DESPESA",RECEBER:"RECEITA"};

function montarParcelas(L,d,spec){
  const docId=d.id;
  let lista;
  if(Array.isArray(spec.parcelas)){
    lista=spec.parcelas.map(x=>({...x}));
    if(soma(lista,x=>x.valor)!==d.valor) erro("A soma das parcelas ("+formatar(soma(lista,x=>x.valor))+") não bate com o total ("+formatar(d.valor)+").");
  } else {
    const n=Math.max(1,Math.min(480,parseInt(spec.parcelas||1)));
    lista=dividir(d.valor,n).map(v=>({valor:v}));
  }
  if(lista.some(x=>!inteiro(x.valor)||x.valor<=0)) erro("Toda parcela precisa ter valor maior que zero.");
  const ini=spec.parcelaInicial?.n||1, de=spec.parcelaInicial?.de||(ini-1+lista.length);
  if(DO_CARTAO.has(d.tipo)){
    const cartao=L.cartoes.get(d.cartao);
    const f0=spec.fatura||faturaDaCompra(cartao,d.data);
    return lista.map((x,i)=>{ const fatura=x.fatura||addMesesMes(f0,i);
      return {id:docId+"."+(ini+i),n:ini+i,de,valor:x.valor,fatura,vencimento:x.vencimento||datasFatura(cartao,fatura).vencimento}; });
  }
  const v0=spec.primeiroVencimento||d.data;
  return lista.map((x,i)=>({id:docId+"."+(ini+i),n:ini+i,de,valor:x.valor,vencimento:x.vencimento||addMeses(v0,i)}));
}
function linhasProvisao(d){
  const v=d.valor;
  switch(d.tipo){
    case DOC.PAGAR: return [{k:K.despesa(d.categoria),v,categoria:d.categoria,parceiro:d.parceiro},
                            {k:K.pagar(d.parceiro),v:-v,parceiro:d.parceiro}];
    case DOC.RECEBER: return [{k:K.receber(d.parceiro),v,parceiro:d.parceiro},
                              {k:K.receita(d.categoria),v:-v,categoria:d.categoria,parceiro:d.parceiro}];
    case DOC.COMPRA: return [{k:K.despesa(d.categoria),v,categoria:d.categoria,parceiro:d.parceiro},{k:K.cartao(d.cartao),v:-v}];
    case DOC.ESTORNO_CARTAO: return [{k:K.cartao(d.cartao),v},{k:K.despesa(d.categoria),v:-v,categoria:d.categoria,parceiro:d.parceiro}];
  }
  return [];
}
function postarProvisao(m,d){
  return postar(m,{data:d.data,competencia:d.competencia,natureza:"DOCUMENTO",documento:d.id,
    descricao:d.descricao,linhas:linhasProvisao(d),origem:d.origem});
}
function validarDocumento(L,d){
  if(!COM_PARCELAS.has(d.tipo)) erro("Tipo de documento inválido.");
  if(!d.descricao) erro("Informe a descrição.");
  if(!inteiro(d.valor)||d.valor<=0) erro("Informe um valor maior que zero.");
  exigirData(d.data,"data do documento");
  if(!/^\d{4}-\d{2}$/.test(d.competencia||"")) erro("Competência inválida.");
  if(DO_CARTAO.has(d.tipo)){ const c=L.cartoes.get(d.cartao); if(!c) erro("Escolha o cartão."); }
  if(d.parceiro&&!L.parceiros.get(d.parceiro)) erro("Parceiro não encontrado.");
  if(d.categoria){ const c=L.categorias.get(d.categoria);
    if(!c) erro("Categoria não encontrada.");
    if(c.natureza!==NATUREZA_CAT[d.tipo]) erro("A categoria "+c.nome+" é de "+c.natureza.toLowerCase()+"."); }
  if(d.conta&&!L.contas.get(d.conta)) erro("Conta não encontrada.");
}

/* Cria o documento, as parcelas e a provisão. Com `quitar`, paga tudo na
   hora (a despesa à vista no Pix); com `quitarPrimeiras`, paga as N
   primeiras nos seus vencimentos (o "já paguei 2 de 10" do 2.2). */
export function criarDocumento(L,spec,m){
  const proprio=!m; m=m||new Mudanca(L);
  const id=spec.id||novoId("d");
  const d={ id, numero:spec.numero||m.numero(PREFIXO[spec.tipo]), tipo:spec.tipo, status:"ABERTO",
    descricao:(spec.descricao||"").trim()||"Sem descrição", valor:spec.valor, data:spec.data,
    competencia:spec.competencia||mesDe(spec.data||""), parceiro:spec.parceiro||null, categoria:spec.categoria||null,
    conta:spec.conta||null, cartao:spec.cartao||null, forma:spec.forma||(DO_CARTAO.has(spec.tipo)?"cartao":null),
    obs:spec.obs||"", origem:spec.origem||"MANUAL", recorrencia:spec.recorrencia||null, sequencia:spec.sequencia||null,
    importacao:spec.importacao||null, legado:spec.legado||null, parcelas:[],
    criadoEm:agora(), atualizadoEm:agora() };
  validarDocumento(L,d);
  d.parcelas=montarParcelas(L,d,spec);
  m.set("documentos",id,d);
  postarProvisao(m,d);
  if(!spec.silencioso) m.auditar("CRIAR","documento",id,d.numero,
    d.numero+" · "+d.descricao+" · "+formatar(d.valor)+(d.parcelas.length>1?" em "+d.parcelas.length+"x":""));
  if(spec.quitar){
    registrarPagamento(L,{direcao:d.tipo===DOC.RECEBER?"ENTRADA":"SAIDA",data:spec.quitar.data||d.data,
      conta:spec.quitar.conta,forma:spec.quitar.forma||d.forma,parceiro:d.parceiro,origem:d.origem,
      alocacoes:d.parcelas.map(p=>({parcela:p.id,valor:p.valor}))},m);
  } else if(spec.quitarPrimeiras){
    d.parcelas.slice(0,spec.quitarPrimeiras).forEach(p=>registrarPagamento(L,{
      direcao:d.tipo===DOC.RECEBER?"ENTRADA":"SAIDA",data:p.vencimento,conta:spec.contaQuitacao||d.conta,
      forma:d.forma,parceiro:d.parceiro,origem:d.origem,alocacoes:[{parcela:p.id,valor:p.valor}]},m));
  }
  return proprio?m.fechar():m;
}

const EDITAVEL_SEMPRE=["descricao","obs"];
const EDITAVEL_PAGO=["categoria","competencia","parceiro","forma","conta"];
const ESTRUTURAL=["valor","data","parcelas","primeiroVencimento","cartao","fatura"];
export function editarDocumento(L,id,patch,m0){
  const d=L.documentos.get(id); if(!d) erro("Documento não encontrado.");
  if(d.status==="CANCELADO") erro("Documento cancelado não se altera.");
  const m=m0||new Mudanca(L);
  const planejada=d.tipo===DOC.TRANSF&&d.status==="PLANEJADA";
  if(!COM_PARCELAS.has(d.tipo)&&!planejada){
    const proib=Object.keys(patch).filter(k=>!EDITAVEL_SEMPRE.includes(k));
    if(proib.length) erro("Este documento já moveu dinheiro. Para mudar valor, conta ou data, estorne e lance de novo.");
  }
  const temPag=L.temPagamento(d);
  if(temPag){
    const proib=Object.keys(patch).filter(k=>ESTRUTURAL.includes(k)&&JSON.stringify(patch[k])!==JSON.stringify(d[k]));
    if(proib.length) erro("Este documento já tem pagamento — valor, data e parcelas não mudam. Estorne o pagamento ou cancele o documento.");
  }
  const novo={...d};
  const mud=[];
  for(const [k,v] of Object.entries(patch)){
    if(k==="vencimentos"||k==="faturas") continue;
    if(JSON.stringify(v)!==JSON.stringify(d[k])){ mud.push({campo:k,de:d[k]??null,para:v}); novo[k]=v; }
  }
  if(planejada){
    if(novo.conta===novo.contaDestino) erro("Escolha contas diferentes.");
    if(!inteiro(novo.valor)||novo.valor<=0) erro("Informe um valor maior que zero.");
    novo.competencia=mesDe(novo.data);
  } else if(COM_PARCELAS.has(d.tipo)){
    if("data" in patch&&!("competencia" in patch)&&mesDe(d.data)===d.competencia) novo.competencia=mesDe(novo.data);
    validarDocumento(L,novo);
    const estrutural=mud.some(x=>ESTRUTURAL.includes(x.campo));
    /* o primeiro vencimento acompanha a data só quando era igual a ela (a
       despesa à vista); se era outro, o usuário escolheu e ele fica */
    const v0=d.parcelas[0]?.vencimento;
    const primeiro=patch.primeiroVencimento||(("data" in patch)&&v0===d.data?novo.data:v0);
    const ini=d.parcelas[0]?.n||1;
    if(estrutural) novo.parcelas=montarParcelas(L,novo,{parcelas:patch.parcelas??d.parcelas.length,
      primeiroVencimento:primeiro, fatura:patch.fatura,
      parcelaInicial:{n:ini,de:patch.parcelas!=null?undefined:d.parcelas[0]?.de}});
    else novo.parcelas=d.parcelas.map(p=>({...p}));
    /* vencimento de parcela em aberto pode mudar sempre: não mexe em dinheiro */
    for(const v of (patch.vencimentos||[])){
      const p=novo.parcelas.find(x=>x.id===v.parcela); if(!p) continue;
      if(L.estadoParcela(p,d).restante<=0) erro("A parcela "+p.n+" já está paga.");
      if(DO_CARTAO.has(d.tipo)) continue;
      mud.push({campo:"vencimento "+p.n,de:p.vencimento,para:v.vencimento}); p.vencimento=exigirData(v.vencimento,"vencimento");
    }
    /* mover parcela de fatura ("essa compra caiu na fatura errada") */
    for(const f of (patch.faturas||[])){
      const p=novo.parcelas.find(x=>x.id===f.parcela); if(!p||!DO_CARTAO.has(d.tipo)) continue;
      if((L.ix.alocacoes.get(p.id)||[]).length) erro("A parcela "+p.n+" já foi paga na fatura.");
      mud.push({campo:"fatura "+p.n,de:p.fatura,para:f.fatura});
      p.fatura=f.fatura; p.vencimento=datasFatura(L.cartoes.get(d.cartao),f.fatura).vencimento;
    }
  }
  if(!mud.length) return m;
  novo.atualizadoEm=agora();
  m.set("documentos",id,novo);
  /* a provisão refeita: estorna a antiga (na mesma data, para o mês original
     ficar certo) e lança a nova. Os dois ficam no histórico do documento. */
  const contabil=["valor","categoria","parceiro","data","competencia","cartao"];
  if(COM_PARCELAS.has(d.tipo)&&mud.some(x=>contabil.includes(x.campo))){
    for(const l of lancamentosAtivos(L,m,L.lancamentosDoDocumento(id).filter(l=>l.natureza==="DOCUMENTO")))
      estornarLancamento(m,l,{descricao:"Correção de "+d.numero});
    postarProvisao(m,novo);
    /* parceiro trocado com algo já pago: o que foi pago ao antigo passa ao
       novo, senão o saldo a pagar de cada um deixaria de bater com as
       parcelas em aberto */
    if(novo.parceiro!==d.parceiro&&temPag&&(d.tipo===DOC.PAGAR||d.tipo===DOC.RECEBER)){
      const pago=L.estadoDocumento(d).pago;
      if(pago){
        const chave=d.tipo===DOC.PAGAR?K.pagar:K.receber, s=d.tipo===DOC.PAGAR?1:-1;
        postar(m,{data:hoje(),natureza:"RECLASSIFICACAO",documento:id,descricao:"Parceiro alterado em "+d.numero,
          linhas:[{k:chave(d.parceiro),v:-s*pago,parceiro:d.parceiro},{k:chave(novo.parceiro),v:s*pago,parceiro:novo.parceiro}]});
      }
    }
  }
  if(planejada&&mud.length){ /* planejada não tem lançamento; nada a refazer */ }
  m.auditar("ALTERAR","documento",id,d.numero,d.numero+" alterado",mud);
  return m0?m:m.fechar();
}

/* Cancelar não apaga: marca CANCELADO e estorna a provisão. Se já houve
   pagamento, só com `estornarPagamentos` — e nunca um pagamento que também
   quitou outro documento (estornar esse desfaria o outro sem avisar). */
export function cancelarDocumento(L,id,{motivo,data,estornarPagamentos=false}={},m0){
  const d=L.documentos.get(id); if(!d) erro("Documento não encontrado.");
  if(d.status==="CANCELADO") erro("O documento já está cancelado.");
  if(!(motivo||"").trim()) erro("Diga o motivo do cancelamento.");
  const m=m0||new Mudanca(L); m.pendEstornado=m.pendEstornado||new Set();
  if(COM_PARCELAS.has(d.tipo)){
    const ativos=L.pagamentosDoDocumento(d).filter(pg=>!pg.estornoDe&&!L.pagamentoEstornado(pg));
    if(ativos.length){
      if(!estornarPagamentos) erro("Este documento tem "+ativos.length+" pagamento(s). Estorne antes, ou use \"Estornar e cancelar\".");
      for(const pg of ativos){
        const outros=[...new Set(pg.alocacoes.map(a=>a.documento))].filter(x=>x!==id);
        if(outros.length) erro("O pagamento "+pg.numero+" também quitou "+outros.map(x=>L.documentos.get(x)?.numero).join(", ")+". Estorne-o pela tela do pagamento.");
        estornarPagamento(L,pg.id,{data:data||pg.data,motivo:"Cancelamento de "+d.numero+": "+motivo},m);
      }
    }
  }
  for(const l of lancamentosAtivos(L,m,L.lancamentosDoDocumento(id))){
    const deCaixa=!COM_PARCELAS.has(d.tipo);
    estornarLancamento(m,l,{data:deCaixa?(data||l.data):l.data,descricao:"Cancelamento de "+d.numero});
  }
  m.set("documentos",id,{...d,status:"CANCELADO",canceladoEm:hoje(),motivoCancelamento:motivo.trim(),atualizadoEm:agora()});
  m.auditar("CANCELAR","documento",id,d.numero,d.numero+" cancelado: "+motivo);
  return m0?m:m.fechar();
}

/* ═════════ PAGAMENTOS ═════════
   Um pagamento pode quitar várias parcelas de vários documentos, total ou
   parcialmente. Cada alocação diz quanto da parcela foi liquidado (valor),
   e se houve juros ou desconto. O dinheiro que se moveu é:
       Σ (valor + juros − desconto)
   Pagar R$ 100 de uma parcela de R$ 300 deixa R$ 200 em aberto — a parcela
   fica PARCIAL, com o histórico dos dois pagamentos. */
export function registrarPagamento(L,spec,m){
  const proprio=!m; m=m||new Mudanca(L);
  const dir=spec.direcao; if(dir!=="SAIDA"&&dir!=="ENTRADA") erro("Direção do pagamento inválida.");
  exigirData(spec.data,"data do pagamento");
  const alocs=(spec.alocacoes||[]).filter(a=>a.valor||a.juros||a.desconto);
  if(!alocs.length) erro("Escolha o que está sendo "+(dir==="SAIDA"?"pago":"recebido")+".");
  const linhas=[]; let dinheiro=0; const docs=new Set(); const final=[];
  for(const a0 of alocs){
    const a={parcela:a0.parcela,valor:int(a0.valor),juros:int(a0.juros),desconto:int(a0.desconto)};
    const info=m.infoParcela(a.parcela); if(!info) erro("Parcela não encontrada.");
    const {doc,p,restante}=info;
    if(doc.status==="CANCELADO") erro(doc.numero+" está cancelado.");
    const aceita=dir==="SAIDA"?[DOC.PAGAR,DOC.COMPRA,DOC.ESTORNO_CARTAO]:[DOC.RECEBER];
    if(!aceita.includes(doc.tipo)) erro(doc.numero+" não é "+(dir==="SAIDA"?"um pagamento":"um recebimento")+".");
    if(a.valor<0||a.juros<0||a.desconto<0) erro("Valores negativos não são aceitos. Para desfazer, estorne o pagamento.");
    if(a.valor>restante) erro("Em "+doc.numero+" parcela "+p.n+" restam "+formatar(restante)+"; foi informado "+formatar(a.valor)+".");
    if(a.desconto>a.valor) erro("O desconto não pode passar do valor quitado.");
    const sinal=doc.tipo===DOC.ESTORNO_CARTAO?-1:1;
    dinheiro+=sinal*a.valor+a.juros-a.desconto;
    m.alocPend.set(a.parcela,(m.alocPend.get(a.parcela)||0)+a.valor);
    docs.add(doc.id); final.push({...a,documento:doc.id});
    if(dir==="SAIDA"){
      if(doc.tipo===DOC.PAGAR) linhas.push({k:K.pagar(doc.parceiro),v:a.valor,parceiro:doc.parceiro});
      else linhas.push({k:K.cartao(doc.cartao),v:sinal*a.valor});
      if(a.juros) linhas.push({k:K.JUROS_PAGOS,v:a.juros,categoria:"#juros"});
      if(a.desconto) linhas.push({k:K.DESCONTO_OBTIDO,v:-a.desconto,categoria:"#desconto"});
    } else {
      linhas.push({k:K.receber(doc.parceiro),v:-a.valor,parceiro:doc.parceiro});
      if(a.juros) linhas.push({k:K.JUROS_RECEBIDOS,v:-a.juros,categoria:"#juros"});
      if(a.desconto) linhas.push({k:K.DESCONTO_CONCEDIDO,v:a.desconto,categoria:"#desconto"});
    }
  }
  if(dinheiro<0) erro("O total ficou negativo. Confira os valores.");
  if(dinheiro>0){
    const c=L.contas.get(spec.conta); if(!c) erro("Escolha a conta "+(dir==="SAIDA"?"de onde saiu o dinheiro":"onde o dinheiro entrou")+".");
    if(c.ativa===false) erro("A conta "+c.nome+" está arquivada.");
    linhas.push({k:K.conta(c.id),v:dir==="SAIDA"?-dinheiro:dinheiro});
  }
  const id=spec.id||novoId("p"), numero=spec.numero||m.numero(dir==="SAIDA"?PREFIXO.SAIDA:PREFIXO.ENTRADA);
  const nomes=[...docs].map(x=>m.obter("documentos",x)?.numero).join(", ");
  /* pagamento de um documento só leva a descrição dele: é isso que o extrato
     do banco e o razão precisam mostrar ("Netflix", não "PAY-000031") */
  const unico=docs.size===1?m.obter("documentos",[...docs][0]):null;
  const descricao=spec.descricao||(unico?unico.descricao:((dir==="SAIDA"?"Pagamento de ":"Recebimento de ")+docs.size+" documentos"));
  const pg={id,numero,direcao:dir,data:spec.data,conta:dinheiro>0?spec.conta:null,forma:spec.forma||null,
    parceiro:spec.parceiro||null,cartao:spec.cartao||null,fatura:spec.fatura||null,valor:dinheiro,
    alocacoes:final,obs:spec.obs||"",descricao,origem:spec.origem||"MANUAL",estornoDe:null,
    importacao:spec.importacao||null,legado:spec.legado||null,criadoEm:agora()};
  m.set("pagamentos",id,pg);
  const l=postar(m,{data:spec.data,natureza:"PAGAMENTO",pagamento:id,descricao,linhas,origem:pg.origem});
  if(!spec.silencioso) m.auditar(dir==="SAIDA"?"PAGAR":"RECEBER","pagamento",id,numero,
    numero+" · "+formatar(dinheiro)+" · "+nomes);
  m.ultimoLancamento=l; m.ultimoPagamento=pg;
  return proprio?m.fechar():m;
}

export function pagarFatura(L,{cartao,ref,valor,data,conta,forma="debito",origem,importacao},m){
  const proprio=!m; m=m||new Mudanca(L);
  const c=L.cartoes.get(cartao); if(!c) erro("Cartão não encontrado.");
  if(!inteiro(valor)||valor<0) erro("Informe o valor pago.");
  const r=alocarPagamentoFatura(L,cartao,ref,valor);
  if(!r.alocacoes.length) erro("Não há nada em aberto nesta fatura.");
  if(r.sobra>0) erro("O valor passa do que falta na fatura ("+formatar(r.dinheiro)+").");
  registrarPagamento(L,{direcao:"SAIDA",data,conta,forma,cartao,fatura:ref,alocacoes:r.alocacoes,origem,importacao,
    descricao:"Fatura "+c.nome+" · "+ref},m);
  return proprio?m.fechar():m;
}

/* Estorno de pagamento: um pagamento novo, com as alocações e o lançamento
   invertidos. O original continua lá, marcado como estornado. A data padrão
   é a do original — o caso comum é "registrei errado". */
export function estornarPagamento(L,id,{data,motivo}={},m){
  const proprio=!m; m=m||new Mudanca(L);
  const pg=L.pagamentos.get(id); if(!pg) erro("Pagamento não encontrado.");
  if(pg.estornoDe) erro("Este já é um estorno.");
  if(L.pagamentoEstornado(pg)) erro("Este pagamento já foi estornado.");
  if(!(motivo||"").trim()) erro("Diga o motivo do estorno.");
  const d=data||pg.data; exigirData(d);
  const nid=novoId("p"), numero=m.numero(pg.direcao==="SAIDA"?PREFIXO.SAIDA:PREFIXO.ENTRADA);
  m.set("pagamentos",nid,{...pg,id:nid,numero,data:d,valor:-pg.valor,estornoDe:pg.id,obs:motivo,
    descricao:"Estorno de "+pg.numero,alocacoes:pg.alocacoes.map(a=>({...a,valor:-a.valor,juros:-(a.juros||0),desconto:-(a.desconto||0)})),
    criadoEm:agora(),origem:"MANUAL"});
  for(const a of pg.alocacoes) m.alocPend.set(a.parcela,(m.alocPend.get(a.parcela)||0)-a.valor);
  for(const l of lancamentosAtivos(L,m,L.lancamentosDoPagamento(pg.id))){
    estornarLancamento(m,l,{data:d,pagamento:nid,descricao:"Estorno de "+pg.numero});
    m.pendEstornado?.add(l.id);
  }
  m.auditar("ESTORNAR","pagamento",pg.id,pg.numero,pg.numero+" estornado: "+motivo);
  return proprio?m.fechar():m;
}

/* ═════════ TRANSFERÊNCIAS ═════════
   Uma transferência é UM lançamento com duas linhas (sai da origem, entra no
   destino). Não existem duas pernas soltas que possam se separar: o
   lançamento que tira de uma conta é o mesmo que põe na outra. */
export function criarTransferencia(L,spec,m){
  const proprio=!m; m=m||new Mudanca(L);
  /* de/para, e não origem/destino: "origem" é de onde veio o registro
     (manual, importação, migração) em todo o resto do modelo */
  const {de,para,valor,data}=spec;
  const a=L.contas.get(de), b=L.contas.get(para);
  if(!a||!b) erro("Escolha as duas contas.");
  if(de===para) erro("Escolha contas diferentes.");
  if(!inteiro(valor)||valor<=0) erro("Informe um valor maior que zero.");
  exigirData(data);
  const id=spec.id||novoId("d"), numero=spec.numero||m.numero(PREFIXO.TRANSFERENCIA);
  const descricao=(spec.descricao||"").trim()||("Transferência "+a.nome+" → "+b.nome);
  const d={id,numero,tipo:DOC.TRANSF,status:spec.planejada?"PLANEJADA":"EFETIVADO",descricao,valor,data,
    competencia:mesDe(data),conta:de,contaDestino:para,origem:spec.origem||"MANUAL",obs:spec.obs||"",
    parcelas:[],importacao:spec.importacao||null,legado:spec.legado||null,criadoEm:agora(),atualizadoEm:agora()};
  m.set("documentos",id,d);
  if(!spec.planejada) postarTransferencia(m,d);
  if(!spec.silencioso) m.auditar("CRIAR","documento",id,numero,numero+" · "+descricao+" · "+formatar(valor)+(spec.planejada?" (planejada)":""));
  return proprio?m.fechar():m;
}
function postarTransferencia(m,d){
  return postar(m,{data:d.data,natureza:"TRANSFERENCIA",documento:d.id,descricao:d.descricao,origem:d.origem,
    linhas:[{k:K.conta(d.contaDestino),v:d.valor},{k:K.conta(d.conta),v:-d.valor}]});
}
export function efetivarTransferencia(L,id,{data}={}){
  const d=L.documentos.get(id); if(!d||d.tipo!==DOC.TRANSF) erro("Transferência não encontrada.");
  if(d.status!=="PLANEJADA") erro("Esta transferência já foi feita.");
  const m=new Mudanca(L); const nd={...d,status:"EFETIVADO",data:data||d.data,competencia:mesDe(data||d.data),atualizadoEm:agora()};
  m.set("documentos",id,nd); postarTransferencia(m,nd);
  m.auditar("EFETIVAR","documento",id,d.numero,d.numero+" efetivada");
  return m.fechar();
}

/* ═════════ CONCILIAÇÃO ═════════
   Conciliar não cria nem altera valor: só registra que a linha do razão foi
   conferida — contra uma linha do extrato, ou à mão. */
export function conciliar(L,itens,{conciliacao=null}={}){
  const m=new Mudanca(L);
  for(const {lancamento,linha,extrato} of itens){
    const l=m.obter("lancamentos",lancamento); if(!l) erro("Lançamento não encontrado.");
    const ln=l.linhas[linha]; if(!ln||!ln.k.startsWith("A:")) erro("Só movimento de conta se concilia.");
    if(ln.conc) continue;
    if(extrato){
      const e=m.obter("extrato",extrato); if(!e) erro("Linha do extrato não encontrada.");
      if(e.valor!==ln.v) erro("Os valores são diferentes ("+formatar(e.valor)+" no banco, "+formatar(ln.v)+" no WIGO).");
      if(e.conciliada) erro("Essa linha do extrato já foi conciliada.");
      m.set("extrato",e.id,{...e,estado:"CONCILIADA",conciliada:{lancamento,linha}});
    }
    const linhas=l.linhas.map((x,i)=>i===linha?{...x,conc:{em:hoje(),extrato:extrato||null,conciliacao}}:x);
    m.set("lancamentos",l.id,{...l,linhas});
  }
  if(m.vazia) return m;
  m.auditar("CONCILIAR","lancamento",itens[0].lancamento,null,itens.length+" movimento(s) conciliado(s)");
  return m.fechar();
}
export function desconciliar(L,{lancamento,linha}){
  const m=new Mudanca(L);
  const l=L.lancamentos.get(lancamento); if(!l) erro("Lançamento não encontrado.");
  const ln=l.linhas[linha]; if(!ln||!ln.conc) return m;
  if(ln.conc.extrato){ const e=L.extrato.get(ln.conc.extrato);
    if(e) m.set("extrato",e.id,{...e,estado:e.documento||e.pagamento?"LANCADA":"NOVA",conciliada:null}); }
  m.set("lancamentos",l.id,{...l,linhas:l.linhas.map((x,i)=>i===linha?{...x,conc:null}:x)});
  m.auditar("DESCONCILIAR","lancamento",l.id,null,"Conciliação desfeita: "+l.descricao);
  return m.fechar();
}
export { postar, estornarLancamento, postarAbertura };
