/* Pedaços de interface que várias telas usam: seletores, período, rótulos. */
import { h, raw, juntar, attr } from "./html.js";
import { app } from "./base.js";
import { ROTULO_DOC, FORMAS, TIPO_CONTA, DISPONIVEL, DOC } from "../financas/modelo.js";
import { hoje, mesDe, addMesesMes, inicioDoMes, fimDoMes, addDias } from "../nucleo/datas.js";

export const clic=(a,id,extra="")=>raw(' data-a="'+a+'" data-id="'+String(id).replace(/"/g,"")+'"'+extra);

/* Com uma conta só não há o que perguntar: tudo vai para ela. O campo
   aparece a partir da segunda (regra que veio do 2.2). */
export function contasDinheiro(){ return app.L.contasAtivas().filter(c=>c.tipo!=="BENEFICIO"||true); }
/* a principal escolhida; sem escolha, a conta disponível com mais movimento */
export function contaPadrao(){
  const L=app.L, pref=L.preferencias().contaPadrao;
  if(pref&&L.contas.get(pref)&&L.contas.get(pref).ativa!==false) return pref;
  const cs=L.contasAtivas().filter(c=>DISPONIVEL.has(c.tipo))
    .sort((a,b)=>L.linhasDaChave("A:"+b.id).length-L.linhasDaChave("A:"+a.id).length);
  return cs[0]?.id||L.contasAtivas()[0]?.id||"";
}
export function campoConta({nome="conta",rotulo="Conta",valor,ajuda="",vazio=false}={}){
  const cs=app.L.contasAtivas();
  if(!cs.length) return h`<div class="aviso">${raw("")}<div>Cadastre uma conta em <b>Cadastros → Contas</b> para registrar dinheiro que entra e sai.</div></div>`;
  if(cs.length===1&&!vazio) return h`<input type="hidden" name="${nome}" value="${cs[0].id}">`;
  const v=valor??contaPadrao();
  return h`<div class="campo"><label>${rotulo}</label><select name="${nome}">${vazio?h`<option value="">—</option>`:""}
    ${juntar(cs,c=>h`<option value="${c.id}"${c.id===v?raw(" selected"):""}>${c.nome}${c.tipo!=="BANCO"?" · "+TIPO_CONTA[c.tipo]:""}</option>`)}</select>
    ${ajuda?h`<span class="ajuda">${ajuda}</span>`:""}</div>`;
}
export function opcoesCategoria(natureza,sel){
  return h`<option value="">Sem categoria</option>${juntar(app.L.categoriasAtivas(natureza),c=>h`<option value="${c.id}"${c.id===sel?raw(" selected"):""}>${c.nome}</option>`)}`;
}
export function opcoesParceiro(sel,{todos=false,nenhum="Nenhum"}={}){
  return h`${todos?h`<option value="">Todos os parceiros</option>`:h`<option value="">${nenhum}</option>`}
    ${juntar(app.L.parceirosAtivos(),p=>h`<option value="${p.id}"${p.id===sel?raw(" selected"):""}>${p.nome}</option>`)}`;
}
export function opcoesContas(sel,{todos="Todas as contas",cartoes=false}={}){
  return h`<option value="">${todos}</option>${juntar(app.L.contasAtivas(),c=>h`<option value="${c.id}"${c.id===sel?raw(" selected"):""}>${c.nome}</option>`)}
    ${cartoes?juntar(app.L.cartoesAtivos(),c=>h`<option value="card:${c.id}"${"card:"+c.id===sel?raw(" selected"):""}>${c.nome} (cartão)</option>`):""}`;
}
export function opcoesFormas(sel,{semCartao=true}={}){
  return juntar(Object.entries(FORMAS).filter(([k])=>!semCartao||k!=="cartao"),([k,v])=>h`<option value="${k}"${k===sel?raw(" selected"):""}>${v}</option>`);
}
export const rotuloTipo=t=>ROTULO_DOC[t]||t;

/* ── período: atalhos + datas ── */
export const PERIODOS=[["mes","Este mês"],["mesAnt","Mês passado"],["30","Últimos 30 dias"],["90","Últimos 90 dias"],["ano","Este ano"],["tudo","Tudo"],["pers","Personalizado"]];
export function intervalo(p,de,ate){
  const h0=hoje(), m=mesDe(h0);
  switch(p){
    case "mes": return {de:inicioDoMes(m),ate:fimDoMes(m)};
    case "mesAnt": { const a=addMesesMes(m,-1); return {de:inicioDoMes(a),ate:fimDoMes(a)}; }
    case "30": return {de:addDias(h0,-30),ate:h0};
    case "90": return {de:addDias(h0,-90),ate:h0};
    case "ano": return {de:m.slice(0,4)+"-01-01",ate:m.slice(0,4)+"-12-31"};
    case "ate30": return {de:"",ate:addDias(h0,30)};
    case "ate90": return {de:"",ate:addDias(h0,90)};
    case "proxMes": { const a=addMesesMes(m,1); return {de:inicioDoMes(a),ate:fimDoMes(a)}; }
    case "pers": return {de:de||"",ate:ate||""};
    default: return {de:"",ate:""};
  }
}
/* para vencimentos o futuro importa mais que o passado */
export const PERIODOS_VENC=[["ate30","Vencidos e próximos 30 dias"],["ate90","Vencidos e próximos 90 dias"],["mes","Vencem este mês"],["proxMes","Vencem no próximo mês"],["tudo","Qualquer vencimento"],["pers","Personalizado"]];
export function seletorPeriodo(f,nome,{semTudo=false,opcoes=PERIODOS}={}){
  return h`<select data-c="periodo" data-tela="${nome}" aria-label="Período">${juntar(opcoes.filter(([k])=>!(semTudo&&k==="tudo")),([k,r])=>h`<option value="${k}"${f.periodo===k?raw(" selected"):""}>${r}</option>`)}</select>
    ${f.periodo==="pers"?h`<input type="date" data-c="periodo-de" data-tela="${nome}" value="${f.de||""}" aria-label="De"><input type="date" data-c="periodo-ate" data-tela="${nome}" value="${f.ate||""}" aria-label="Até">`:""}`;
}
export function docDoTipo(t){ return t===DOC.RECEBER?"receita":t===DOC.PAGAR?"despesa":t===DOC.COMPRA?"compra":"documento"; }
