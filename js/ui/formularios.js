/* ══════════ FORMULÁRIOS ══════════
   O usuário registra o que aconteceu ("paguei o mercado, R$ 600 em 3x no
   cartão"); documento, parcelas, provisão, pagamento e razão são
   consequência — nenhum campo aqui fala em débito ou crédito. */
import { app, acao, form, aoMudar, aoDigitar, abrirPainel, fecharPainel, executar, toast, render } from "./base.js";
import { h, raw, juntar } from "./html.js";
import { I, R, fmtData, rotuloMes, aviso, chipSt } from "./componentes.js";
import { campoConta, contaPadrao, opcoesCategoria, opcoesParceiro, opcoesFormas, clic } from "./util.js";
import { DOC, TIPO_CONTA, TIPO_PN, DISPONIVEL, ErroFinanceiro } from "../financas/modelo.js";
import * as C from "../financas/comandos.js";
import { criarRecorrencia } from "../financas/recorrencias.js";
import { faturaDaCompra, datasFatura, fatura as faturaDe } from "../financas/cartoes.js";
import { centavos, numero, dividir } from "../nucleo/dinheiro.js";
import { hoje, mesDe } from "../nucleo/datas.js";
import { normalizar } from "../nucleo/texto.js";

const campo=(rot,conteudo,ajuda="")=>h`<div class="campo"><label>${rot}</label>${conteudo}${ajuda?h`<span class="ajuda">${ajuda}</span>`:""}</div>`;
const valorInput=(nome,v,extra="")=>raw(`<input class="valor" name="${nome}" inputmode="decimal" placeholder="0,00" autocomplete="off" ${v?`value="${numero(v)}"`:""} ${extra}>`);

/* parceiro por nome: existe → id; novo → cria antes do documento */
async function resolverParceiro(nome){
  nome=(nome||"").trim(); if(!nome) return null;
  const achado=app.L.parceirosAtivos().find(p=>normalizar(p.nome)===normalizar(nome));
  if(achado) return achado.id;
  const m=C.salvarParceiro(app.L,{nome,tipo:"PESSOA"});
  await app.repo.gravar(m);
  return m.gravar.find(x=>x.colecao==="parceiros").id;
}
const listaParceiros=()=>h`<datalist id="pnLista">${juntar(app.L.parceirosAtivos(),p=>h`<option value="${p.nome}">`)}</datalist>`;

/* ═════════ NOVO LANÇAMENTO ═════════ */
let novo={tipo:"PAGAR"};
acao("doc-novo",el=>{ novo={tipo:el.dataset.v||"PAGAR",pre:null}; formNovo(); });
acao("doc-duplicar",el=>{ const d=app.L.documentos.get(el.dataset.id);
  novo={tipo:d.tipo,pre:{descricao:d.descricao,valor:d.valor,parceiro:d.parceiro,categoria:d.categoria,cartao:d.cartao,parcelas:d.parcelas.length,conta:d.conta,forma:d.forma}};
  formNovo(); });
