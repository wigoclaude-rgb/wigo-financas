/* sem acento, minúsculo, espaço único — base de busca e de comparação */
export function normalizar(s){
  return String(s??"").normalize("NFD").replace(/[̀-ͯ]/g,"")
    .toLowerCase().replace(/[^a-z0-9]+/g," ").trim();
}
export function tokens(s){ return normalizar(s).split(" ").filter(t=>t.length>1); }
/* semelhança por palavras em comum (Jaccard), 0..1 */
export function semelhanca(a,b){
  const A=new Set(tokens(a)), B=new Set(tokens(b));
  if(!A.size||!B.size) return 0;
  let c=0; A.forEach(t=>{ if(B.has(t)) c++; });
  return c/(A.size+B.size-c);
}
