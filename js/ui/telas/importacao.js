/* ══════════ IMPORTAÇÃO ══════════
   Arquivo → lote → linhas → análise → revisão → confirmação. Nada entra no
   livro antes do "Lançar": até lá é só a análise na tela. Cada linha mostra
   o que o WIGO achou (já importada, já no app, quita uma conta, paga uma
   fatura, nova) e a ação proposta, que o usuário pode trocar. */
import { app, tela, render, acao, aoMudar, executar, toast, ir } from "../base.js";
import { h, raw, juntar } from "../html.js";
import { I, R, Rs, fmtData, chipSt, chip, vazio, aviso, kpi, rotuloMes } from "../componentes.js";
import { contaPadrao, opcoesCategoria, opcoesParceiro } from "../util.js";
import { lerArquivo, aplicarColunas, analisar, confirmar, contar, faturaProvavel, desfazerImportacao } from "../../importacao/analise.js";
import { datasFatura } from "../../financas/cartoes.js";
import { addMesesMes } from "../../nucleo/datas.js";

let imp=null;
const novo=()=>({passo:"escolher",modo:"CONTA",conta:contaPadrao(),cartao:app.L.cartoesAtivos()[0]?.id||"",filtro:"lancar",criarParcelas:true});
const RECUSA={
  pdf:["PDF não dá para importar","O PDF é feito para ser lido por gente, não por programa: as movimentações vêm no meio de propaganda, telefone do SAC e cotação do dólar, sem o ano na data e com o sinal depois do número. Ler isso sem errar não é possível de forma confiável."],
  "xls-antigo":["Este Excel é do formato antigo (.xls)","O .xls antigo é um formato binário fechado. Abra no Excel ou no Google Planilhas e salve como .xlsx ou .csv — os dois funcionam aqui."],
  vazio:["O arquivo não tem movimentações","Não encontrei linhas de lançamento neste arquivo. Confira se baixou o período certo."],
  grande:["Arquivo grande demais","Acima de 10 MB o navegador engasga. Baixe um período menor."],
  formato:["Formato não reconhecido","Não consegui identificar este arquivo. Baixe o extrato em CSV, Excel (.xlsx) ou OFX."]
};
const ESTADOS=[["lancar","Vão entrar"],["NOVA","Novas"],["QUITA","Quitam conta"],["FATURA","Pagam fatura"],["NO_APP","Já no app"],["POSSIVEL","Confira"],["DUPLICADA","Já importadas"],["ERRO","Com erro"],["todas","Todas"]];
function acoesPara(l,modo){
  if(l.estado==="ERRO") return [];
  if(modo==="CARTAO") return l.valor<0?[["CRIAR","Lançar estorno"],["IGNORAR","Ignorar"]]:[["CRIAR","Lançar compra"],["IGNORAR","Ignorar"]];
  const xs=[];
  if(l.estado==="NO_APP"||l.estado==="POSSIVEL") xs.push(["VINCULAR","Só conciliar com o do app"]);
  if(l.estado==="QUITA") xs.push(["QUITAR","Quitar a conta em aberto"]);
  if(l.estado==="FATURA") xs.push(["PAGAR_FATURA","Pagar a fatura"]);
  xs.push(["CRIAR",l.valor>0?"Lançar como receita":"Lançar como despesa"]);
  if(app.L.contasAtivas().length>1) xs.push(["TRANSFERIR","Transferência entre contas"]);
  xs.push(["IGNORAR","Ignorar"]);
  return xs;
}

tela("importacao",{titulo:"Importação",grupo:"Extratos e faturas",render(app){
  const L=app.L;
  if(!imp) imp=novo();
  if(!L.contasAtivas().length) return h`<div class="card">${vazio({icone:"bank",titulo:"Cadastre uma conta primeiro",texto:"O extrato é importado para dentro de uma conta.",acoes:h`<button class="btn" data-a="conta-nova">Nova conta</button>`})}</div>`;
  if(imp.passo==="erro") return telaErro();
  if(imp.passo==="colunas") return telaColunas();
  if(imp.passo==="revisar") return telaRevisar(L);
  if(imp.passo==="fim") return telaFim(L);
  return telaEscolher(L);
}});