function formNovo(){
  const t=novo.tipo, p=novo.pre||{}, L=app.L;
  const receita=t==="RECEBER", cartao=t==="COMPRA_CARTAO";
  const cartoes=L.cartoesAtivos();
  const abas=h`<div class="seg larg" style="margin-bottom:16px">${juntar([["PAGAR","Despesa"],["RECEBER","Receita"],["COMPRA_CARTAO","Cartão"],["TRF","Transferência"]],([k,r])=>
    h`<button type="button" class="${t===k?"on":""}" data-a="novo-tipo" data-v="${k}">${r}</button>`)}</div>`;
  if(t==="TRF"){ abrirPainel({titulo:"Nova transferência",sub:"Entre suas contas — não é receita nem despesa",estreito:true,id:"novo",corpo:h`${abas}${corpoTransferencia()}`}); return; }
  if(cartao&&!cartoes.length){ abrirPainel({titulo:"Compra no cartão",estreito:true,id:"novo",corpo:h`${abas}${aviso("Você ainda não tem cartão cadastrado.",{tipo:"info"})}
    <div class="btns" style="margin-top:12px"><button class="btn" data-a="cartao-novo">Cadastrar cartão</button></div>`}); return; }
  const cartaoSel=p.cartao||cartoes[0]?.id;
  abrirPainel({titulo:receita?"Nova receita":cartao?"Compra no cartão":"Nova despesa",sub:cartao?"A compra não sai do banco agora — ela entra na fatura":"",
    estreito:true,id:"novo",corpo:h`${abas}<form data-f="novo-doc" id="fNovo">
    ${campo("Descrição",h`<input name="descricao" required placeholder="${receita?"Ex.: Salário":cartao?"Ex.: Mercado":"Ex.: Conta de luz"}" value="${p.descricao||""}" autocomplete="off">`)}
    <div class="linha2">${campo(cartao?"Valor total":"Valor",valorInput("valor",p.valor,'required data-i="novo-previa"'))}
      ${campo(cartao?"Data da compra":"Data",h`<input type="date" name="data" value="${hoje()}" required data-c="novo-previa">`)}</div>
    ${cartao?campo("Cartão",h`<select name="cartao" data-c="novo-previa">${juntar(cartoes,c=>h`<option value="${c.id}"${c.id===cartaoSel?raw(" selected"):""}>${c.nome}</option>`)}</select>`):""}
    <div class="linha2">${campo(receita?"Categoria":"Categoria",h`<select name="categoria">${opcoesCategoria(receita?"RECEITA":"DESPESA",p.categoria)}</select>`)}
      ${campo(receita?"Quem paga":cartao?"Estabelecimento":"Para quem",h`<input name="parceiro" list="pnLista" placeholder="Opcional" value="${p.parceiro?L.nomeParceiro(p.parceiro):""}" autocomplete="off">${listaParceiros()}`)}</div>
    <div class="linha2">${campo("Parcelas",h`<select name="parcelas" data-c="novo-previa">${juntar(Array.from({length:24},(_,i)=>i+1),n=>h`<option value="${n}"${n===(p.parcelas||1)?raw(" selected"):""}>${n===1?"À vista":n+"x"}</option>`)}</select>`)}
      ${!cartao?campo(receita?"Forma de recebimento":"Forma de pagamento",h`<select name="forma">${opcoesFormas(p.forma||"pix")}</select>`):h`<div></div>`}</div>
    <div id="novoPrevia" class="fraco peq" style="margin:-4px 0 14px"></div>
    ${!cartao?h`<label class="check" style="margin-bottom:12px"><input type="checkbox" name="jaPago" data-c="novo-pago" checked> ${receita?"Já recebi":"Já paguei"}</label>
      <div id="novoPago">${campoConta({rotulo:receita?"Entrou em":"Saiu de",valor:p.conta})}</div>
      <div id="novoAberto" hidden>${campo("Vencimento",h`<input type="date" name="vencimento" value="${hoje()}">`,"Da primeira parcela; as outras vencem no mesmo dia dos meses seguintes.")}</div>`:""}
    <details style="margin:4px 0 14px"><summary class="link" style="list-style:none">Mais opções</summary><div style="margin-top:12px">
      <label class="check" style="margin-bottom:10px"><input type="checkbox" name="repetir" data-c="novo-repetir"> Repetir todo mês${cartao?" (assinatura)":""}</label>
      <div id="novoRepetir" hidden>${campo("Quantos meses",h`<input name="meses" inputmode="numeric" placeholder="Vazio = sem fim">`,"Sem fim: o WIGO mantém os próximos 24 meses lançados e vai estendendo sozinho.")}</div>
      ${campo("Competência",h`<input type="month" name="competencia">`,"A que mês "+(receita?"essa receita":"esse gasto")+" pertence. Vazio = mês da data. Ex.: salário de agosto recebido em 31/07 → agosto.")}
      ${campo("Observação",h`<textarea name="obs" rows="2"></textarea>`)}</div></details>
    <button class="btn larg" type="submit">${I("check")} Salvar</button></form>`});
  previaNovo();
}
acao("novo-tipo",el=>{ novo={tipo:el.dataset.v,pre:null}; formNovo(); });
aoMudar("novo-pago",el=>{ document.getElementById("novoPago").hidden=!el.checked; document.getElementById("novoAberto").hidden=el.checked; });
aoMudar("novo-repetir",el=>{ document.getElementById("novoRepetir").hidden=!el.checked; });
aoMudar("novo-previa",()=>previaNovo()); aoDigitar("novo-previa",()=>previaNovo());
function previaNovo(){
  const f=document.getElementById("fNovo"); if(!f) return;
  const v=centavos(f.valor.value), n=+f.parcelas.value||1, alvo=document.getElementById("novoPrevia");
  let txt="";
  if(v&&n>1){ const ps=dividir(v,n); txt=n+"x de "+R(ps[1])+(ps[0]!==ps[1]?" (a primeira "+R(ps[0])+")":""); }
  if(f.cartao&&f.data.value){ const c=app.L.cartoes.get(f.cartao.value); if(c){ const ref=faturaDaCompra(c,f.data.value);
    txt+=(txt?" · ":"")+"Entra na fatura de "+rotuloMes(ref)+" (vence "+fmtData(datasFatura(c,ref).vencimento)+")"; } }
  alvo.textContent=txt;
}
form("novo-doc",async(f,d)=>{
  const t=novo.tipo, valor=centavos(d.get("valor"));
  if(!(valor>0)){ toast("Informe o valor",{erro:true}); return; }
  let parceiro;
  try{ parceiro=await resolverParceiro(d.get("parceiro")); }catch(e){ toast(e.message,{erro:true}); return; }
  const base={tipo:t,descricao:d.get("descricao"),valor,data:d.get("data"),categoria:d.get("categoria")||null,parceiro,
    competencia:d.get("competencia")||undefined,obs:d.get("obs")||"",forma:d.get("forma")||(t==="COMPRA_CARTAO"?"cartao":null)};
  const n=+d.get("parcelas")||1;
  if(d.get("repetir")){
    const meses=parseInt(d.get("meses"))||null;
    const pago=t!=="COMPRA_CARTAO"&&d.get("jaPago");
    return executar(()=>criarRecorrencia(app.L,{tipo:t,descricao:base.descricao,valor,parceiro,categoria:base.categoria,
      conta:d.get("conta")||contaPadrao(),cartao:d.get("cartao")||null,forma:base.forma,inicio:pago?base.data:(d.get("vencimento")||base.data),
      quantidade:meses,quitarPrimeiras:pago?1:0,contaQuitacao:d.get("conta")||contaPadrao()}),{ok:"Lançamento mensal criado"});
  }
  if(t==="COMPRA_CARTAO") return executar(()=>C.criarDocumento(app.L,{...base,cartao:d.get("cartao"),parcelas:n}),{ok:"Compra registrada na fatura"});
  const pago=!!d.get("jaPago");
  const conta=d.get("conta")||contaPadrao();
  return executar(()=>C.criarDocumento(app.L,{...base,parcelas:n,conta,
    primeiroVencimento:pago?base.data:(d.get("vencimento")||base.data),
    ...(pago?(n===1?{quitar:{data:base.data,conta,forma:base.forma}}:{quitarPrimeiras:1,contaQuitacao:conta}):{})}),
    {ok:t==="RECEBER"?(pago?"Receita registrada":"Conta a receber criada"):(pago?"Despesa registrada":"Conta a pagar criada")});
});

