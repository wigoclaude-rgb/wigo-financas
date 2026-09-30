/* ══════════ POUPANÇA E INVESTIMENTOS ══════════
   Como no 2.2, a pedido do usuário (30/09/2026): o rendimento é uma
   ESTIMATIVA mostrada na tela — quanto o saldo de hoje rende por mês e por
   ano — e não entra no saldo sozinho. O saldo da conta só muda com o que é
   lançado (aporte, resgate, e o rendimento real do extrato como receita);
   se o app somasse a estimativa, o WIGO deixaria de bater com o banco na
   reconciliação.

   Cada investimento é uma conta RESERVA com
     reserva:{ alvo, aporte, produto, indexador, taxa }
   As metas migradas do 2.2 têm só `cdi` (% do CDI) e continuam valendo como
   "% do CDI".

   Os índices (CDI, Selic, IPCA, TR) são referências que o usuário edita em
   Ajustes, como era o "CDI de referência" do 2.2. Buscar sozinho no Banco
   Central foi considerado e deixado de lado: o usuário preferiu o jeito do
   2.2. */

import { K } from "./modelo.js";
import { hoje, diasEntre, mesDe } from "../nucleo/datas.js";

/* idx: indexadores aceitos, o primeiro é o padrão. isento: sem IR. */
export const PRODUTOS={
  POUPANCA:     {rot:"Poupança",                               idx:["POUPANCA"],          isento:true, grupo:"Renda fixa"},
  CONTA:        {rot:"Conta que rende (Nubank, Mercado Pago…)",idx:["CDI"],                            grupo:"Renda fixa"},
  CDB:          {rot:"CDB / RDB",                              idx:["CDI","PRE","IPCA"],               grupo:"Renda fixa"},
  LCI_LCA:      {rot:"LCI / LCA",                              idx:["CDI","PRE","IPCA"],  isento:true, grupo:"Renda fixa"},
  TESOURO_SELIC:{rot:"Tesouro Selic",                          idx:["SELIC"],                          grupo:"Renda fixa"},
  TESOURO_PRE:  {rot:"Tesouro Prefixado",                      idx:["PRE"],                            grupo:"Renda fixa"},
  TESOURO_IPCA: {rot:"Tesouro IPCA+",                          idx:["IPCA"],                           grupo:"Renda fixa"},
  FUNDO_DI:     {rot:"Fundo DI / renda fixa",                  idx:["CDI"],                            grupo:"Renda fixa"},
  CRI_CRA:      {rot:"CRI / CRA",                              idx:["CDI","PRE","IPCA"],  isento:true, grupo:"Renda fixa"},
  DEBENTURE:    {rot:"Debênture",                              idx:["CDI","PRE","IPCA"],               grupo:"Renda fixa"},
  ACOES:        {rot:"Ações",                                  idx:["NENHUM"],                         grupo:"Renda variável"},
  FII:          {rot:"Fundos imobiliários (FII)",              idx:["NENHUM"],                         grupo:"Renda variável"},
  ETF:          {rot:"ETF / fundos de ações",                  idx:["NENHUM"],                         grupo:"Renda variável"},
  CRIPTO:       {rot:"Criptomoedas",                           idx:["NENHUM"],                         grupo:"Renda variável"},
  OUTRO:        {rot:"Outro",                                  idx:["CDI","PRE","IPCA","NENHUM"],      grupo:"Outro"}
};
export const INDEXADORES={ CDI:"% do CDI", SELIC:"% da Selic", PRE:"Prefixado (% ao ano)", IPCA:"IPCA + % ao ano",
  POUPANCA:"Regra da poupança", NENHUM:"Sem rendimento fixo" };
/* Referências de 2026 para a primeira vez; o usuário confere e atualiza em
   Ajustes. CDI em % ao ano (o mesmo 14,65% do 2.2), Selic meta em % ao ano,
   IPCA acumulado em 12 meses, TR em % ao mês. */
export const INDICES_PADRAO={ cdi:14.65, selic:14.75, ipca:4.5, tr:0.15 };

export function indices(L){
  const p=L.preferencias(), ix={...INDICES_PADRAO,...(p.indices||{})};
  /* o CDI de referência que veio do 2.2 (fração) vale até o usuário mudar */
  if(p.indices?.cdi==null&&p.cdiRef) ix.cdi=Math.round(p.cdiRef*10000)/100;
  return ix;
}
export function validarIndices(ix){
  for(const [k,max] of [["cdi",100],["selic",100],["ipca",100],["tr",10]]){
    const v=ix[k];
    if(typeof v!=="number"||!isFinite(v)||v<0||v>max) return "Índice inválido: "+k.toUpperCase()+".";
  }
  return null;
}

/* produto, indexador e taxa de uma conta, com as metas do 2.2 (só `cdi`)
   lidas como "% do CDI" */
