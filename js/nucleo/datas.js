/* ══════════ DATAS ══════════
   Datas são strings ISO "AAAA-MM-DD" e meses "AAAA-MM". Comparar string ISO é
   comparar data, sem fuso nem hora — o que importa para dinheiro é o DIA.

   `hoje()` passa por um relógio substituível: os testes fixam o dia, e todo
   status que depende de data (vencida, fatura fechada) fica reproduzível. */

let relogio=()=>new Date();
export function definirRelogio(fn){ relogio=fn||(()=>new Date()); }

export function iso(d){
  return d.getFullYear()+"-"+String(d.getMonth()+1).padStart(2,"0")+"-"+String(d.getDate()).padStart(2,"0");
}
export function hoje(){ return iso(relogio()); }
export function mesDe(dataIso){ return dataIso?dataIso.slice(0,7):null; }
export function mesAtual(){ return mesDe(hoje()); }

export function ultimoDiaDoMes(mes){
  const [y,m]=mes.split("-").map(Number);
  return new Date(y,m,0).getDate();
}
/* dia do mês ajustado ao tamanho do mês: dia 31 em fevereiro vira 28/29 */
export function diaNoMes(mes,dia){
  return mes+"-"+String(Math.min(dia,ultimoDiaDoMes(mes))).padStart(2,"0");
}
export function addMeses(dataIso,n){
  const [y,m,d]=dataIso.split("-").map(Number);
  const alvo=new Date(y,m-1+n,1);
  return diaNoMes(iso(alvo).slice(0,7),d);
}
export function addMesesMes(mes,n){ return addMeses(mes+"-01",n).slice(0,7); }
export function addDias(dataIso,n){
  const [y,m,d]=dataIso.split("-").map(Number);
  return iso(new Date(y,m-1,d+n));
}
export function inicioDoMes(mes){ return mes+"-01"; }
export function fimDoMes(mes){ return diaNoMes(mes,31); }
/* dias de a até b (positivo quando b é depois) */
export function diasEntre(a,b){
  const ta=Date.UTC(...a.split("-").map((x,i)=>i===1?x-1:+x));
  const tb=Date.UTC(...b.split("-").map((x,i)=>i===1?x-1:+x));
  return Math.round((tb-ta)/86400000);
}
export function fmtData(dataIso){
  if(!dataIso) return "—";
  const [y,m,d]=dataIso.split("-"); return d+"/"+m+"/"+y;
}
export function fmtDataCurta(dataIso){
  if(!dataIso) return "—";
  const [,m,d]=dataIso.split("-"); return d+"/"+m;
}
const MESES=["janeiro","fevereiro","março","abril","maio","junho","julho","agosto","setembro","outubro","novembro","dezembro"];
const MESES_C=["jan","fev","mar","abr","mai","jun","jul","ago","set","out","nov","dez"];
export function rotuloMes(mes){ const [y,m]=mes.split("-").map(Number); return MESES[m-1]+" de "+y; }
export function rotuloMesCurto(mes){ const [y,m]=mes.split("-").map(Number); return MESES_C[m-1]+"/"+String(y).slice(2); }
export function valida(dataIso){ return /^\d{4}-\d{2}-\d{2}$/.test(dataIso||""); }