/* ═════════ TRANSFERÊNCIA ═════════ */
function corpoTransferencia(){
  const cs=app.L.contasAtivas();
  if(cs.length<2) return h`${aviso("Transferência precisa de duas contas. Cadastre outra em Cadastros → Contas.",{tipo:"info"})}`;
  const d0=contaPadrao(), p0=cs.find(c=>c.id!==d0)?.id;
  const sel=(n,v)=>h`<select name="${n}">${juntar(cs,c=>h`<option value="${c.id}"${c.id===v?raw(" selected"):""}>${c.nome} · ${R(app.L.saldoConta(c.id))}</option>`)}</select>`;
  return h`<form data-f="nova-trf">
    <div class="linha2">${campo("De",sel("de",d0))}${campo("Para",sel("para",p0))}</div>
    <div class="linha2">${campo("Valor",valorInput("valor",0,"required"))}${campo("Data",h`<input type="date" name="data" value="${hoje()}" required>`)}</div>
    ${campo("Descrição",h`<input name="descricao" placeholder="Opcional">`)}
    <label class="check" style="margin-bottom:14px"><input type="checkbox" name="planejada"> Ainda vou fazer (planejada)</label>
    <button class="btn larg" type="submit">${I("swap")} Transferir</button></form>`;
}
acao("trf-nova",()=>{ novo={tipo:"TRF"}; formNovo(); });
form("nova-trf",(f,d)=>executar(()=>C.criarTransferencia(app.L,{de:d.get("de"),para:d.get("para"),valor:centavos(d.get("valor")),
  data:d.get("data"),descricao:d.get("descricao"),planejada:!!d.get("planejada")}),{ok:d.get("planejada")?"Transferência planejada":"Transferido"}));

/* ═════════ PAGAMENTO / RECEBIMENTO (modelo SAP) ═════════
   Parceiro → tudo que ele tem em aberto daquele lado → marca e ajusta o
   valor de cada linha → meio de pagamento. Um pagamento, várias parcelas.
   Valor menor que o restante = pagamento PARCIAL (o resto continua em
   aberto), a menos que "quitar com desconto" esteja marcado. Maior = a
   diferença vira juros. */
let pf=null;
export function abrirFormPagamento({direcao,parceiro="*",parcelas=[]}){
  pf={direcao,parceiro,valores:new Map(),sel:new Set(parcelas),desconto:new Set()};
  for(const id of parcelas){ const r=app.L.ix.parcela.get(id); if(r) pf.valores.set(id,app.L.estadoParcela(r.p,r.doc).restante); }
  if(parcelas.length&&parceiro==="*"){ const pns=[...new Set(parcelas.map(id=>app.L.ix.parcela.get(id)?.doc.parceiro||"-"))];
    if(pns.length===1) pf.parceiro=pns[0]; }
  desenharPagamento();
}
app.abrirFormPagamento=abrirFormPagamento;
acao("pag-novo",el=>abrirFormPagamento({direcao:el.dataset.v||"SAIDA",parceiro:""}));
acao("pag-parcela",el=>{ const r=app.L.ix.parcela.get(el.dataset.id);
  abrirFormPagamento({direcao:r.doc.tipo===DOC.RECEBER?"ENTRADA":"SAIDA",parceiro:r.doc.parceiro||"-",parcelas:[el.dataset.id]}); });
acao("pag-doc",el=>{ const d=app.L.documentos.get(el.dataset.id);
  const abertas=d.parcelas.filter(p=>app.L.estadoParcela(p,d).restante>0);
  abrirFormPagamento({direcao:d.tipo===DOC.RECEBER?"ENTRADA":"SAIDA",parceiro:d.parceiro||"-",parcelas:abertas.slice(0,1).map(p=>p.id)}); });
