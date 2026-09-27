/* ══════════ DE OUTRA PESSOA ══════════
   O pedaço dos formulários de despesa e de compra no cartão que diz de quem
   é o gasto e como a pessoa vai devolver (ver "COMPRA DE OUTRA PESSOA" em
   financas/comandos.js). Serve à criação e à edição. O que aparece aqui é
   prévia: o motor confere tudo de novo ao salvar, e é a mensagem dele que
   vale. */
import { app, acao, aoDigitar, aoMudar } from "./base.js";
import { h, raw, juntar } from "./html.js";
import { I, R, fmtData, aviso } from "./componentes.js";
import { centavos, numero, dividir, soma, formatar } from "../nucleo/dinheiro.js";
import { addMeses, addMesesMes, valida } from "../nucleo/datas.js";
import { faturaDaCompra, datasFatura } from "../financas/cartoes.js";
import { normalizar } from "../nucleo/texto.js";

let tf=null;
const formEl=()=>document.getElementById(tf?.form);
const campo=(rot,conteudo,ajuda="")=>h`<div class="campo"><label>${rot}</label>${conteudo}${ajuda?h`<span class="ajuda">${ajuda}</span>`:""}</div>`;

/* começa o estado da seção: vazio (lançamento novo) ou do documento editado.
   Parcela do reembolso que já teve recebimento fica "presa": o motor não a
   muda, e o cronograma novo só cobre o resto. */
export function iniciarTerceiro({form,tipo,doc=null,pre=null}){
  const L=app.L, r=doc?.terceiro?L.documentos.get(doc.terceiro.receber):null;
  const presas=r?r.parcelas.filter(p=>(L.ix.alocacoes.get(p.id)||[]).length):[];
  const livres=r?r.parcelas.filter(p=>!presas.includes(p)):[];
  const pessoa=doc?.terceiro?.pessoa||pre?.pessoa||null, modo=doc?.terceiro?.modo||pre?.modo||"PARCELAS";
  const recebido=r?L.estadoDocumento(r).pago:0;
  tf={form,tipo,doc,resp:pessoa?"TERCEIRO":"MINHA",pessoa:pessoa?L.nomeParceiro(pessoa):"",modo,
    venc:modo==="UNICO"?(livres[livres.length-1]?.vencimento||""):"",
    linhas:modo==="PERSONALIZADO"&&doc?livres.map(p=>({valor:numero(p.valor),vencimento:p.vencimento})):[],
    presas,recebido,travado:recebido>0,era:!!doc?.terceiro,mexeu:false};
}
export const terceiroAtivo=()=>tf?.resp==="TERCEIRO";
/* a edição só manda a responsabilidade quando algo nela mudou; sem isso o
   motor faz a conta a receber acompanhar valor e parcelas sozinho */
export const terceiroMudou=()=>!!tf&&(tf.mexeu||tf.era!==(tf.resp==="TERCEIRO"));
export const nomePessoa=()=>(tf?.pessoa||"").trim();
export function specTerceiro(pessoa){
  return {pessoa,modo:tf.modo,vencimento:tf.modo==="UNICO"?(tf.venc||vencPadrao()):null,
    cronograma:tf.modo==="PERSONALIZADO"?tf.linhas.map(x=>({valor:centavos(x.valor),vencimento:x.vencimento})):null};
}
/* o que dá para barrar antes de cadastrar a pessoa nova */
export function problemaTerceiro(){
  if(!terceiroAtivo()) return null;
  if(!nomePessoa()) return "Diga quem é a pessoa responsável.";
  const p=plano(); return p.erro||null;
}

