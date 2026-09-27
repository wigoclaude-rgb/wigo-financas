/* Tema: escuro (padrão, como no 2.2), claro, automático pelo horário ou
   igual ao aparelho. O index.html repete a mesma conta antes do primeiro
   desenho, para a tela não piscar branca; este módulo mantém o automático
   em dia com o relógio enquanto o app fica aberto. */
export const TEMAS=[["escuro","Escuro"],["claro","Claro"],["auto","Automático"],["sistema","Do aparelho"]];
const NOITE_DE=18, NOITE_ATE=6;   // automático: escuro das 18h às 6h
export function temaEscolhido(){
  let t=null; try{ t=localStorage.getItem("wigo3.tema"); }catch{}
  return TEMAS.some(([k])=>k===t)?t:"escuro";
}
export function aplicarTema(){
  const t=temaEscolhido(), r=document.documentElement;
  if(t==="sistema"){ delete r.dataset.tema; return; }
  const hora=new Date().getHours();
  r.dataset.tema=t==="auto"?(hora>=NOITE_DE||hora<NOITE_ATE?"escuro":"claro"):t;
}
export function escolherTema(t){ try{ localStorage.setItem("wigo3.tema",t); }catch{} aplicarTema(); }
/* o automático vira sozinho às 18h e às 6h, sem recarregar */
setInterval(()=>{ if(temaEscolhido()==="auto") aplicarTema(); },60000);