function itensAbertos(){
  const lado=pf.direcao==="ENTRADA"?"RECEBER":"PAGAR";
  return app.L.obrigacoes(lado).filter(x=>x.e.restante>0&&x.doc.status!=="CANCELADO"&&
    (pf.parceiro==="*"||(pf.parceiro==="-"?!x.doc.parceiro:x.doc.parceiro===pf.parceiro)||pf.sel.has(x.p.id)))
    .sort((a,b)=>a.p.vencimento<b.p.vencimento?-1:1);
}
function linhaCalc(x){
  const v=pf.valores.has(x.p.id)?pf.valores.get(x.p.id):x.e.restante;
  const valor=Math.min(v,x.e.restante), juros=Math.max(0,v-x.e.restante);
  const desconto=pf.desconto.has(x.p.id)&&v<x.e.restante?x.e.restante-v:0;
  return {valor:valor+desconto,juros,desconto,dinheiro:v};
}
function desenharPagamento(){
  const entrada=pf.direcao==="ENTRADA", L=app.L;
  const itens=pf.parceiro===""?[]:itensAbertos();
  const cont={}; for(const x of L.obrigacoes(entrada?"RECEBER":"PAGAR")) if(x.e.restante>0&&x.doc.status!=="CANCELADO"){ const k=x.doc.parceiro||"-"; cont[k]=(cont[k]||0)+1; }
  const sel=itens.filter(x=>pf.sel.has(x.p.id));
  const total=sel.reduce((s,x)=>s+linhaCalc(x).dinheiro,0);
  const parciais=sel.filter(x=>linhaCalc(x).valor<x.e.restante).length;
  const corpo=h`<form data-f="pagamento" id="fPag">
    <div class="seg larg" style="margin-bottom:14px"><button type="button" class="${!entrada?"on":""}" data-a="pf-dir" data-v="SAIDA">${I("outflow")} Pagamento</button>
      <button type="button" class="${entrada?"on":""}" data-a="pf-dir" data-v="ENTRADA">${I("inflow")} Recebimento</button></div>
    ${campo(entrada?"Receber de":"Pagar a",h`<select data-c="pf-pn"><option value="">Escolha um parceiro…</option>
      <option value="*"${pf.parceiro==="*"?raw(" selected"):""}>Todos os parceiros</option>
      ${cont["-"]?h`<option value="-"${pf.parceiro==="-"?raw(" selected"):""}>Sem parceiro · ${cont["-"]} em aberto</option>`:""}
      ${juntar(L.parceirosAtivos(),p=>h`<option value="${p.id}"${p.id===pf.parceiro?raw(" selected"):""}>${p.nome}${cont[p.id]?" · "+cont[p.id]+" em aberto":""}</option>`)}</select>`)}
    ${pf.parceiro===""?h`<div class="vazio">${I("handshake")}<div class="t">Escolha o parceiro</div>Aparece tudo que ele tem em aberto ${entrada?"para você receber":"para você pagar"}.</div>`
    :!itens.length?h`<div class="vazio"><div class="t">Nada em aberto</div>${entrada?"Nenhum valor a receber":"Nenhuma conta a pagar"} ${pf.parceiro==="*"?"":"deste parceiro"}.
      <div class="fraco peq" style="margin-top:6px">Compras no cartão são pagas pela fatura, em Documentos → Faturas.</div></div>`
    :h`<div class="card" style="margin-bottom:14px"><div class="tab-wrap"><table class="tab cartoes">
      <thead><tr><th style="width:34px"><button type="button" class="ck ${itens.every(x=>pf.sel.has(x.p.id))?"on":""}" data-a="pf-todos"></button></th>
        <th>Documento</th><th>Vence</th><th class="r">Em aberto</th><th class="r" style="width:130px">${entrada?"Recebido":"Pago"}</th></tr></thead>
      <tbody>${juntar(itens,x=>{ const on=pf.sel.has(x.p.id), c=linhaCalc(x);
        return h`<tr class="comck ${on?"sel":""}"><td class="ckc"><button type="button" class="ck ${on?"on":""}" data-a="pf-pick" data-id="${x.p.id}" aria-label="Selecionar"></button></td>
          <td><div class="t">${x.doc.descricao}</div><div class="sub"><span class="num-doc">${x.doc.numero}</span>${x.doc.parcelas.length>1?" · "+x.p.n+"/"+x.p.de:""}${pf.parceiro==="*"&&x.doc.parceiro?" · "+L.nomeParceiro(x.doc.parceiro):""}</div></td>
          <td class="nw ${x.e.vencida?"down":""}" data-r="vence">${fmtData(x.p.vencimento)}</td><td class="r"><span class="cel-only fraco peq">em aberto </span>${R(x.e.restante)}</td>
          <td class="r"><input class="valor" style="height:34px;width:130px;max-width:100%" data-i="pf-valor" data-id="${x.p.id}" inputmode="decimal" value="${numero(on?c.dinheiro:x.e.restante)}">
            ${on&&c.dinheiro<x.e.restante?h`<label class="check peq" style="justify-content:flex-end;margin-top:4px"><input type="checkbox" data-c="pf-desc" data-id="${x.p.id}"${pf.desconto.has(x.p.id)?raw(" checked"):""}> quitar c/ desconto</label>`:""}
            ${on&&c.juros?h`<div class="peq warn" style="margin-top:3px">+${R(c.juros)} de juros</div>`:""}</td></tr>`; })}</tbody></table></div></div>`}
    ${sel.length?h`<div class="card pad" style="margin-bottom:14px;background:var(--s2)">
      <div style="display:flex;justify-content:space-between;align-items:baseline;margin-bottom:12px"><span class="cap">Total ${entrada?"recebido":"pago"}</span><b style="font-size:22px">${R(total)}</b></div>
      ${parciais?h`<div class="fraco peq" style="margin:-6px 0 12px">${parciais} parcela(s) com pagamento parcial: o resto continua em aberto.</div>`:""}
      <div class="linha2">${campo("Data",h`<input type="date" name="data" value="${hoje()}" required>`)}${campo("Forma",h`<select name="forma">${opcoesFormas("pix")}</select>`)}</div>
      ${campoConta({rotulo:entrada?"Entrou em":"Saiu de"})}
      ${campo("Observação",h`<input name="obs" placeholder="Opcional">`)}
      <button class="btn larg" type="submit">${I("check")} Confirmar ${entrada?"recebimento":"pagamento"} de ${R(total)}</button></div>`:""}
    </form>`;
  if(app.painelAberto==="pagamento"){ document.querySelector("#painel .painel-corpo").innerHTML=String(corpo); return; }
  abrirPainel({titulo:entrada?"Registrar recebimento":"Registrar pagamento",sub:"Um "+(entrada?"recebimento":"pagamento")+" pode quitar várias contas, inteiras ou em parte",id:"pagamento",corpo});
}
acao("pf-dir",el=>{ pf={direcao:el.dataset.v,parceiro:"",valores:new Map(),sel:new Set(),desconto:new Set()}; desenharPagamento(); });
aoMudar("pf-pn",el=>{ pf.parceiro=el.value; pf.sel.clear(); pf.valores.clear(); pf.desconto.clear(); desenharPagamento(); });
acao("pf-pick",el=>{ const id=el.dataset.id; pf.sel.has(id)?pf.sel.delete(id):pf.sel.add(id); desenharPagamento(); });
acao("pf-todos",()=>{ const its=itensAbertos(); if(its.every(x=>pf.sel.has(x.p.id))) pf.sel.clear(); else its.forEach(x=>pf.sel.add(x.p.id)); desenharPagamento(); });
aoMudar("pf-desc",el=>{ el.checked?pf.desconto.add(el.dataset.id):pf.desconto.delete(el.dataset.id); desenharPagamento(); });
let tDig;
aoDigitar("pf-valor",el=>{ pf.valores.set(el.dataset.id,centavos(el.value)); pf.sel.add(el.dataset.id);
  clearTimeout(tDig); tDig=setTimeout(()=>{ const pos=el.selectionStart, id=el.dataset.id; desenharPagamento();
    const novo=document.querySelector('[data-i="pf-valor"][data-id="'+id+'"]'); if(novo){ novo.focus(); try{ novo.setSelectionRange(pos,pos); }catch{} } },500); });