export function blocoTerceiro(){
  return h`<div id="tfBloco">${bloco()}</div>`;
}
function bloco(){
  return h`<div class="campo"><label>Responsabilidade</label>
      <div class="seg larg">${juntar([["MINHA","Minha"],["TERCEIRO","Terceiro"]],([k,r])=>h`<button type="button" class="${tf.resp===k?"on":""}" data-a="tf-resp" data-v="${k}"${tf.travado?raw(" disabled"):""}>${k==="TERCEIRO"?I("handshake","p"):""}${r}</button>`)}</div>
      <span class="ajuda">${tf.resp==="TERCEIRO"?"Você pagou por outra pessoa e ela vai te devolver. A categoria continua a real (ex.: Combustível).":"Terceiro: quando você pagou por outra pessoa e ela vai te devolver."}</span></div>
    <div id="tfCorpo">${corpo()}</div>`;
}
function corpo(){
  if(tf.resp!=="TERCEIRO") return "";
  const f=formEl(), cartao=tf.tipo==="COMPRA_CARTAO", n=nParcelas(f);
  const rotParc=cartao?(n>1?"Conforme as parcelas do cartão":"Junto com a fatura"):(n>1?"Conforme as parcelas":"No vencimento da despesa");
  return h`${tf.travado?aviso(h`${tf.pessoa} já devolveu <b>${R(tf.recebido)}</b>. Para trocar a pessoa ou tornar a compra sua, estorne esse recebimento antes. O cronograma abaixo vale para o que ainda não foi recebido.`,{tipo:"info"}):""}
    ${campo("Pessoa responsável",h`<input name="pessoa" list="tfPessoas" placeholder="Ex.: João" autocomplete="off" value="${tf.pessoa}" data-i="tf-pessoa"${tf.travado?raw(" readonly"):""}>
      <datalist id="tfPessoas">${juntar(app.L.parceirosAtivos(),p=>h`<option value="${p.nome}">`)}</datalist>`,"Digite o nome. Se ainda não estiver cadastrada, ela é criada ao salvar.")}
    <div class="campo"><label>Como essa pessoa irá te devolver esse valor?</label>
      <div class="tf-modos">${juntar([["PARCELAS",rotParc],["UNICO","De uma vez"],["PERSONALIZADO","Personalizado"]],([k,r])=>h`<label class="check"><input type="radio" name="tfModo" value="${k}" data-c="tf-modo"${tf.modo===k?raw(" checked"):""}> ${r}</label>`)}</div></div>
    ${tf.modo==="UNICO"?campo("Devolve em",h`<input type="date" name="reembVenc" value="${tf.venc||vencPadrao()}" data-c="tf-venc">`):""}
    ${tf.modo==="PERSONALIZADO"?linhasPersonalizado():""}
    <div id="tfResumo">${resumo()}</div>`;
}
function linhasPersonalizado(){
  if(!tf.linhas.length) tf.linhas=linhasIniciais();
  return h`<div class="campo"><label>Parcelas do reembolso</label>
    ${tf.presas.length?h`<div class="fraco peq" style="margin-bottom:6px">Já tiveram recebimento e ficam como estão: ${juntar(tf.presas,p=>h`${R(p.valor)} em ${fmtData(p.vencimento)}; `)}</div>`:""}
    <div class="tf-linhas">${juntar(tf.linhas,(x,i)=>h`<div class="tf-linha">
      <input class="valor" inputmode="decimal" placeholder="0,00" value="${x.valor}" data-i="tf-linha" data-ln="${i}" data-k="valor" aria-label="Valor da parcela ${i+1}">
      <input type="date" value="${x.vencimento}" data-i="tf-linha" data-ln="${i}" data-k="vencimento" aria-label="Data da parcela ${i+1}">
      <button type="button" class="btn fant peq" data-a="tf-del" data-ln="${i}" aria-label="Tirar a parcela ${i+1}"${tf.linhas.length<2?raw(" disabled"):""}>${I("x","p")}</button></div>`)}</div>
    <button type="button" class="btn sec peq" data-a="tf-add">${I("plus","p")} Parcela</button></div>`;
}

/* ── a prévia do cronograma, com as mesmas regras do motor ── */
const nParcelas=f=>Math.max(1,parseInt(f?.parcelas?.value)||1);
const totalDoForm=f=>centavos(f?.valor?.value);
/* as parcelas da própria compra: as do documento, se o que as define não
   mudou na edição; senão, calculadas como o motor calcula */