function telaEscolher(L){
  const lotes=[...L.importacoes.values()].sort((a,b)=>a.em<b.em?1:-1).slice(0,8);
  const cartoes=L.cartoesAtivos();
  return h`<div class="grade g-dash">
    <div class="card pad">
      <h2 class="t2" style="margin-bottom:4px">Importar extrato ou fatura</h2>
      <div class="fraco" style="margin-bottom:18px">O arquivo nunca escreve direto: você revisa cada linha antes. Importar de novo o mesmo arquivo não duplica nada.</div>
      <div class="seg larg" style="margin-bottom:16px"><button class="${imp.modo==="CONTA"?"on":""}" data-a="imp-modo" data-v="CONTA">${I("bank")} Extrato da conta</button>
        <button class="${imp.modo==="CARTAO"?"on":""}" data-a="imp-modo" data-v="CARTAO">${I("card")} Fatura do cartão</button></div>
      ${imp.modo==="CONTA"?h`<div class="campo"><label>Conta</label><select data-c="imp-alvo" data-k="conta">${juntar(L.contasAtivas(),c=>h`<option value="${c.id}"${c.id===imp.conta?raw(" selected"):""}>${c.nome}</option>`)}</select>
          <span class="ajuda">No extrato o dinheiro já se moveu: cada linha vira um pagamento ou recebimento, já conciliado.</span></div>`
        :cartoes.length?h`<div class="campo"><label>Cartão</label><select data-c="imp-alvo" data-k="cartao">${juntar(cartoes,c=>h`<option value="${c.id}"${c.id===imp.cartao?raw(" selected"):""}>${c.nome}</option>`)}</select>
          <span class="ajuda">Na fatura o dinheiro ainda não saiu: cada linha vira compra no cartão. Sai do banco quando a fatura é paga.</span></div>`
        :aviso(h`Nenhum cartão cadastrado. <a class="link" data-a="cartao-novo">Cadastrar</a>`,{tipo:"info"})}
      <label class="btn larg" style="margin-top:6px">${I("upload")} Escolher arquivo<input type="file" data-c="imp-arquivo" accept=".csv,.ofx,.qfx,.txt,.xlsx,.xls,.tsv,.pdf" hidden></label>
      <div class="fraco peq" style="margin-top:14px"><b>Funciona:</b> CSV · Excel (.xlsx) · OFX (o melhor: traz o tipo e um identificador por lançamento). <b>PDF não</b> — o app explica como converter.</div>
    </div>
    <div class="card"><div class="card-cab"><h2 class="t2">Importações anteriores</h2></div>
      <div class="lista" style="margin-top:8px">${lotes.length?juntar(lotes,l=>h`<div class="${l.desfeita?"fraca":""}"><div class="meio"><div class="t">${l.arquivo||"arquivo"}</div>
        <div class="s">${new Date(l.em).toLocaleDateString("pt-BR")} · ${l.conta?L.nomeConta(l.conta):"cartão "+L.nomeCartao(l.cartao)} · ${l.contagem.criadas} criado(s), ${l.contagem.vinculadas+l.contagem.quitadas+l.contagem.faturas} vinculado(s), ${l.contagem.duplicadas+l.contagem.ignoradas} ignorado(s)${l.desfeita?" · desfeita":""}</div></div>
        ${l.desfeita?"":h`<button class="btn peq fant" data-a="imp-desfazer" data-id="${l.id}">Desfazer</button>`}</div>`)
        :h`<div class="fraco peq" style="display:block">Nenhuma ainda.</div>`}</div></div></div>`;
}
function telaErro(){
  const [t,txt]=RECUSA[imp.erro]||RECUSA.formato;
  return h`<div class="card pad" style="max-width:720px"><h2 class="t2">${t}</h2><div class="fraco" style="margin:4px 0 16px">${imp.arquivo||""}</div>
    ${aviso(txt)}
    <div class="card pad" style="margin:16px 0;background:var(--s2)"><b>O que funciona</b>
      <div class="rank" style="margin-top:8px"><div><span><b>CSV</b> — o formato mais simples</span></div><div><span><b>Excel (.xlsx)</b> — a planilha que o banco baixa</span></div><div><span><b>OFX</b> — traz o tipo e um identificador por lançamento</span></div></div>
      <div class="fraco peq" style="margin-top:10px"><b>Só tem PDF?</b> Abra no Excel, LibreOffice ou Google Planilhas e salve como CSV ou .xlsx. Confira se data, descrição e valor ficaram em colunas separadas.</div></div>
    <div class="btns"><button class="btn" data-a="imp-reiniciar">Escolher outro arquivo</button></div></div>`;
}
function telaColunas(){
  const b=imp.leitura.bruto, cab=imp.leitura.cabecalho, amostra=b.slice(cab.idx+1,cab.idx+6), ncol=Math.max(...b.slice(0,20).map(l=>l.length));
  const nomes=Array.from({length:ncol},(_,i)=>cab.idx>=0&&b[cab.idx][i]?b[cab.idx][i]:"Coluna "+(i+1));
  const sel=(k,rot,obrig)=>h`<div class="campo"><label>${rot}</label><select name="${k}"><option value="">${obrig?"Escolha…":"— nenhuma —"}</option>${juntar(nomes,(n,i)=>h`<option value="${i}"${cab.cols[k]===i?raw(" selected"):""}>${n}</option>`)}</select></div>`;
  return h`<form class="card pad" data-f="imp-colunas" style="max-width:860px"><h2 class="t2">Quais colunas são quais?</h2>
    <div class="fraco" style="margin:4px 0 16px">Não reconheci o cabeçalho com certeza — é melhor perguntar do que importar na coluna errada.</div>
    <div class="grade g3">${sel("data","Data",true)}${sel("desc","Descrição",true)}${sel("valor","Valor (com sinal)")}${sel("debito","Débito / saída")}${sel("credito","Crédito / entrada")}${sel("id","Identificador")}</div>
    <div class="tab-wrap card" style="margin:6px 0 16px"><table class="tab"><thead><tr>${juntar(nomes,n=>h`<th>${n}</th>`)}</tr></thead>
      <tbody>${juntar(amostra,l=>h`<tr>${juntar(nomes.map((_,i)=>l[i]??""),c=>h`<td class="peq">${c}</td>`)}</tr>`)}</tbody></table></div>
    <div class="btns"><button class="btn" type="submit">Continuar</button><button class="btn sec" type="button" data-a="imp-reiniciar">Cancelar</button></div></form>`;
}
function telaRevisar(L){
  const an=imp.analise, c=contar(an.linhas);
  const cartao=imp.modo==="CARTAO";
  const visiveis=an.linhas.filter(l=>imp.filtro==="todas"||(imp.filtro==="lancar"?l.acao!=="IGNORAR":l.estado===imp.filtro));
  const positivas=an.linhas.filter(l=>l.valor>0).length;
  const suspeita=!cartao&&an.linhas.length>=4&&positivas/an.linhas.length>0.8;
  const refs=cartao?[-2,-1,0,1].map(n=>addMesesMes(imp.faturaRef,n)):[];
  return h`<div class="btns" style="justify-content:space-between;margin-bottom:12px"><div><div class="t2">${imp.arquivo}</div>
      <div class="fraco peq">${cartao?"Fatura "+L.nomeCartao(imp.cartao):"Extrato "+L.nomeConta(imp.conta)} · ${an.linhas.length} linha(s)${imp.saldoInformado?" · saldo informado pelo banco: "+R(imp.saldoInformado.valor)+" em "+fmtData(imp.saldoInformado.data):""}</div></div>
      <button class="btn sec peq" data-a="imp-reiniciar">Trocar arquivo</button></div>
    ${suspeita?aviso(h`<b>Quase tudo aqui entraria como receita.</b> Isso costuma ser uma fatura de cartão importada como extrato de conta. <a class="link" data-a="imp-trocar-modo">Importar como fatura</a>`,{tipo:"ruim"}):""}
    ${imp.modoSugerido&&imp.modoSugerido!==imp.modo?aviso("O arquivo parece ser "+(imp.modoSugerido==="CARTAO"?"de cartão":"de conta")+", mas você escolheu "+(cartao?"fatura":"extrato de conta")+".",{tipo:"ruim"}):""}
    ${cartao?h`<div class="card pad secao"><div class="grade g2" style="align-items:end"><div class="campo" style="margin:0"><label>Esta é a fatura de</label>
      <select data-c="imp-fatura">${juntar(refs,r=>h`<option value="${r}"${r===imp.faturaRef?raw(" selected"):""}>${rotuloMes(r)} · vence ${fmtData(datasFatura(L.cartoes.get(imp.cartao),r).vencimento)}</option>`)}</select></div>
      <label class="check"><input type="checkbox" data-c="imp-parcelas"${imp.criarParcelas?raw(" checked"):""}> Criar as parcelas futuras ("Parcela 2/5" cria 2/5 a 5/5)</label></div></div>`:""}
    <div class="kpis secao">
      ${kpi({rotulo:"Vão entrar",valor:String(c.lancar),acao:"imp-filtro",v:"lancar",cls:imp.filtro==="lancar"?"on":""})}
      ${kpi({rotulo:"Novas",valor:String(c.novas),acao:"imp-filtro",v:"NOVA",cls:imp.filtro==="NOVA"?"on":""})}
      ${cartao?"":kpi({rotulo:"Quitam conta",valor:String(c.quita),acao:"imp-filtro",v:"QUITA",cls:imp.filtro==="QUITA"?"on":""})}
      ${cartao?"":kpi({rotulo:"Pagam fatura",valor:String(c.fatura),acao:"imp-filtro",v:"FATURA",cls:imp.filtro==="FATURA"?"on":""})}
      ${kpi({rotulo:"Já no app",valor:String(c.noApp+c.possiveis),acao:"imp-filtro",v:"NO_APP",cls:imp.filtro==="NO_APP"?"on":""})}
      ${kpi({rotulo:"Já importadas",valor:String(c.duplicadas),acao:"imp-filtro",v:"DUPLICADA",cls:imp.filtro==="DUPLICADA"?"on":""})}
      ${c.erros?kpi({rotulo:"Com erro",valor:String(c.erros),acao:"imp-filtro",v:"ERRO",tom:"down",cls:imp.filtro==="ERRO"?"on":""}):""}</div>
    <div class="filtros"><div class="chips">${juntar(ESTADOS,([k,t])=>h`<button class="fchip ${imp.filtro===k?"on":""}" data-a="imp-filtro" data-v="${k}">${t}</button>`)}</div>
      <button class="btn peq sec" data-a="imp-todas" data-v="1">Lançar todas as novas</button><button class="btn peq fant" data-a="imp-todas" data-v="0">Ignorar todas visíveis</button></div>
    <div class="card"><div class="lista">${visiveis.length?juntar(visiveis.slice(0,300),l=>linhaRevisao(L,l)):h`<div class="fraco" style="display:block">Nenhuma linha neste filtro.</div>`}</div></div>
    ${visiveis.length>300?h`<div class="fraco peq" style="margin-top:8px">Mostrando 300 de ${visiveis.length}. As outras entram com a ação proposta.</div>`:""}
    <div style="height:70px"></div>`;
}
function linhaRevisao(L,l){
  const cartao=imp.modo==="CARTAO", acoes=acoesPara(l,imp.modo), criar=l.acao==="CRIAR";
  const nat=cartao?"DESPESA":l.valor>0?"RECEITA":"DESPESA";
  return h`<div style="align-items:flex-start;${l.acao==="IGNORAR"?"opacity:.6":""}">
    <div class="meio"><div class="t" style="white-space:normal">${l.descricao}</div>
      <div class="s" style="white-space:normal">${fmtData(l.data)}${l.parcela?" · parcela "+l.parcela.n+"/"+l.parcela.de:""} · ${chipSt(l.estado)} ${l.motivo||l.erro||""}${l.aviso?h` <span class="warn">${l.aviso}</span>`:""}</div>
      ${acoes.length?h`<div class="btns" style="margin-top:8px">
        <select data-c="imp-linha" data-i-l="${l.i}" data-k="acao" style="width:auto;height:32px">${juntar(acoes,([k,t])=>h`<option value="${k}"${k===l.acao?raw(" selected"):""}>${t}</option>`)}</select>
        ${criar?h`<select data-c="imp-linha" data-i-l="${l.i}" data-k="categoria" style="width:auto;height:32px">${opcoesCategoria(nat,l.categoria)}</select>
          <select data-c="imp-linha" data-i-l="${l.i}" data-k="parceiro" style="width:auto;height:32px;max-width:180px">${opcoesParceiro(l.parceiro,{nenhum:"Sem parceiro"})}</select>`:""}
        ${l.acao==="TRANSFERIR"?h`<select data-c="imp-linha" data-i-l="${l.i}" data-k="contaDestino" style="width:auto;height:32px"><option value="">${l.valor<0?"Para qual conta?":"De qual conta?"}</option>${juntar(L.contasAtivas().filter(c=>c.id!==imp.conta),c=>h`<option value="${c.id}"${c.id===l.contaDestino?raw(" selected"):""}>${c.nome}</option>`)}</select>`:""}
      </div>`:""}</div>
    <div class="dir num" style="font-weight:650">${l.valor!=null?(cartao?(l.valor<0?"−"+R(-l.valor):R(l.valor)):Rs(l.valor)):"—"}</div></div>`;
}
function telaFim(L){
  const c=imp.resultado;
  return h`<div class="card pad" style="max-width:640px">${aviso(h`<b>Importação concluída.</b> ${c.criadas} lançamento(s) criado(s), ${c.vinculadas} conciliado(s) com o que já existia, ${c.quitadas} conta(s) quitada(s), ${c.faturas} fatura(s) paga(s), ${c.duplicadas+c.ignoradas} ignorado(s).`,{tipo:"bom",icone:"check"})}
    <div class="btns" style="margin-top:16px"><button class="btn" data-a="ir" data-v="${imp.modo==="CARTAO"?"faturas":"movimentos"}">Ver ${imp.modo==="CARTAO"?"faturas":"movimentações"}</button>
    ${imp.modo==="CONTA"?h`<button class="btn sec" data-a="rc-conta" data-id="${imp.conta}">Conciliar esta conta</button>`:""}
    <button class="btn sec" data-a="imp-reiniciar">Importar outro</button></div></div>`;
}
function barraRevisao(){
  if(!imp||imp.passo!=="revisar") return null;
  const c=contar(imp.analise.linhas);
  return h`<div class="info"><b>${c.lancar}</b> linha(s) vão entrar · ${c.ignoradas} ignorada(s)</div>
    <button class="btn peq" data-a="imp-confirmar"${c.lancar?"":raw(" disabled")}>${I("check","p")} Lançar ${c.lancar}</button>`;
}
app.telas.importacao.barraSelecao=barraRevisao;