form("pagamento",(f,d)=>{
  const itens=itensAbertos().filter(x=>pf.sel.has(x.p.id));
  const alocacoes=itens.map(x=>{ const c=linhaCalc(x); return {parcela:x.p.id,valor:c.valor,juros:c.juros,desconto:c.desconto}; });
  const pn=pf.parceiro&&pf.parceiro!=="*"&&pf.parceiro!=="-"?pf.parceiro:null;
  return executar(()=>C.registrarPagamento(app.L,{direcao:pf.direcao,data:d.get("data"),conta:d.get("conta")||contaPadrao(),
    forma:d.get("forma"),parceiro:pn,obs:d.get("obs")||"",alocacoes}),{ok:pf.direcao==="ENTRADA"?"Recebimento registrado":"Pagamento registrado"});
});

/* ═════════ PAGAR FATURA ═════════ */
acao("fatura-pagar",el=>{
  const [cid,ref]=el.dataset.id.split("|"); const c=app.L.cartoes.get(cid), f=faturaDe(app.L,cid,ref);
  abrirPainel({titulo:"Pagar fatura "+c.nome,sub:rotuloMes(ref)+" · vence "+fmtData(f.vencimento),estreito:true,id:"fatura",corpo:h`<form data-f="pagar-fatura" data-cartao="${cid}" data-ref="${ref}">
    <div class="resumo"><div><span class="cap">Total</span><b>${R(f.total)}</b></div><div><span class="cap">Pago</span><b>${R(f.pago)}</b></div><div><span class="cap">Falta</span><b>${R(f.restante)}</b></div></div>
    ${campo("Valor pago",valorInput("valor",f.restante,"required"),"Pagando menos, a fatura fica parcial e o resto continua devido.")}
    ${campo("Data do pagamento",h`<input type="date" name="data" value="${hoje()<f.vencimento?hoje():f.vencimento}" required>`)}
    ${campoConta({rotulo:"Saiu de",valor:c.contaPagamento||contaPadrao()})}
    ${aviso("Pagar a fatura não cria despesa nova: as compras já foram registradas. O pagamento só tira o dinheiro da conta e zera a dívida do cartão.",{tipo:"info",icone:"shield"})}
    <button class="btn larg" type="submit" style="margin-top:14px">${I("check")} Pagar fatura</button></form>`});
});
form("pagar-fatura",(f,d)=>executar(()=>C.pagarFatura(app.L,{cartao:f.dataset.cartao,ref:f.dataset.ref,valor:centavos(d.get("valor")),
  data:d.get("data"),conta:d.get("conta")||contaPadrao()}),{ok:"Fatura paga"}));

/* ═════════ EDITAR DOCUMENTO ═════════
   Os campos que o estado não permite aparecem travados, com o porquê — em
   vez de sumirem e o usuário achar que o app esqueceu deles. */
