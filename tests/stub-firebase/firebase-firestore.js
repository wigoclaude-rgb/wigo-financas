/* Firestore simulado em memória, com as mesmas funções que o app usa.
   window.__fs: Map caminho → dados. window.__falharGravacao = n faz as
   próximas n gravações serem recusadas (para testar o desfazer). */
/* sobrevive a recarregar a página (sessionStorage), para testar a sincronização incremental */
const fs=()=>{ if(window.__fs) return window.__fs;
  let salvo=null; try{ salvo=JSON.parse(sessionStorage.getItem("__fsPersist")||"null"); }catch{}
  return window.__fs=new Map(Object.entries(salvo||window.__seedFs||{})); };
const persistir=()=>{ try{ sessionStorage.setItem("__fsPersist",JSON.stringify(Object.fromEntries(window.__fs))); }catch{} };
window.__leituras=0;
window.__gravacoes=0;
export class Timestamp{ constructor(ms){ this.ms=ms; } toMillis(){ return this.ms; } static fromMillis(ms){ return new Timestamp(ms); } static now(){ return new Timestamp(Date.now()); } }
const SENTINELA={__ts:true};
export function serverTimestamp(){ return SENTINELA; }
export function initializeFirestore(){ return {}; }
export function persistentLocalCache(){ return {}; } export function persistentMultipleTabManager(){ return {}; }
export function doc(db,...partes){ const path=partes.join("/"); return {path,id:partes[partes.length-1]}; }
export function collection(db,...partes){ return {path:partes.join("/"),col:true}; }
export function where(field,op,value){ return {field,op,value}; }
export function query(col,...ws){ return {path:col.path,ws}; }
const clone=v=>v==null?v:JSON.parse(JSON.stringify(v),(k,x)=>x&&x.__tsms!=null?new Timestamp(x.__tsms):x);
function snapDoc(path,dados){ return {id:path.split("/").pop(),ref:{path},exists:()=>dados!==undefined,data:()=>clone(dados)}; }
/* __latenciaLeitura: cada ida ao servidor demora isso (ms), como num
   celular. O cache do aparelho responde na hora. */
const rede=()=>window.__latenciaLeitura?new Promise(r=>setTimeout(r,window.__latenciaLeitura)):null;
export async function getDoc(ref){ await rede(); const d=fs().get(ref.path); return snapDoc(ref.path,d); }
export async function getDocFromCache(ref){ const d=fs().get(ref.path); if(d===undefined){ const e=new Error("Failed to get document from cache."); e.code="unavailable"; throw e; } return snapDoc(ref.path,d); }
function cmp(a,op,b){ const va=a instanceof Timestamp?a.ms:(a&&a.__tsms!=null?a.__tsms:a), vb=b instanceof Timestamp?b.ms:b;
  if(op===">") return va>vb; if(op==="==") return va===vb; if(op==="in") return b.includes(a); if(op==="<") return va<vb; return false; }
export async function getDocs(q){ await rede(); return ler(q); }
function ler(q){
  const pref=q.path+"/", out=[];
  for(const [p,d] of fs()){ if(!p.startsWith(pref)||p.slice(pref.length).includes("/")) continue;
    if((q.ws||[]).every(w=>cmp(d[w.field],w.op,w.value))) out.push(snapDoc(p,d)); }
  window.__leituras+=out.length;
  return {size:out.length,docs:out,forEach:f=>out.forEach(f),empty:!out.length};
}
/* o cache não conta como leitura cobrada */
export async function getDocsFromCache(q){ const antes=window.__leituras; const r=ler(q); window.__leituras=antes; return r; }
/* As regras de firestore.rules, reproduzidas aqui: uma gravação que o
   servidor de verdade recusaria falha também no teste (permission-denied).
   Como no Firestore, cada escrita do lote é julgada contra o estado de
   ANTES do lote. Mudou firestore.rules? Mude aqui junto. */
const COLS=["contas","parceiros","categorias","cartoes","documentos","pagamentos","lancamentos",
  "recorrencias","importacoes","extrato","conciliacoes","meta","auditoria"];
function recusa(o){
  const m=o.path.match(/^users\/([^/]+)(?:\/([^/]+)\/([^/]+))?$/);
  if(!m) return "caminho fora de users/{uid}";
  const [,uid,col,id]=m;
  if(!window.__usuario||window.__usuario.uid!==uid) return "não é o dono";
  if(!col) return null;                                   // o JSON do 2.2
  const atual=fs().get(o.path);
  if(o.t==="del"){ const marca=fs().get("users/"+uid+"/meta/migracao");
    return atual&&atual._mig!=null&&marca&&marca.status==="EM_ANDAMENTO"?null:"delete proibido"; }
  if(!o.dados||o.dados._ts!==SENTINELA) return "sem o carimbo _ts do servidor";
  if(atual===undefined){
    if(!COLS.includes(col)) return "coleção fora da lista";
    if(col!=="auditoria"&&o.dados.id!==id) return "id do registro diferente do id do documento";
    return null; }
  if(col==="auditoria"||col==="pagamentos") return "alterar "+col+" é proibido";
  if(o.dados.id!==atual.id) return "id mudou";
  return null;
}
window.__recusas=[];
export function writeBatch(){
  const ops=[];
  return { set(ref,dados){ ops.push({t:"set",path:ref.path,dados}); }, delete(ref){ ops.push({t:"del",path:ref.path}); },
    async commit(){
      await new Promise(r=>setTimeout(r,window.__latencia||5));
      if(window.__falharGravacao>0){ window.__falharGravacao--; const e=new Error("Missing or insufficient permissions."); e.code="permission-denied"; throw e; }
      for(const o of ops){ const r=recusa(o); if(r){ window.__recusas.push(o.path+": "+r);
        const e=new Error("Missing or insufficient permissions."); e.code="permission-denied"; throw e; } }
      const agora=Date.now();
      for(const o of ops){ if(o.t==="del") fs().delete(o.path);
        else fs().set(o.path,JSON.parse(JSON.stringify(o.dados,(k,v)=>v===SENTINELA?{__tsms:agora}:v))); }
      window.__gravacoes++; window.__ultimoLote=ops.map(o=>o.path); persistir();
    } };
}
