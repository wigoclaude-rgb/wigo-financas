/* mini-harness: sem dependência, roda com `node tests/<arquivo>.mjs` */
let ok=0, falhas=0, grupo="";
export function g(nome){ grupo=nome; console.log("\n— "+nome); }
export function t(nome,obtido,esperado){
  const a=JSON.stringify(obtido), b=JSON.stringify(esperado);
  if(a===b){ ok++; }
  else { falhas++; console.log("  FALHOU "+nome+"\n    esperado: "+b+"\n    obtido:   "+a); }
}
export function lanca(nome,fn,trecho){
  try{ fn(); falhas++; console.log("  FALHOU "+nome+" (não lançou erro)"); }
  catch(e){ if(trecho&&!String(e.message).includes(trecho)){ falhas++;
      console.log("  FALHOU "+nome+"\n    erro esperado com: "+trecho+"\n    veio: "+e.message); } else ok++; }
}
export function fim(){
  console.log("\n══════════════════════════════\n"+ok+" passaram, "+falhas+" falharam");
  if(falhas) process.exitCode=1;
}