acao("doc-editar",el=>{
  const L=app.L, d=L.documentos.get(el.dataset.id), temPag=L.temPagamento(d);
  const parc=["PAGAR","RECEBER","COMPRA_CARTAO","ESTORNO_CARTAO"].includes(d.tipo);
  const planejada=d.tipo==="TRANSFERENCIA"&&d.status==="PLANEJADA";
  const livre=parc&&!temPag;
  const trava=motivo=>raw(motivo?' disabled title="'+motivo+'"':"");
  const mot=!parc&&!planejada?"Já moveu dinheiro: estorne e lance de novo":temPag?"Já tem pagamento: estorne o pagamento ou cancele o documento":"";
  const nat=d.tipo==="RECEBER"?"RECEITA":"DESPESA";
  abrirPainel({titulo:"Editar "+d.numero,sub:d.descricao,estreito:true,id:"editar",corpo:h`<form data-f="editar-doc" data-id="${d.id}">
    ${mot?aviso(mot+". Descrição e observação sempre podem mudar.",{tipo:"info"}):""}
    ${campo("Descrição",h`<input name="descricao" value="${d.descricao}" required>`)}
    ${parc||planejada?h`<div class="linha2">${campo("Valor",raw(`<input class="valor" name="valor" inputmode="decimal" value="${numero(d.valor)}"${String(trava(livre||planejada?"":mot))}>`))}
      ${campo("Data",h`<input type="date" name="data" value="${d.data}"${trava(livre||planejada?"":mot)}>`)}</div>`:""}
    ${parc?h`${campo("Categoria",h`<select name="categoria">${opcoesCategoria(nat,d.categoria)}</select>`)}
      ${campo("Parceiro",h`<select name="parceiro">${opcoesParceiro(d.parceiro)}</select>`,temPag?"Trocar o parceiro com algo já pago move o que foi pago para o novo parceiro, com um lançamento de reclassificação.":"")}
      <div class="linha2">${campo("Competência",h`<input type="month" name="competencia" value="${d.competencia}">`)}
      ${campo("Parcelas",h`<input name="parcelas" inputmode="numeric" value="${d.parcelas.length}"${trava(livre?"":mot)}>`)}</div>
      ${d.tipo!=="COMPRA_CARTAO"&&d.tipo!=="ESTORNO_CARTAO"?campo("Primeiro vencimento",h`<input type="date" name="primeiroVencimento" value="${d.parcelas[0]?.vencimento}"${trava(livre?"":mot)}>`):""}`:""}
    ${planejada?h`<div class="linha2">${campo("De",h`<select name="conta">${juntar(L.contasAtivas(),c=>h`<option value="${c.id}"${c.id===d.conta?raw(" selected"):""}>${c.nome}</option>`)}</select>`)}
      ${campo("Para",h`<select name="contaDestino">${juntar(L.contasAtivas(),c=>h`<option value="${c.id}"${c.id===d.contaDestino?raw(" selected"):""}>${c.nome}</option>`)}</select>`)}</div>`:""}
    ${campo("Observação",h`<textarea name="obs" rows="2">${d.obs||""}</textarea>`)}
    <button class="btn larg" type="submit">Salvar alterações</button></form>`});
});
form("editar-doc",(f,d)=>{
  const doc=app.L.documentos.get(f.dataset.id), patch={descricao:d.get("descricao"),obs:d.get("obs")||""};
  const campos=["categoria","parceiro","competencia","conta","contaDestino","data","primeiroVencimento"];
  for(const k of campos) if(f.elements[k]&&!f.elements[k].disabled&&d.get(k)!==null) patch[k]=d.get(k)||null;
  if(f.elements.valor&&!f.elements.valor.disabled) patch.valor=centavos(d.get("valor"));
  if(f.elements.parcelas&&!f.elements.parcelas.disabled){ const n=parseInt(d.get("parcelas")); if(n&&n!==doc.parcelas.length) patch.parcelas=n; }
  for(const k of Object.keys(patch)) if(k!=="parcelas"&&k!=="primeiroVencimento"&&JSON.stringify(patch[k]??null)===JSON.stringify(doc[k]??null)) delete patch[k];
  if(patch.primeiroVencimento===doc.parcelas[0]?.vencimento) delete patch.primeiroVencimento;
  if(patch.competencia===null) delete patch.competencia;
  return executar(()=>C.editarDocumento(app.L,doc.id,patch),{ok:"Documento alterado",depois:()=>app.abrirDocumento(doc.id)});
});

/* ═════════ CADASTROS ═════════ */
const cores=["#6d4dff","#0f766e","#b45309","#1e293b","#9d174d","#0e7490","#166534","#7c2d12","#2563eb","#db2777"];
const seletorCor=v=>h`<div class="chips">${juntar(cores,c=>h`<label style="cursor:pointer"><input type="radio" name="cor" value="${c}" style="display:none"${c===v?raw(" checked"):""}>
  <span class="ponto" style="width:26px;height:26px;border-radius:8px;display:inline-block;background:${c};outline:${c===v?"2px solid var(--ink)":"none"};outline-offset:2px"></span></label>`)}</div>`;
