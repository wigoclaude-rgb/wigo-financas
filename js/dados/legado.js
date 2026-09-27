/* ══════════ O CÁLCULO DO 2.2 ══════════
   Cópia fiel das regras de saldo do WIGO 2.2 (cashRealized, signedFor,
   aberturaMes), usada só para CONFERIR a migração: depois de converter,
   cada conta tem que mostrar no 3 o mesmo saldo que mostrava no 2.2. Se não
   mostrar, a migração diz qual conta e quanto — em vez de o usuário
   descobrir sozinho que o número mudou. */

const mkey=iso=>(iso||"").slice(0,7);
const val=t=>t.paid?(t.payAmt??t.amount):t.amount;
const cashMonth=t=>t.paid?mkey(t.payDate||t.due):null;
function signedFor(t,acc){
  if(t.type==="xfer"){ if(!acc) return 0; if(t.accTo===acc) return val(t); if(t.accId===acc) return -val(t); return 0; }
  if(acc&&t.accId!==acc) return 0;
  return (t.type==="inc"?1:-1)*val(t);
}
export function legadoAtivos(S){ return (S.tx||[]).filter(t=>!t.deleted); }
function aberturaMes(S,acc){
  if(acc){ const a=(S.accounts||[]).find(x=>x.id===acc); return a&&a.opening?a.opening.month:null; }
  if((S.accounts||[]).length) return S.accounts.reduce((m,a)=>(a.opening&&(!m||a.opening.month<m))?a.opening.month:m,null);
  return S.opening?S.opening.month:null;
}
function aberturaValor(S,acc){
  if(acc){ const a=(S.accounts||[]).find(x=>x.id===acc); return a&&a.opening?(a.opening.amount||0):0; }
  if((S.accounts||[]).length) return S.accounts.reduce((s,a)=>s+(a.opening?(a.opening.amount||0):0),0);
  return S.opening?(S.opening.amount||0):0;
}
/* saldo realizado até o fim do mês mk, em REAIS (float), como o 2.2 fazia */
export function saldoLegado(S,mk,acc){
  let saldo=aberturaValor(S,acc);
  for(const t of legadoAtivos(S)){
    const m=cashMonth(t); if(!m||m>mk) continue;
    const ini=aberturaMes(S,acc||t.accId||null);
    if(ini&&m<ini) continue;
    saldo+=signedFor(t,acc);
  }
  return Math.round(saldo*100);
}
/* em aberto no cartão (o limite usado, sem depender do mês da tela) */
export function cartaoLegado(S,cardId){
  return Math.round(legadoAtivos(S).filter(t=>t.cardId===cardId&&t.type==="exp"&&!t.paid).reduce((s,t)=>s+t.amount,0)*100);
}
export function abertoLegado(S,tipo){
  return Math.round(legadoAtivos(S).filter(t=>!t.paid&&!t.cardId&&t.type===tipo&&t.dest!=="savings"&&t.method!=="ticket")
    .reduce((s,t)=>s+t.amount,0)*100);
}
