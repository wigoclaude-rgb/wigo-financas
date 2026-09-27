/* ══════════ AJUSTES ══════════
   Aparência, dados (backup, restaurar, planilha), saúde dos dados,
   relatório da migração e a conta de acesso. */
import { app, tela, acao, aoMudar, render, toast, abrirPainel, executar } from "../base.js";
import { h, raw, juntar } from "../html.js";
import { I, R, aviso, kpi } from "../componentes.js";
import { verificar } from "../../financas/integridade.js";
import { COLECOES } from "../../financas/livro.js";
import { razao } from "../../financas/relatorios.js";
import { baixar } from "./obrigacoes.js";
import { hoje } from "../../nucleo/datas.js";
import { numero } from "../../nucleo/dinheiro.js";
import { Mudanca } from "../../financas/comandos.js";
import { TEMAS, temaEscolhido, escolherTema } from "../tema.js";

export const VERSAO="3.0";
tela("ajustes",{titulo:"Ajustes",render(app){
  const L=app.L, saude=verificar(L), tema=temaEscolhido();
  const n={documentos:L.documentos.size,pagamentos:L.pagamentos.size,lancamentos:L.lancamentos.size,contas:L.contas.size};
  return h`<div class="grade g2">
    <div class="card pad"><h2 class="t2" style="margin-bottom:14px">Aparência</h2>
      <div class="seg larg">${juntar(TEMAS,([k,t])=>h`<button class="${tema===k?"on":""}" data-a="tema" data-v="${k}">${t}</button>`)}</div>
      <div class="fraco peq" style="margin-top:8px">${tema==="auto"?"Escuro das 18h às 6h, claro durante o dia.":tema==="sistema"?"Segue o modo claro ou escuro do celular ou computador.":"Automático: escuro das 18h às 6h, claro durante o dia."}</div></div>
    <div class="card pad"><h2 class="t2" style="margin-bottom:6px">Saúde dos dados</h2>
      <div class="fraco peq" style="margin-bottom:12px">Confere que cada saldo é explicado pelo razão: lançamentos somam zero, dívida do cartão = parcelas em aberto, a pagar de cada parceiro = documentos em aberto, pagamentos batem com o que quitaram.</div>
      ${saude.ok?aviso(h`<b>Tudo consistente.</b> ${n.documentos} documentos, ${n.pagamentos} pagamentos e ${n.lancamentos} lançamentos conferidos.`,{tipo:"bom",icone:"shield"})
        :h`${aviso(h`<b>${saude.problemas.length} inconsistência(s).</b> Nenhuma foi corrigida sozinha — cada uma diz onde olhar.`,{tipo:"ruim",icone:"alert"})}
          <div class="lista card" style="margin-top:10px">${juntar(saude.problemas.slice(0,30),p=>h`<div class="peq">${p.msg}</div>`)}</div>`}</div>
  </div>
  <div class="grade g2" style="margin-top:14px">
    <div class="card pad"><h2 class="t2" style="margin-bottom:6px">Seus dados</h2>
      <div class="fraco peq" style="margin-bottom:14px">O backup tem tudo: documentos, parcelas, pagamentos, razão, extratos e conciliações. Guarde num lugar seguro.</div>
      <div class="btns"><button class="btn sec" data-a="backup">${I("download","p")} Baixar backup (JSON)</button>
        <button class="btn sec" data-a="csv-mov">${I("download","p")} Movimentações (planilha)</button>
        <label class="btn fant">${I("upload","p")} Restaurar backup<input type="file" accept=".json" hidden data-c="restaurar"></label></div>
      <div class="fraco peq" style="margin-top:10px">Restaurar só funciona numa conta vazia: sobrescrever dados vivos com um arquivo apagaria histórico.</div></div>
    <div class="card pad"><h2 class="t2" style="margin-bottom:6px">Versão ${VERSAO}</h2>
      <div class="fraco peq" style="margin-bottom:12px">Motor financeiro por documento, parcela, pagamento e razão em partidas dobradas. Seus dados do 2.2 continuam guardados, sem alteração.</div>
      <div class="btns"><button class="btn sec" data-a="ver-migracao">Relatório da migração</button><button class="btn sec" data-a="novidades">O que mudou</button></div></div>
  </div>
  <div class="card pad" style="margin-top:14px"><h2 class="t2" style="margin-bottom:6px">Conta</h2>
    <div class="fraco" style="margin-bottom:6px">${app.usuario?.email||""}</div>
    ${(()=>{ const pv=(app.usuario?.providerData||[]).map(p=>p.providerId), google=pv.includes("google.com");
      const nomes=[pv.includes("password")?"e-mail e senha":null,google?"Google":null].filter(Boolean);
      return h`<div class="fraco peq" style="margin-bottom:14px">${nomes.length?"Entra com: "+nomes.join(" e "):""}</div>
        <div class="btns">${google?"":h`<button class="btn sec" data-a="conta-google">${I("link","p")} Conectar conta Google</button>`}
        <button class="btn sec" data-a="sair">Sair</button></div>`; })()}</div>`;
}});
acao("tema",el=>{ escolherTema(el.dataset.v); render(); });
acao("backup",()=>{ const dados={app:"WIGO",versao:VERSAO,exportadoEm:new Date().toISOString(),...app.L.exportar()};
  baixar("WIGO_backup_"+hoje()+".json",JSON.stringify(dados,null,1),"application/json"); toast("Backup baixado"); });
