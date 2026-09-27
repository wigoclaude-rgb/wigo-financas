/* Template com escape automático. No 2.2 cada texto do usuário precisava
   lembrar de passar por esc() — aqui é o contrário: tudo é escapado, e só o
   que já é HTML montado por nós (raw, ou outro h``) entra cru. Esquecer um
   escape deixa de ser possível. */
export class Raw{ constructor(s){ this.s=s; } toString(){ return this.s; } }
export const raw=s=>new Raw(s==null?"":String(s));
const MAP={"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"};
export const esc=s=>String(s??"").replace(/[&<>"']/g,c=>MAP[c]);
function v(x){
  if(x==null||x===false||x===true) return "";
  if(x instanceof Raw) return x.s;
  if(Array.isArray(x)) return x.map(v).join("");
  return esc(x);
}
export function h(strs,...vals){ let o=strs[0]; for(let i=0;i<vals.length;i++) o+=v(vals[i])+strs[i+1]; return new Raw(o); }
/* f recebe o item e o índice: sem o índice, a tela de colunas da importação
   gerava todas as opções com value="" e escolher uma coluna não valia */
export const juntar=(lista,f)=>raw(lista.map((x,i)=>v(f?f(x,i):x)).join(""));
export const attr=(nome,val)=>val==null||val===false?raw(""):raw(" "+nome+'="'+esc(val===true?"":val)+'"');