acao("conta-nova",()=>formConta(null));
acao("conta-editar",el=>formConta(app.L.contas.get(el.dataset.id)));
function formConta(c){
  abrirPainel({titulo:c?"Editar conta":"Nova conta",estreito:true,id:"conta",corpo:h`<form data-f="conta" data-id="${c?.id||""}">
    ${campo("Nome",h`<input name="nome" required value="${c?.nome||""}" placeholder="Ex.: Nubank">`)}
    <div class="linha2">${campo("Tipo",h`<select name="tipo" data-c="conta-tipo">${juntar(Object.entries(TIPO_CONTA),([k,v])=>h`<option value="${k}"${k===(c?.tipo||"BANCO")?raw(" selected"):""}>${v}</option>`)}</select>`)}
      ${campo("Instituição",h`<input name="instituicao" value="${c?.instituicao||""}" placeholder="Opcional">`)}</div>
    ${!c?h`<div class="linha2">${campo("Saldo inicial",valorInput("saldo",0),"O que tinha na conta na data de abertura.")}${campo("Data de abertura",h`<input type="date" name="abertura" value="${hoje().slice(0,8)+"01"}">`)}</div>`:""}
    <div id="contaReserva" ${(c?.tipo||"BANCO")==="RESERVA"?"":"hidden"}>
      <div class="linha3">${campo("Meta",valorInput("alvo",c?.reserva?.alvo))}${campo("Aporte mensal",valorInput("aporte",c?.reserva?.aporte))}${campo("% do CDI",h`<input name="cdi" inputmode="decimal" value="${c?.reserva?.cdi||""}">`)}</div></div>
    ${campo("Cor",seletorCor(c?.cor||cores[0]))}
    ${campo("Observação",h`<textarea name="obs" rows="2">${c?.obs||""}</textarea>`)}
    <button class="btn larg" type="submit">${c?"Salvar":"Criar conta"}</button></form>`});
}
aoMudar("conta-tipo",el=>{ document.getElementById("contaReserva").hidden=el.value!=="RESERVA"; });
form("conta",(f,d)=>{
  const id=f.dataset.id, reserva=d.get("tipo")==="RESERVA"?{alvo:centavos(d.get("alvo")),aporte:centavos(d.get("aporte")),cdi:+String(d.get("cdi")||0).replace(",",".")||0}:null;
  const dados={nome:d.get("nome"),tipo:d.get("tipo"),instituicao:d.get("instituicao"),cor:d.get("cor")||cores[0],obs:d.get("obs")||"",reserva};
  if(id) return executar(()=>C.editarConta(app.L,id,dados),{ok:"Conta salva"});
  return executar(()=>C.criarConta(app.L,dados,{saldoInicial:centavos(d.get("saldo")),dataAbertura:d.get("abertura")||hoje()}),{ok:"Conta criada"});
});
acao("conta-abertura",el=>{ const c=app.L.contas.get(el.dataset.id);
  abrirPainel({titulo:"Corrigir saldo inicial",sub:c.nome,estreito:true,id:"abertura",corpo:h`<form data-f="abertura" data-id="${c.id}">
    ${aviso("O saldo inicial atual é estornado e o novo é lançado. Os dois ficam no histórico, com o motivo.",{tipo:"info"})}
    <div class="linha2" style="margin-top:14px">${campo("Saldo inicial",valorInput("valor",0,"required"))}${campo("Em",h`<input type="date" name="data" value="${c.abertura||hoje()}" required>`)}</div>
    ${campo("Motivo",h`<input name="motivo" required placeholder="Ex.: conferi no app do banco">`)}
    <button class="btn larg" type="submit">Corrigir</button></form>`}); });
form("abertura",(f,d)=>executar(()=>C.corrigirSaldoInicial(app.L,f.dataset.id,{valor:centavos(d.get("valor")),data:d.get("data"),motivo:d.get("motivo")}),{ok:"Saldo inicial corrigido"}));
acao("conta-ajuste",el=>{ const c=app.L.contas.get(el.dataset.id), s=app.L.saldoConta(c.id);
  abrirPainel({titulo:"Ajuste de saldo",sub:c.nome+" · hoje "+R(s),estreito:true,id:"ajuste",corpo:h`<form data-f="ajuste" data-id="${c.id}">
    ${aviso(h`Use por último. Antes, a <b>Reconciliação</b> mostra de onde vem a diferença — lançamento faltando, em dobro, fatura não paga. Um ajuste esconde a causa.`)}
    <div class="linha2" style="margin-top:14px">${campo("Saldo que o banco mostra",valorInput("banco",0),"O WIGO calcula o ajuste pela diferença.")}${campo("Ou o valor do ajuste",h`<input class="valor" name="valor" inputmode="decimal" placeholder="+/− 0,00">`)}</div>
    <div class="linha2">${campo("Data",h`<input type="date" name="data" value="${hoje()}" required>`)}${campo("Motivo",h`<input name="motivo" required placeholder="Ex.: tarifa não lançada">`)}</div>
    ${campo("Observação",h`<input name="obs">`)}
    <button class="btn larg" type="submit">Lançar ajuste</button></form>`}); });
form("ajuste",(f,d)=>{
  const id=f.dataset.id; let v=centavos(d.get("valor"));
  if(!v&&d.get("banco")) v=centavos(d.get("banco"))-app.L.saldoConta(id,d.get("data"));
  return executar(()=>C.ajustarSaldo(app.L,{conta:id,valor:v,data:d.get("data"),motivo:d.get("motivo"),obs:d.get("obs")||""}),{ok:"Ajuste lançado"});
});
acao("conta-arquivar",el=>executar(()=>C.arquivar(app.L,"contas",el.dataset.id,el.dataset.v==="1"),{ok:el.dataset.v==="1"?"Conta reativada":"Conta arquivada"}));
acao("conta-padrao",el=>executar(()=>{ const m=new C.Mudanca(app.L); m.set("meta","preferencias",{...app.L.preferencias(),id:"preferencias",contaPadrao:el.dataset.id}); return m; },{ok:"Conta principal definida",fechar:false}));