acao("csv-mov",()=>{ const L=app.L, linhas=[];
  for(const c of L.contas.values()) for(const x of razao(L,"A:"+c.id).linhas)
    linhas.push([x.data,c.nome,x.numero,String(x.descricao).replace(/;/g,","),L.nomeParceiro(x.parceiro),numero(x.valor),numero(x.saldo),x.conciliado?"sim":"não"].join(";"));
  linhas.sort();
  baixar("WIGO_movimentacoes_"+hoje()+".csv","﻿"+["Data;Conta;Documento;Descrição;Parceiro;Valor;Saldo da conta;Conciliado",...linhas].join("\n"),"text/csv;charset=utf-8"); });
aoMudar("restaurar",async el=>{ const arq=el.files[0]; el.value=""; if(!arq) return;
  try{ const d=JSON.parse(await arq.text()); if(d.app!=="WIGO"||!COLECOES.some(c=>Array.isArray(d[c]))) throw new Error("Este arquivo não é um backup do WIGO 3.");
    await app.repo.restaurar(d); render(); toast("Backup restaurado"); }
  catch(e){ toast(e.message,{erro:true}); } });

app.mostrarMigracao=function(r){
  if(!r){ toast("Esta conta não veio do 2.2."); return; }
  const fmt=c=>R(c);
  abrirPainel({titulo:"Seus dados do WIGO 2.2 foram migrados",sub:new Date(r.em).toLocaleString("pt-BR"),id:"migracao",corpo:h`
    ${r.ok?aviso(h`<b>Tudo conferido.</b> Cada saldo abaixo é o mesmo do 2.2. O JSON antigo continua guardado, sem alteração.`,{tipo:"bom",icone:"shield"})
      :aviso(h`<b>Algum número não bateu.</b> Veja abaixo qual — nada foi ajustado para esconder a diferença.`,{tipo:"ruim"})}
    <div class="kpis" style="margin:14px 0">${juntar([["Contas",r.contagem.contas],["Documentos",r.contagem.documentos],["Pagamentos",r.contagem.pagamentos],["Recorrências",r.contagem.recorrencias]],([t,v])=>kpi({rotulo:t,valor:String(v)}))}</div>
    <div class="bloco"><div class="cap">Conferência 2.2 × 3</div><div class="card lista">${juntar(r.conferencia,x=>h`<div><div class="meio"><div class="t">${x.item}</div>
      <div class="s">2.2: ${fmt(x.antes)} · 3: ${fmt(x.depois)}</div></div>${x.ok?h`<span class="chip bom">igual</span>`:h`<span class="chip ruim">diferente</span>`}</div>`)}</div></div>
    ${r.avisos.length?h`<div class="bloco"><div class="cap">O que mudou de comportamento</div><div class="grade">${juntar(r.avisos,a=>aviso(a,{tipo:"info",icone:"bulb"}))}</div></div>`:""}
    ${r.integridade.length?h`<div class="bloco"><div class="cap">Integridade</div>${juntar(r.integridade,x=>h`<div class="peq down">${x}</div>`)}</div>`:""}`});
};
acao("ver-migracao",async()=>{ try{ app.mostrarMigracao(await app.repo.relatorioMigracao()); }catch(e){ toast(e.message,{erro:true}); } });
acao("novidades",()=>abrirPainel({titulo:"WIGO 3",sub:"O que mudou",estreito:true,id:"novidades",corpo:h`<div class="grade">
  ${juntar([
    ["Documentos de verdade","Cada despesa, receita e compra é um documento numerado (AP-000001, CP-000001) com as suas parcelas. Um clique abre tudo: parcelas, pagamentos, lançamentos e histórico."],
    ["Pagamento parcial","Pagar R$ 100 de uma conta de R$ 300 deixa R$ 200 em aberto. Um pagamento só pode quitar várias contas de uma vez."],
    ["Saldo explicado","Todo saldo vem do razão. Não existe saldo digitado: saldo inicial e ajuste são lançamentos, com data e motivo."],
    ["Cartão sem dupla contagem","A compra vira dívida do cartão; pagar a fatura tira da conta e zera a dívida — sem criar outra despesa."],
    ["Reconciliação","Informe o saldo do banco e o WIGO mostra a diferença e de onde ela vem: o que falta lançar, o que está só no app, o saldo inicial."],
    ["Importação que concilia","O extrato reconhece o que já está no app, quita contas em aberto e paga faturas — e tudo nasce conciliado."],
    ["Nada se apaga","Corrigir é estornar. Cancelado continua no histórico, com o motivo."]
  ],([t,d])=>h`<div class="card pad"><b>${t}</b><div class="fraco peq" style="margin-top:4px">${d}</div></div>`)}</div>`}));