function parcelasDaCompra(f){
  const total=totalDoForm(f), n=nParcelas(f), d=tf.doc, data=f?.data?.value;
  if(d&&d.valor===total&&d.parcelas.length===n&&d.data===data&&(!f.cartao||f.cartao.value===d.cartao)) return d.parcelas.map(p=>({valor:p.valor,vencimento:p.vencimento}));
  if(!(total>0)||!valida(data||"")) return [];
  const vs=dividir(total,n);
  if(tf.tipo==="COMPRA_CARTAO"){
    const c=app.L.cartoes.get(f.cartao?.value||d?.cartao); if(!c) return [];
    const f0=faturaDaCompra(c,data);
    return vs.map((v,i)=>({valor:v,vencimento:datasFatura(c,addMesesMes(f0,i)).vencimento}));
  }
  const pago=f.jaPago?f.jaPago.checked:false;
  const v0=(!pago&&f.vencimento?.value)||f.primeiroVencimento?.value||data;
  return vs.map((v,i)=>({valor:v,vencimento:addMeses(v0,i)}));
}
const vencPadrao=()=>parcelasDaCompra(formEl())[0]?.vencimento||formEl()?.data?.value||"";
function linhasIniciais(){
  const f=formEl(), resto=totalDoForm(f)-soma(tf.presas,p=>p.valor), base=parcelasDaCompra(f);
  if(base.length>1&&!tf.presas.length) return base.map(p=>({valor:numero(p.valor),vencimento:p.vencimento}));
  const v0=vencPadrao(), vs=resto>0?dividir(resto,2):[0,0];
  return vs.map((v,i)=>({valor:v?numero(v):"",vencimento:v0?addMeses(v0,i):""}));
}
function plano(){
  const f=formEl(), total=totalDoForm(f), jaTem=soma(tf.presas,p=>p.valor), resto=total-jaTem;
  if(!(total>0)) return {linhas:[],erro:null,vazio:true};
  if(resto<0) return {linhas:[],erro:"O que já teve recebimento ("+formatar(jaTem)+") passa do novo valor."};
  if(tf.modo==="PARCELAS"){ let coberto=jaTem; const out=[];
    for(const p of parcelasDaCompra(f)){ const v=Math.min(coberto,p.valor); coberto-=v; if(p.valor>v) out.push({valor:p.valor-v,vencimento:p.vencimento}); }
    return {linhas:out}; }
  if(tf.modo==="UNICO"){ const v=tf.venc||vencPadrao();
    return {linhas:resto?[{valor:resto,vencimento:v}]:[],erro:valida(v||"")?null:"Escolha a data em que a pessoa vai te devolver."}; }
  const xs=tf.linhas.map(x=>({valor:centavos(x.valor),vencimento:x.vencimento}));
  const s=soma(xs,x=>x.valor);
  if(xs.some(x=>!(x.valor>0))) return {linhas:xs,erro:"Cada parcela precisa de um valor maior que zero."};
  if(xs.some(x=>!valida(x.vencimento||""))) return {linhas:xs,erro:"Falta a data de alguma parcela."};
  if(s!==resto) return {linhas:xs,erro:"O reembolso soma "+formatar(s)+" e "+(jaTem?"falta programar ":"a compra é de ")+formatar(resto)+": "+(s<resto?"faltam "+formatar(resto-s):"passou "+formatar(s-resto))+".",soma:s,resto};
  return {linhas:xs.slice().sort((a,b)=>a.vencimento<b.vencimento?-1:1),ok:true};
}
function resumo(){
  const f=formEl(); if(!f||tf.resp!=="TERCEIRO") return "";
  const L=app.L, total=totalDoForm(f), n=nParcelas(f), cartao=tf.tipo==="COMPRA_CARTAO";
  const p=plano(), nome=nomePessoa();
  const nova=nome&&!L.parceirosAtivos().some(x=>normalizar(x.nome)===normalizar(nome));
  const cat=f.categoria?.value?L.nomeCategoria(f.categoria.value):"";
  const datas=p.linhas.length<=4?p.linhas.map(x=>(p.linhas.length>1?R(x.valor)+" em ":"")+fmtData(x.vencimento)).join(" · ")
    :fmtData(p.linhas[0].vencimento)+" a "+fmtData(p.linhas[p.linhas.length-1].vencimento);
  return h`<div class="card pad tf-resumo">
    <div class="cap" style="margin-bottom:6px">Resumo antes de salvar</div>
    <div>${cartao?"Compra no cartão "+(L.cartoes.get(f.cartao?.value||tf.doc?.cartao)?.nome||""):"Despesa"}: <b>${R(total)}</b>${n>1?" em "+n+"x":""}${cat?" · "+cat:""}</div>
    <div>Responsável: <b>${nome||"—"}</b>${nova?h` <span class="fraco">(nova pessoa, cadastrada ao salvar)</span>`:""}</div>
    ${p.vazio?"":h`<div>Contas a receber: <b>${R(total)}</b>${p.linhas.length?h` — ${p.linhas.length>1?p.linhas.length+" parcelas":"de uma vez"}${tf.presas.length?" (além do que já teve recebimento)":""}: ${datas}`:""}</div>`}
    ${p.erro?h`<div class="down" style="margin-top:6px">${p.erro}</div>`:p.ok?h`<div class="up" style="margin-top:6px">${I("check","p")} Soma certa: ${R(soma(p.linhas,x=>x.valor))}</div>`:""}
    <div class="fraco peq" style="margin-top:8px">${cartao?"A fatura continua com o valor total. ":""}Não entra nas suas despesas. Quando ${nome||"a pessoa"} devolver, registre o recebimento na conta a receber: é dinheiro que volta, não receita.</div></div>`;
}

