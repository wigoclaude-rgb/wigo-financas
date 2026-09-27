/* ══════════ BUSCA GLOBAL ══════════
   "João", "AP-000124", "Nubank", "Amazon", "500": procura em documentos,
   parceiros, contas, cartões, pagamentos e faturas. Valor casa pelo número
   formatado e pelo cru — "90" acha R$ 90,00 e R$ 1.900,00, como no 2.2. */
import { normalizar } from "../nucleo/texto.js";
import { numero } from "../nucleo/dinheiro.js";
import { ROTULO_DOC } from "./modelo.js";
import { faturasDoCartao } from "./cartoes.js";

export function buscar(L,termo,{limite=8}={}){
  const q=normalizar(termo); if(!q) return [];
  const qv=termo.replace(/[^\d,.]/g,"");
  const casaValor=v=>qv.length>=2&&(numero(Math.abs(v)).replace(/\./g,"").includes(qv.replace(/\./g,""))||numero(Math.abs(v)).includes(qv));
  const has=s=>normalizar(s).includes(q);
  const grupos=[];
  const docs=[...L.documentos.values()].filter(d=>has(d.numero)||has(d.descricao)||has(L.nomeParceiro(d.parceiro))||
    has(L.nomeCategoria(d.categoria))||casaValor(d.valor)).sort((a,b)=>a.data<b.data?1:-1);
  if(docs.length) grupos.push({grupo:"Documentos",itens:docs.slice(0,limite).map(d=>({tipo:"documento",id:d.id,
    titulo:d.numero+" · "+d.descricao,sub:ROTULO_DOC[d.tipo]+(d.parceiro?" · "+L.nomeParceiro(d.parceiro):""),valor:d.valor,data:d.data})),total:docs.length});
  const pns=[...L.parceiros.values()].filter(p=>has(p.nome)||has(p.documento)||has(p.email));
  if(pns.length) grupos.push({grupo:"Parceiros",itens:pns.slice(0,limite).map(p=>({tipo:"parceiro",id:p.id,titulo:p.nome,sub:p.documento||""})),total:pns.length});
  const contas=[...L.contas.values()].filter(c=>has(c.nome)||has(c.instituicao));
  if(contas.length) grupos.push({grupo:"Contas",itens:contas.map(c=>({tipo:"conta",id:c.id,titulo:c.nome,sub:c.instituicao||"",valor:L.saldoConta(c.id)})),total:contas.length});
  const cartoes=[...L.cartoes.values()].filter(c=>has(c.nome)||has(c.instituicao)||has(c.bandeira));
  if(cartoes.length){
    grupos.push({grupo:"Cartões",itens:cartoes.map(c=>({tipo:"cartao",id:c.id,titulo:c.nome,sub:c.instituicao||""})),total:cartoes.length});
    const fs=cartoes.flatMap(c=>faturasDoCartao(L,c.id).filter(f=>f.itens.length).map(f=>({c,f}))).slice(-limite).reverse();
    if(fs.length) grupos.push({grupo:"Faturas",itens:fs.map(({c,f})=>({tipo:"fatura",id:c.id+"|"+f.ref,titulo:"Fatura "+c.nome+" · "+f.ref,sub:"vence "+f.vencimento,valor:f.total})),total:fs.length});
  }
  const pags=[...L.pagamentos.values()].filter(p=>has(p.numero)||has(p.descricao)||casaValor(p.valor)).sort((a,b)=>a.data<b.data?1:-1);
  if(pags.length) grupos.push({grupo:"Pagamentos",itens:pags.slice(0,limite).map(p=>({tipo:"pagamento",id:p.id,titulo:p.numero+" · "+p.descricao,sub:p.data,valor:p.valor})),total:pags.length});
  return grupos;
}