export function perfil(conta){
  const r=conta?.reserva||{};
  const produto=PRODUTOS[r.produto]?r.produto:"OUTRO";
  const aceitos=PRODUTOS[produto].idx;
  const indexador=aceitos.includes(r.indexador)?r.indexador:r.produto?aceitos[0]:(r.cdi>0?"CDI":"NENHUM");
  const taxa=r.taxa!=null&&r.taxa!==""?+r.taxa:indexador==="CDI"?(+r.cdi||0):indexador==="SELIC"?100:0;
  return { produto, indexador, taxa, isento:!!PRODUTOS[produto].isento };
}
/* Regra da poupança (Lei 12.703/2012): com a Selic acima de 8,5% ao ano,
   0,5% ao mês + TR; senão, 70% da Selic (mensalizada) + TR. */
export function poupancaMensal(ix){
  const base=ix.selic>8.5?0.005:Math.pow(1+0.7*ix.selic/100,1/12)-1;
  return base+ix.tr/100;
}
/* taxa efetiva ao ano, como fração (0,1465 = 14,65%) */
export function taxaAnual(pf,ix){
  switch(pf.indexador){
    case "CDI": return pf.taxa/100*ix.cdi/100;
    case "SELIC": return pf.taxa/100*ix.selic/100;
    case "PRE": return pf.taxa/100;
    case "IPCA": return (1+ix.ipca/100)*(1+pf.taxa/100)-1;
    case "POUPANCA": return Math.pow(1+poupancaMensal(ix),12)-1;
  }
  return 0;
}
/* IR regressivo da renda fixa, pelo tempo desde a aplicação */
export function aliquotaIR(dias){ return dias<=180?0.225:dias<=360?0.2:dias<=720?0.175:0.15; }

const pct=v=>String(Math.round(v*100)/100).replace(".",",")+"%";
export function rotuloTaxa(pf){
  switch(pf.indexador){
    case "CDI": return pct(pf.taxa)+" do CDI";
    case "SELIC": return pct(pf.taxa)+" da Selic";
    case "PRE": return pct(pf.taxa)+" ao ano";
    case "IPCA": return "IPCA + "+pct(pf.taxa);
    case "POUPANCA": return "regra da poupança";
  }
  return "sem rendimento fixo";
}

/* Quanto o saldo de hoje rende (fórmula do 2.2: ao ano = saldo × taxa; ao
   mês = saldo × ((1+taxa)^(1/12) − 1)). O IR usa o tempo desde o primeiro
   movimento da conta — é estimativa: cada aporte tem o seu prazo. */
export function rendimentoEstimado(L,conta,ate=hoje()){
  const saldo=Math.max(0,L.saldoConta(conta.id,ate)), pf=perfil(conta), ix=indices(L);
  const anual=taxaAnual(pf,ix);
  const mes=Math.round(saldo*(Math.pow(1+anual,1/12)-1)), ano=Math.round(saldo*anual);
  const primeira=L.linhasDaChave(K.conta(conta.id)).find(x=>x.data<=ate)?.data;
  const dias=primeira?diasEntre(primeira,ate):0;
  const ir=pf.isento||!anual?0:aliquotaIR(dias);
  return { saldo, perfil:pf, anual, mes, ano, ir, dias,
    mesLiquido:Math.round(mes*(1-ir)), anoLiquido:Math.round(ano*(1-ir)), calcula:anual>0 };
}

/* Meta: quanto falta e em quantos meses, no ritmo do aporte mensal — ou, sem
   ele, na média do que entrou por mês com movimento (como no 2.2). */
export function progressoMeta(L,conta,ate=hoje()){
  const alvo=conta.reserva?.alvo||0, saldo=L.saldoConta(conta.id,ate);
  if(!alvo) return { alvo:0, saldo, pct:0, falta:0, meses:null, batida:false };
  const falta=Math.max(0,alvo-saldo), batida=saldo>=alvo;
  let ritmo=conta.reserva?.aporte||0;
  if(!ritmo){ const ls=L.linhasDaChave(K.conta(conta.id)).filter(x=>x.data<=ate);
    const meses=new Set(ls.map(x=>mesDe(x.data))).size; ritmo=meses?Math.max(0,saldo)/meses:0; }
  return { alvo, saldo, pct:Math.max(0,Math.min(100,saldo/alvo*100)), falta, batida,
    meses:!batida&&ritmo>0?Math.ceil(falta/ritmo):null };
}

/* a tela inteira: cada investimento ativo e os totais */
export function carteira(L,ate=hoje()){
  const itens=[...L.contas.values()].filter(c=>c.tipo==="RESERVA"&&c.ativa!==false)
    .sort((a,b)=>String(a.nome).localeCompare(String(b.nome),"pt-BR"))
    .map(c=>({ conta:c, est:rendimentoEstimado(L,c,ate), meta:progressoMeta(L,c,ate) }));
  const somar=f=>itens.reduce((s,x)=>s+f(x),0);
  return { itens, guardado:somar(x=>L.saldoConta(x.conta.id,ate)), metas:somar(x=>x.meta.alvo),
    rendeMes:somar(x=>x.est.mesLiquido), rendeAno:somar(x=>x.est.anoLiquido), indices:indices(L),
    batidas:itens.filter(x=>x.meta.batida).length };
}