function redesenhar(tudo){
  const alvo=document.getElementById(tudo?"tfBloco":"tfCorpo"); if(!alvo||!tf) return;
  alvo.innerHTML=String(tudo?bloco():corpo());
  const f=formEl();
  /* despesa de outra pessoa não se repete sozinha: cada uma é lançada */
  if(f?.repetir){ f.repetir.disabled=terceiroAtivo(); if(terceiroAtivo()&&f.repetir.checked){ f.repetir.checked=false; f.repetir.dispatchEvent(new Event("change",{bubbles:true})); } }
}
function atualizarResumo(){ const el=document.getElementById("tfResumo"); if(el) el.innerHTML=String(resumo()); }
/* chamado quando valor, data, parcelas ou cartão mudam no formulário */
export function atualizarTerceiro(){ if(tf&&document.getElementById("tfCorpo")) redesenhar(false); }

acao("tf-resp",el=>{ if(tf.travado) return; tf.resp=el.dataset.v; tf.mexeu=true; redesenhar(true);
  if(tf.resp==="TERCEIRO") setTimeout(()=>{ const i=formEl()?.pessoa; if(i&&!i.value) i.focus(); },30); });
aoMudar("tf-modo",el=>{ tf.modo=el.value; tf.mexeu=true; redesenhar(false); });
aoMudar("tf-venc",el=>{ tf.venc=el.value; tf.mexeu=true; atualizarResumo(); });
aoDigitar("tf-pessoa",el=>{ tf.pessoa=el.value; tf.mexeu=true; atualizarResumo(); });
aoDigitar("tf-linha",el=>{ const x=tf.linhas[+el.dataset.ln]; if(!x) return; x[el.dataset.k]=el.value; tf.mexeu=true; atualizarResumo(); });
acao("tf-add",()=>{ const u=tf.linhas[tf.linhas.length-1], p=plano();
  const falta=p.resto!=null&&p.resto>p.soma?numero(p.resto-p.soma):"";
  tf.linhas.push({valor:falta,vencimento:u?.vencimento?addMeses(u.vencimento,1):vencPadrao()}); tf.mexeu=true; redesenhar(false); });
acao("tf-del",el=>{ if(tf.linhas.length<2) return; tf.linhas.splice(+el.dataset.ln,1); tf.mexeu=true; redesenhar(false); });