acao("cartao-novo",()=>formCartao(null));
acao("cartao-editar",el=>formCartao(app.L.cartoes.get(el.dataset.id)));
function formCartao(c){
  abrirPainel({titulo:c?"Editar cartão":"Novo cartão",estreito:true,id:"cartao",corpo:h`<form data-f="cartao" data-id="${c?.id||""}">
    <div class="linha2">${campo("Nome",h`<input name="nome" required value="${c?.nome||""}" placeholder="Ex.: Roxinho">`)}${campo("Banco",h`<input name="instituicao" value="${c?.instituicao||""}">`)}</div>
    <div class="linha2">${campo("Limite",valorInput("limite",c?.limite),"Vazio = sem limite.")}${campo("Bandeira",h`<input name="bandeira" value="${c?.bandeira||""}" placeholder="Opcional">`)}</div>
    <div class="linha2">${campo("Fecha no dia",h`<input name="fechamento" inputmode="numeric" required value="${c?.fechamento||""}">`,"Compras até esse dia entram na fatura do mês.")}${campo("Vence no dia",h`<input name="vencimento" inputmode="numeric" required value="${c?.vencimento||""}">`)}</div>
    ${campoConta({nome:"contaPagamento",rotulo:"Fatura debitada em",valor:c?.contaPagamento,vazio:true,ajuda:"A conta sugerida ao pagar a fatura."})}
    ${campo("Cor",seletorCor(c?.cor||"#5b21b6"))}
    <button class="btn larg" type="submit">${c?"Salvar":"Criar cartão"}</button></form>`});
}
form("cartao",(f,d)=>{ const lim=String(d.get("limite")||"").trim();
  return executar(()=>C.salvarCartao(app.L,{...(f.dataset.id?{id:f.dataset.id}:{}),nome:d.get("nome"),instituicao:d.get("instituicao")||"",bandeira:d.get("bandeira")||"",
    limite:lim?centavos(lim):null,fechamento:d.get("fechamento"),vencimento:d.get("vencimento"),contaPagamento:d.get("contaPagamento")||null,cor:d.get("cor")||"#5b21b6"}),{ok:"Cartão salvo"}); });
acao("cartao-arquivar",el=>executar(()=>C.arquivar(app.L,"cartoes",el.dataset.id,el.dataset.v==="1"),{ok:"Cartão atualizado"}));

acao("parceiro-novo",()=>formParceiro(null));
acao("parceiro-editar",el=>formParceiro(app.L.parceiros.get(el.dataset.id)));
function formParceiro(p){
  abrirPainel({titulo:p?"Editar parceiro":"Novo parceiro de negócio",estreito:true,id:"parceiro",corpo:h`<form data-f="parceiro" data-id="${p?.id||""}">
    ${campo("Nome",h`<input name="nome" required value="${p?.nome||""}">`)}
    <div class="linha2">${campo("Tipo",h`<select name="tipo">${juntar(Object.entries(TIPO_PN),([k,v])=>h`<option value="${k}"${k===(p?.tipo||"PESSOA")?raw(" selected"):""}>${v}</option>`)}</select>`)}
      ${campo("CPF / CNPJ",h`<input name="documento" value="${p?.documento||""}" inputmode="numeric">`)}</div>
    <div class="linha2">${campo("E-mail",h`<input name="email" type="email" value="${p?.email||""}">`)}${campo("Telefone",h`<input name="telefone" value="${p?.telefone||""}">`)}</div>
    ${campo("Observação",h`<textarea name="obs" rows="2">${p?.obs||""}</textarea>`)}
    <button class="btn larg" type="submit">${p?"Salvar":"Criar parceiro"}</button></form>`});
}
form("parceiro",(f,d)=>executar(()=>C.salvarParceiro(app.L,{...(f.dataset.id?{id:f.dataset.id}:{}),nome:d.get("nome"),tipo:d.get("tipo"),
  documento:d.get("documento")||"",email:d.get("email")||"",telefone:d.get("telefone")||"",obs:d.get("obs")||""}),{ok:"Parceiro salvo"}));
acao("parceiro-arquivar",el=>executar(()=>C.arquivar(app.L,"parceiros",el.dataset.id,el.dataset.v==="1"),{ok:"Parceiro atualizado"}));

acao("categoria-nova",el=>formCategoria(null,el.dataset.v));
acao("categoria-editar",el=>formCategoria(app.L.categorias.get(el.dataset.id)));
function formCategoria(c,nat="DESPESA"){
  abrirPainel({titulo:c?"Editar categoria":"Nova categoria",estreito:true,id:"categoria",corpo:h`<form data-f="categoria" data-id="${c?.id||""}">
    ${campo("Nome",h`<input name="nome" required value="${c?.nome||""}">`)}
    ${campo("É de",h`<select name="natureza"${c?raw(" disabled"):""}><option value="DESPESA"${(c?.natureza||nat)==="DESPESA"?raw(" selected"):""}>Despesa</option><option value="RECEITA"${(c?.natureza||nat)==="RECEITA"?raw(" selected"):""}>Receita</option></select>`,c?"A natureza não muda: os lançamentos já feitos dependem dela.":"")}
    <button class="btn larg" type="submit">${c?"Salvar":"Criar categoria"}</button></form>`});
}
form("categoria",(f,d)=>{ const c=f.dataset.id?app.L.categorias.get(f.dataset.id):null;
  return executar(()=>C.salvarCategoria(app.L,{...(c?{id:c.id}:{}),nome:d.get("nome"),natureza:c?c.natureza:d.get("natureza")}),{ok:"Categoria salva"}); });
acao("categoria-arquivar",el=>executar(()=>C.arquivar(app.L,"categorias",el.dataset.id,el.dataset.v==="1"),{ok:"Categoria atualizada",fechar:false}));
