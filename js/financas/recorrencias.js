/* ══════════ RECORRÊNCIAS ══════════
   O "fixo mensal" do 2.2 era um grupo de lançamentos gêmeos. Aqui ele é um
   MODELO que gera documentos de verdade — um por mês, cada um com seu
   número, sua competência e seu pagamento. O aluguel de outubro e o de
   novembro são obrigações diferentes; tratá-los como parcelas de um
   documento só faria "cancelar o aluguel" cancelar o que já foi pago.

   Sem fim, mantemos a mesma janela do 2.2: 24 meses à frente de hoje,
   esticada a cada carga. */

import { Mudanca, criarDocumento, editarDocumento, cancelarDocumento } from "./comandos.js";
import { DOC, ErroFinanceiro } from "./modelo.js";
import { hoje, addMeses, mesDe, fimDoMes, addMesesMes } from "../nucleo/datas.js";
import { formatar } from "../nucleo/dinheiro.js";
import { novoId } from "../nucleo/ids.js";

export const JANELA_MESES=24;
const TIPOS=new Set([DOC.PAGAR,DOC.RECEBER,DOC.COMPRA]);
const agora=()=>new Date().toISOString();

export function limiteDaJanela(){ return fimDoMes(addMesesMes(mesDe(hoje()),JANELA_MESES)); }

export function criarRecorrencia(L,spec){
  if(!TIPOS.has(spec.tipo)) throw new ErroFinanceiro("Tipo de recorrência inválido.");
  if(!(spec.valor>0)) throw new ErroFinanceiro("Informe um valor maior que zero.");
  if(!/^\d{4}-\d{2}-\d{2}$/.test(spec.inicio||"")) throw new ErroFinanceiro("Informe a primeira data.");
  const m=new Mudanca(L), id=spec.id||novoId("r");
  const rec={id,tipo:spec.tipo,ativa:true,inicio:spec.inicio,quantidade:spec.quantidade||null,geradas:0,ultima:null,
    modelo:{descricao:(spec.descricao||"").trim()||"Sem descrição",valor:spec.valor,parceiro:spec.parceiro||null,
      categoria:spec.categoria||null,conta:spec.conta||null,cartao:spec.cartao||null,forma:spec.forma||null,obs:spec.obs||""},
    legado:spec.legado||null,criadoEm:agora(),atualizadoEm:agora()};
  m.set("recorrencias",id,rec);
  gerarDe(L,rec,m,limiteDaJanela(),spec.quitarPrimeiras||0,spec.contaQuitacao);
  m.auditar("CRIAR","recorrencia",id,null,"Recorrência: "+rec.modelo.descricao+" · "+formatar(rec.modelo.valor)+
    " por mês"+(rec.quantidade?" ("+rec.quantidade+"x)":" (sem fim)"));
  return m.fechar();
}
function gerarDe(L,rec0,m,ate,quitarPrimeiras=0,contaQuitacao){
  let rec={...rec0}; let n=0;
  while(true){
    const seq=rec.geradas+1;
    if(rec.quantidade&&seq>rec.quantidade) break;
    const data=addMeses(rec.inicio,seq-1);
    if(data>ate) break;
    const md=rec.modelo;
    criarDocumento(L,{tipo:rec.tipo,descricao:md.descricao,valor:md.valor,data,primeiroVencimento:data,
      competencia:mesDe(data),parceiro:md.parceiro,categoria:md.categoria,conta:md.conta,cartao:md.cartao,
      forma:md.forma,obs:md.obs,origem:"RECORRENCIA",recorrencia:rec.id,sequencia:seq,silencioso:true,
      id:rec.legadoIds?.[seq-1],quitar:seq<=quitarPrimeiras&&rec.tipo!==DOC.COMPRA?{data,conta:contaQuitacao||md.conta,forma:md.forma}:null},m);
    rec={...rec,geradas:seq,ultima:data}; n++;
  }
  if(n) m.set("recorrencias",rec.id,{...rec,atualizadoEm:agora()});
  return n;
}
/* chamado a cada carga: gera o que a janela ganhou desde a última visita */
export function gerarPendentes(L,{ate}={}){
  const m=new Mudanca(L); let n=0;
  for(const r of L.recorrencias.values()) if(r.ativa) n+=gerarDe(L,r,m,ate||limiteDaJanela());
  return n?m.fechar():null;
}
/* futuros = documentos da recorrência ainda sem pagamento e com data a partir de hoje */
export function documentosFuturos(L,recId){
  return (L.ix.docsRecorrencia.get(recId)||[]).filter(d=>d.status!=="CANCELADO"&&d.data>=hoje()&&!L.temPagamento(d));
}
export function editarRecorrencia(L,id,patch,{aplicarFuturos=true}={}){
  const r=L.recorrencias.get(id); if(!r) throw new ErroFinanceiro("Recorrência não encontrada.");
  const m=new Mudanca(L);
  const modelo={...r.modelo,...patch};
  m.set("recorrencias",id,{...r,modelo,atualizadoEm:agora()});
  if(aplicarFuturos){
    const campos=["descricao","valor","parceiro","categoria","conta","forma","obs"].filter(k=>k in patch);
    for(const d of documentosFuturos(L,id)){
      const p={}; for(const k of campos) p[k]=patch[k];
      if(Object.keys(p).length) editarDocumento(L,d.id,p,m);
    }
  }
  m.auditar("ALTERAR","recorrencia",id,null,"Recorrência alterada: "+modelo.descricao,
    Object.keys(patch).map(k=>({campo:k,de:r.modelo[k]??null,para:patch[k]})));
  return m.fechar();
}
export function encerrarRecorrencia(L,id,{cancelarFuturos=true,motivo="Recorrência encerrada"}={}){
  const r=L.recorrencias.get(id); if(!r) throw new ErroFinanceiro("Recorrência não encontrada.");
  const m=new Mudanca(L);
  m.set("recorrencias",id,{...r,ativa:false,encerradaEm:hoje(),atualizadoEm:agora()});
  let n=0;
  if(cancelarFuturos) for(const d of documentosFuturos(L,id)){ cancelarDocumento(L,d.id,{motivo},m); n++; }
  m.auditar("ENCERRAR","recorrencia",id,null,"Recorrência encerrada: "+r.modelo.descricao+(n?" ("+n+" futuros cancelados)":""));
  return m.fechar();
}
