/* ══════════ DINHEIRO ══════════
   Todo valor do WIGO 3 é um INTEIRO em centavos. O 2.2 guardava reais em
   float e arredondava com Math.round(x*100)/100 em vários lugares — soma de
   0,1 + 0,2 e divisão de parcelas deixavam centavos soltos que nenhum saldo
   explicava. Com inteiros, somar o razão inteiro dá sempre exato.

   Só a tela converte: `centavos()` na entrada, `formatar()` na saída. */

/* "1.234,56" · "1234,56" · "1234.56" · "R$ -50" · 12.5 (reais) → centavos */
export function centavos(v){
  if(v==null||v==="") return 0;
  if(typeof v==="number") return Math.round(v*100);
  let s=String(v).trim().replace(/[R$\s ]/g,"");
  const neg=/^-|^\(.*\)$|-$/.test(s);
  s=s.replace(/[()\-+]/g,"");
  if(s.includes(",")) s=s.replace(/\./g,"").replace(",",".");
  const n=parseFloat(s);
  if(isNaN(n)) return 0;
  return (neg?-1:1)*Math.round(n*100);
}

const FMT=new Intl.NumberFormat("pt-BR",{style:"currency",currency:"BRL"});
const NUM=new Intl.NumberFormat("pt-BR",{minimumFractionDigits:2,maximumFractionDigits:2});

/* 123456 → "R$ 1.234,56". `sinal:true` escreve o + dos positivos. */
export function formatar(c,{sinal=false}={}){
  const s=FMT.format((c||0)/100).replace(/ /g," ");
  return sinal&&c>0?"+"+s:s;
}
/* 123456 → "1.234,56" (para campo de digitação, sem o R$) */
export function numero(c){ return NUM.format((c||0)/100); }

/* Divide um total em n parcelas que SOMAM o total. O resto de centavos vai
   para a primeira parcela, como fazem as operadoras de cartão no Brasil:
   R$ 100 em 3x = 33,34 + 33,33 + 33,33. */
export function dividir(total,n){
  n=Math.max(1,n|0);
  const base=Math.trunc(total/n), resto=total-base*n;
  return Array.from({length:n},(_,i)=>i===0?base+resto:base);
}

export function soma(lista,f){ let t=0; for(const x of lista) t+=f?f(x):x; return t; }