acao("imp-modo",el=>{ imp.modo=el.dataset.v; render(); });
acao("imp-trocar-modo",()=>{ imp.modo="CARTAO"; imp.cartao=imp.cartao||app.L.cartoesAtivos()[0]?.id; if(!imp.cartao){ toast("Cadastre um cartão primeiro",{erro:true}); return; } analisarAgora(); });
aoMudar("imp-alvo",el=>{ imp[el.dataset.k]=el.value; });
acao("imp-reiniciar",()=>{ const m=imp?.modo; imp=novo(); if(m) imp.modo=m; render(); });
aoMudar("imp-arquivo",async el=>{
  const arq=el.files[0]; el.value=""; if(!arq) return;
  imp.arquivo=arq.name;
  const bytes=new Uint8Array(await arq.arrayBuffer());
  let r; try{ r=await lerArquivo(bytes,arq.name); }catch(e){ r={erro:"formato"}; }
  imp.formato=r.formato; imp.saldoInformado=r.saldoInformado||null; imp.modoSugerido=r.modoSugerido||null; imp.leitura=r;
  if(r.erro){ imp.passo="erro"; imp.erro=r.erro; render(); return; }
  if(r.precisaColunas){ imp.passo="colunas"; render(); return; }
  analisarAgora();
});
function analisarAgora(){
  if(imp.modo==="CARTAO"&&!imp.faturaRef) imp.faturaRef=faturaProvavel(app.L,imp.cartao,imp.leitura.movs);
  imp.analise=analisar(app.L,{modo:imp.modo,conta:imp.conta,cartao:imp.cartao,movs:imp.leitura.movs,faturaRef:imp.faturaRef});
  imp.passo="revisar"; imp.filtro="lancar"; render();
}
import { form } from "../base.js";
form("imp-colunas",(f,d)=>{
  const col=k=>d.get(k)===""?null:+d.get(k);
  const cols={data:col("data"),desc:col("desc"),valor:col("valor"),debito:col("debito"),credito:col("credito"),tipo:null,id:col("id")};
  if(cols.data==null||cols.desc==null){ toast("Escolha as colunas de data e descrição",{erro:true}); return; }
  if(cols.valor==null&&cols.debito==null&&cols.credito==null){ toast("Escolha a coluna de valor, ou as de débito e crédito",{erro:true}); return; }
  imp.leitura=aplicarColunas(imp.leitura,cols); analisarAgora();
});
aoMudar("imp-fatura",el=>{ imp.faturaRef=el.value; analisarAgora(); });
aoMudar("imp-parcelas",el=>{ imp.criarParcelas=el.checked; });
acao("imp-filtro",el=>{ imp.filtro=el.dataset.v; render(); });
aoMudar("imp-linha",el=>{ const l=imp.analise.linhas[+el.dataset.iL]; l[el.dataset.k]=el.value||null;
  if(el.dataset.k==="acao"&&l.acao!=="IGNORAR"&&l.estado==="DUPLICADA"&&l.alvo?.tipo==="EXTRATO") toast("Esta linha já foi importada antes — lançar de novo cria duplicata.",{erro:true});
  render(); });
acao("imp-todas",el=>{ const lancar=el.dataset.v==="1";
  for(const l of imp.analise.linhas){ if(l.estado==="ERRO") continue;
    const visivel=imp.filtro==="todas"||(imp.filtro==="lancar"?l.acao!=="IGNORAR":l.estado===imp.filtro);
    if(lancar&&l.estado==="NOVA"&&!(imp.modo==="CARTAO"&&l.tipo==="PAGAMENTO")) l.acao="CRIAR";
    if(!lancar&&visivel) l.acao="IGNORAR"; }
  render(); });
acao("imp-confirmar",()=>{
  const faltaDestino=imp.analise.linhas.find(l=>l.acao==="TRANSFERIR"&&!l.contaDestino);
  if(faltaDestino){ toast("Escolha a outra conta da transferência: "+faltaDestino.descricao,{erro:true}); return; }
  executar(()=>confirmar(app.L,{arquivo:imp.arquivo,formato:imp.formato,modo:imp.modo,conta:imp.modo==="CONTA"?imp.conta:null,
    cartao:imp.modo==="CARTAO"?imp.cartao:null,faturaRef:imp.faturaRef,linhas:imp.analise.linhas,saldoInformado:imp.saldoInformado,criarParcelas:imp.criarParcelas}),
    {ok:"Importação lançada",depois:m=>{ imp.resultado=m.gravar.find(x=>x.colecao==="importacoes").dados.contagem; imp.passo="fim"; render(); }});
});
acao("imp-desfazer",el=>executar(()=>desfazerImportacao(app.L,el.dataset.id),{ok:"Importação desfeita — nada foi apagado",fechar:false}));
