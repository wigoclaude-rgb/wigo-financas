/* De ponta a ponta, no Chromium, clicando no app de verdade com o Firebase
   simulado. Rodar: node tests/e2e.test.mjs */
import { g, t, fim } from "./util.mjs";
import { iniciar, encerrar, abrir } from "./navegador.mjs";
import { legadoDemo } from "./fixtures.mjs";
import { writeFileSync } from "node:fs";

const HOJE="2026-09-27T12:00:00-03:00";
await iniciar();
const num=s=>Number(String(s).replace(/[^\d,-]/g,"").replace(",","."));
async function saldoConta(p,nome){ return p.evaluate(n=>{ const L=window.__app.L; const c=[...L.contas.values()].find(x=>x.nome===n); return L.saldoConta(c.id); },nome); }
/* limpa o aviso anterior antes de agir — senão lê o toast da ação passada */
async function enviar(p,sel){ await p.evaluate(()=>{ const t=document.getElementById("toast"); t.classList.remove("on"); t.textContent=""; });
  await p.click(sel); await p.waitForSelector("#toast.on",{timeout:6000}); const t=await p.textContent("#toast"); await p.waitForTimeout(200); return t; }
async function ir(p,rota){ await p.evaluate(h=>{ location.hash=h; },"#/"+rota); await p.waitForTimeout(350); }
const integridade=p=>p.evaluate(()=>window.__verificar().problemas.map(x=>x.msg));

/* ─────────── 1. migração do 2.2 no navegador ─────────── */
g("migração: abre com os dados do 2.2 convertidos e conferidos");
let {p,erros,ctx}=await abrir({legado:legadoDemo("2026-09-27"),hoje:HOJE});
await p.waitForSelector("#painel.on",{timeout:15000});
t("relatório da migração aparece", /foram migrados/.test(await p.textContent("#painel")), true);
t("tudo conferido", /Tudo conferido/.test(await p.textContent("#painel")), true);
t("nenhum item diferente", await p.locator("#painel .chip.ruim").count(), 0);
await p.click('#painel [data-a="painel-fechar"]');
const paths=await p.evaluate(()=>[...window.__fs.keys()]);
t("gravou em subcoleções, não num JSON", ["contas","documentos","pagamentos","lancamentos","parceiros","categorias","cartoes","meta"]
  .every(c=>paths.some(x=>x.startsWith("users/u1/"+c+"/"))), true);
t("o JSON do 2.2 continua lá, intacto", await p.evaluate(()=>!!window.__fs.get("users/u1").data), true);
t("marca de migração concluída", await p.evaluate(()=>window.__fs.get("users/u1/meta/migracao").status), "CONCLUIDA");
t("integridade no navegador", await integridade(p), []);

/* ─────────── 2. despesa à vista paga ─────────── */
g("despesa à vista paga: sai da conta, vira documento + pagamento + razão");
const antesNu=await saldoConta(p,"Nubank");
await p.click('.conteudo [data-a="doc-novo"][data-v="PAGAR"]');
await p.waitForSelector("#fNovo");
await p.fill('#fNovo [name="descricao"]',"Padaria Pão Quente");
await p.fill('#fNovo [name="valor"]',"37,50");
await p.fill('#fNovo [name="parceiro"]',"Pão Quente");
t("aviso", await enviar(p,'#fNovo button[type="submit"]'), "Despesa registrada");
t("Nubank −37,50", await saldoConta(p,"Nubank"), antesNu-3750);
const docPad=await p.evaluate(()=>{ const L=window.__app.L; const d=[...L.documentos.values()].find(x=>x.descricao==="Padaria Pão Quente");
  return {num:d.numero,st:L.estadoDocumento(d).status,pn:L.nomeParceiro(d.parceiro),pags:L.pagamentosDoDocumento(d).length}; });
t("documento AP pago, com parceiro novo criado", [docPad.num.startsWith("AP-"),docPad.st,docPad.pn,docPad.pags], [true,"PAGA","Pão Quente",1]);
t("gravado no Firestore num lote só (doc+pagamento+lançamentos+auditoria+contador)", await p.evaluate(()=>{
  const cols=new Set(window.__ultimoLote.map(x=>x.split("/")[2])); return ["documentos","pagamentos","lancamentos","auditoria","meta"].every(c=>cols.has(c)); }), true);

/* ─────────── 3. parcelada em aberto + pagamento parcial ─────────── */
g("despesa 3x em aberto e pagamento parcial pela tela de pagamento");
await p.click('.conteudo [data-a="doc-novo"][data-v="PAGAR"]');
await p.waitForSelector("#fNovo");
await p.fill('#fNovo [name="descricao"]',"Dentista");
await p.fill('#fNovo [name="valor"]',"900");
await p.selectOption('#fNovo [name="parcelas"]',"3");
await p.uncheck('#fNovo [name="jaPago"]');
await p.fill('#fNovo [name="vencimento"]',"2026-10-05");
t("conta a pagar criada", await enviar(p,'#fNovo button[type="submit"]'), "Conta a pagar criada");
const dent=await p.evaluate(()=>{ const L=window.__app.L; const d=[...L.documentos.values()].find(x=>x.descricao==="Dentista"); return {id:d.id,parc:d.parcelas.map(x=>x.valor+"@"+x.vencimento)}; });
t("3 parcelas de 300 em out, nov, dez", dent.parc, ["30000@2026-10-05","30000@2026-11-05","30000@2026-12-05"]);
await ir(p,"pagar");
await p.selectOption('[data-c="periodo"]',"tudo"); await p.waitForTimeout(250);
await p.fill('[data-i="obr-q"]',"Dentista"); await p.waitForTimeout(300);
t("aparecem as 3 parcelas", await p.locator('[data-parte="obr"] tbody tr').count(), 3);
await p.locator('[data-parte="obr"] tbody tr').first().locator('[data-a="obr-pick"]').click();
t("barra de seleção", /1 selecionada/.test(await p.textContent("#barraSel")), true);
await p.click('#barraSel [data-a="obr-pagar"]');
await p.waitForSelector("#fPag");
const idSel=await p.getAttribute('#fPag [data-a="pf-pick"].on',"data-id");
t("veio marcada a parcela 1/3 do Dentista", idSel, dent.id+".1");
const campo=p.locator(`#fPag [data-i="pf-valor"][data-id="${idSel}"]`);
await campo.fill("100,00"); await p.waitForTimeout(700);
t("avisa que é parcial", /pagamento parcial/.test(await p.textContent("#fPag")), true);
t("pagamento registrado", await enviar(p,'#fPag button[type="submit"]'), "Pagamento registrado");
const parc=await p.evaluate(id=>{ const L=window.__app.L, d=L.documentos.get(id), e=L.estadoParcela(d.parcelas[0],d); return [e.pago,e.restante,e.status]; },dent.id);
t("parcela 1: pago 100, resta 200, PARCIAL", parc, [10000,20000,"PARCIAL"]);

/* ─────────── 4. tela do documento ─────────── */
g("documento: resumo, parcelas, pagamentos, lançamentos e histórico");
await p.evaluate(id=>window.__app.abrirDocumento(id),dent.id);
await p.waitForSelector('#painel.on'); await p.waitForTimeout(400);
const txt=await p.textContent("#painel");
t("mostra as quatro seções", ["Parcelas","Pagamentos","Lançamentos no razão","Histórico"].every(s=>txt.includes(s)), true);
t("oferece registrar pagamento, e cancelar vira 'estornar e cancelar'", [await p.locator('#painel [data-a="pag-doc"]').count(), /Estornar e cancelar/.test(txt)], [1,true]);
await p.waitForFunction(()=>!document.querySelector("#historicoDoc .sk"),{timeout:4000});
t("histórico de auditoria carregado", /Dentista/.test(await p.textContent("#historicoDoc")), true);
await p.click('#painel [data-a="doc-editar"]'); await p.waitForTimeout(200);
t("editar: valor travado porque já tem pagamento", await p.locator('#painel [name="valor"][disabled]').count(), 1);
await p.click('#painel [data-a="painel-fechar"]');

/* ─────────── 5. estorno ─────────── */
g("estorno do pagamento devolve o dinheiro e preserva o histórico");
const antesEst=await saldoConta(p,"Nubank");
const pgId=await p.evaluate(id=>{ const L=window.__app.L; return L.pagamentosDoDocumento(L.documentos.get(id))[0].id; },dent.id);
await p.evaluate(id=>window.__app.abrirPagamento(id),pgId);
await p.click('#painel [data-a="pag-estornar"]');
await p.fill('#painel [name="motivo"]',"paguei no cartão, não no Pix");
t("estornado", await enviar(p,'#painel button[type="submit"]'), "Pagamento estornado");
t("dinheiro volta", await saldoConta(p,"Nubank"), antesEst+10000);
t("original + estorno no histórico", await p.evaluate(id=>{ const L=window.__app.L; return L.pagamentosDoDocumento(L.documentos.get(id)).map(x=>x.valor); },dent.id), [10000,-10000]);

/* ─────────── 6. cartão ─────────── */
g("compra no cartão 3x não mexe no banco; pagar a fatura sim");
await ir(p,"visao");
const antesCart=await saldoConta(p,"Nubank");
const dividaAntes=await p.evaluate(()=>{ const L=window.__app.L; return L.dividaCartao([...L.cartoes.values()][0].id); });
await p.click('.conteudo [data-a="doc-novo"][data-v="COMPRA_CARTAO"]');
await p.waitForSelector("#fNovo");
await p.fill('#fNovo [name="descricao"]',"Tênis");
await p.fill('#fNovo [name="valor"]',"600");
await p.selectOption('#fNovo [name="parcelas"]',"3");
await p.waitForTimeout(150);
t("prévia diz a fatura", /Entra na fatura de outubro de 2026/.test(await p.textContent("#novoPrevia")), true);
t("compra registrada", await enviar(p,'#fNovo button[type="submit"]'), "Compra registrada na fatura");
t("banco igual", await saldoConta(p,"Nubank"), antesCart);
t("cartão deve +600", await p.evaluate(()=>{ const L=window.__app.L; return L.dividaCartao([...L.cartoes.values()][0].id); }), dividaAntes+60000);
const cid=await p.evaluate(()=>[...window.__app.L.cartoes.values()][0].id);
await ir(p,"faturas/"+cid+"/2026-09");
t("fatura de setembro vencida", /Vencida/.test(await p.textContent("#conteudo")), true);
const falta=await p.evaluate(c=>window.__faturas.fatura(window.__app.L,c,"2026-09").restante,cid);
await p.click('[data-a="fatura-pagar"]');
t("fatura paga", await enviar(p,'#painel button[type="submit"]'), "Fatura paga");
t("saiu do banco o que faltava", await saldoConta(p,"Nubank"), antesCart-falta);
t("fatura PAGA", await p.evaluate(c=>window.__faturas.fatura(window.__app.L,c,"2026-09").status,cid), "PAGA");
t("integridade", await integridade(p), []);

/* ─────────── 7. transferência ─────────── */
g("transferência entre contas: total igual");
await ir(p,"visao");
const totAntes=await p.evaluate(()=>window.__app.L.saldoTodasContas());
await p.click('.conteudo [data-a="trf-nova"]');
await p.waitForSelector('#painel form[data-f="nova-trf"]');
await p.fill('#painel [name="valor"]',"250");
t("transferido", await enviar(p,'#painel button[type="submit"]'), "Transferido");
t("total não muda", await p.evaluate(()=>window.__app.L.saldoTodasContas()), totAntes);

/* ─────────── 8. servidor recusa: nada fica aplicado ─────────── */
g("servidor recusa a gravação: nenhuma alteração fica");
const antesFalha=await p.evaluate(()=>({s:window.__app.L.saldoTodasContas(),d:window.__app.L.documentos.size}));
await p.evaluate(()=>{ window.__falharGravacao=1; });
await p.click('.conteudo [data-a="doc-novo"][data-v="PAGAR"]');
await p.waitForSelector("#fNovo");
await p.fill('#fNovo [name="descricao"]',"Não deve ficar");
await p.fill('#fNovo [name="valor"]',"999");
t("mensagem honesta", /Nenhuma alteração foi aplicada/.test(await enviar(p,'#fNovo button[type="submit"]')), true);
t("memória desfeita", await p.evaluate(()=>({s:window.__app.L.saldoTodasContas(),d:window.__app.L.documentos.size})), antesFalha);
t("nada no servidor", await p.evaluate(()=>[...window.__fs.values()].some(v=>v&&v.descricao==="Não deve ficar")), false);
await p.click('#painel [data-a="painel-fechar"]').catch(()=>{});

/* ─────────── 9. importação duas vezes ─────────── */
g("importar o mesmo extrato duas vezes não duplica");
const csv=`Data,Valor,Identificador,Descrição
20/09/2026,-45.90,x1,Compra no débito - IFOOD
21/09/2026,-120.00,x2,Pix enviado - MERCADO BOM - 111.222.333-44 - Agência 1 Conta: 9
22/09/2026,1500.00,x3,Pix recebido - MAXI TEQ LTDA - 12.345.678/0001-00 - Agência 1 Conta: 2`;
writeFileSync("/tmp/wigo-extrato.csv",csv);
await ir(p,"importacao");
await p.setInputFiles('[data-c="imp-arquivo"]',"/tmp/wigo-extrato.csv"); await p.waitForTimeout(700);
t("revisão mostra 3 para lançar", /Lançar 3/.test(await p.textContent("#barraSel")), true);
t("lançada", await enviar(p,'#barraSel [data-a="imp-confirmar"]'), "Importação lançada");
const docsDepois=await p.evaluate(()=>window.__app.L.documentos.size);
await p.click('[data-a="imp-reiniciar"]'); await p.waitForTimeout(200);
await p.setInputFiles('[data-c="imp-arquivo"]',"/tmp/wigo-extrato.csv"); await p.waitForTimeout(700);
t("segunda vez: nada para lançar", /Lançar 0/.test(await p.textContent("#barraSel")), true);
t("três já importadas", /Já importadas\s*3/.test((await p.textContent("#conteudo")).replace(/\s+/g," ")), true);
t("nenhum documento novo", await p.evaluate(()=>window.__app.L.documentos.size), docsDepois);

/* ─────────── 10. reconciliação ─────────── */
g("reconciliação compara com o saldo do banco e explica");
await ir(p,"reconciliacao");
const nu=await p.evaluate(()=>[...window.__app.L.contas.values()].find(c=>c.nome==="Nubank").id);
await p.selectOption('[data-c="rc-f"][data-k="conta"]',nu); await p.waitForTimeout(250);
const saldoNu=await saldoConta(p,"Nubank");
await p.fill('[data-c="rc-f"][data-k="bancoFim"]',String((saldoNu+20000)/100).replace(".",","));
await p.press('[data-c="rc-f"][data-k="bancoFim"]',"Tab"); await p.waitForTimeout(300);
t("mostra a diferença de 200", /Diferença de R\$\s*200,00/.test(await p.textContent("#conteudo")), true);
t("as linhas importadas já vêm conciliadas", /conciliado\(s\) no período/.test(await p.textContent("#conteudo")), true);
const nConf=await p.locator('[data-a="rc-manual"]').count();
await p.locator('[data-a="rc-manual"]').first().click(); await p.waitForTimeout(300);
t("conferido à mão sai da lista", await p.locator('[data-a="rc-manual"]').count(), nConf-1);

/* ─────────── 11. busca global ─────────── */
g("busca global acha por número e abre o documento");
await p.keyboard.press("Control+k"); await p.waitForTimeout(150);
await p.fill("#buscaIn",docPad.num); await p.waitForTimeout(200);
await p.keyboard.press("Enter"); await p.waitForTimeout(400);
t("abriu o documento", (await p.textContent("#painel")).includes(docPad.num), true);
await p.click('#painel [data-a="painel-fechar"]');

/* ─────────── 12. recarregar: sincronização incremental ─────────── */
g("recarregar: dados voltam do cache e o servidor só manda o que mudou");
await ir(p,"visao");
const antesRec=await p.evaluate(()=>({s:window.__app.L.saldoTodasContas(),d:window.__app.L.documentos.size}));
await p.reload(); await p.waitForSelector("#conteudo .hero",{timeout:15000}); await p.waitForTimeout(500);
t("mesmos dados depois de recarregar", await p.evaluate(()=>({s:window.__app.L.saldoTodasContas(),d:window.__app.L.documentos.size})), antesRec);
t("não migrou de novo", await p.locator("#painel.on").count(), 0);
const {nDocs,novos,lidas}=await p.evaluate(()=>{ const docs=[...window.__fs.entries()].filter(([k])=>k.split("/").length===4&&!k.includes("/auditoria/"));
  const mig=window.__fs.get("users/u1/meta/migracao")._ts.__tsms;
  return {nDocs:docs.length,novos:docs.filter(([,v])=>v._ts&&v._ts.__tsms>mig).length,lidas:window.__leituras}; });
t(`1ª recarga lê só o que foi gravado depois da migração (${lidas} de ${nDocs})`, lidas, novos);
await p.reload(); await p.waitForSelector("#conteudo .hero",{timeout:15000}); await p.waitForTimeout(400);
t("2ª recarga, sem mudanças: zero leituras cobradas", await p.evaluate(()=>window.__leituras), 0);
t("integridade", await integridade(p), []);
t("sem erro de JS (fora a recusa provocada no passo 8)", erros.filter(e=>!/Nenhuma alteração foi aplicada/.test(e)), []);
await ctx.close();

/* ─────────── 13. conta nova e celular ─────────── */
g("conta nova, no celular: primeiro uso guia e o dock funciona");
({p,erros,ctx}=await abrir({largura:390,altura:844,hoje:HOJE,usuario:{uid:"u9",email:"novo@exemplo.com"}}));
await p.waitForSelector("#conteudo .hero",{timeout:15000});
t("primeiro uso oferece cadastrar conta", await p.locator('#conteudo [data-a="conta-nova"]').count()>0, true);
t("dock visível e sidebar escondida", [await p.locator(".dock").isVisible(),await p.locator(".lado").isVisible()], [true,false]);
await p.click('#conteudo [data-a="conta-nova"]'); await p.waitForSelector('#painel form[data-f="conta"]');
await p.fill('#painel [name="nome"]',"Caixa");
await p.fill('#painel [name="saldo"]',"1.000,00");
t("conta criada", await enviar(p,'#painel button[type="submit"]'), "Conta criada");
t("saldo inicial como evento", await p.evaluate(()=>{ const L=window.__app.L; return [...L.documentos.values()].map(d=>d.tipo+":"+d.valor); }), ["ABERTURA:100000"]);
await p.click('.dock .mais-btn'); await p.waitForSelector("#painel.on");
await p.click('#painel [data-a="doc-novo"][data-v="PAGAR"]'); await p.waitForSelector("#fNovo");
t("com uma conta só, não pergunta a conta", await p.locator('#fNovo select[name="conta"]').count(), 0);
await p.fill('#fNovo [name="descricao"]',"Café"); await p.fill('#fNovo [name="valor"]',"8");
await enviar(p,'#fNovo button[type="submit"]');
t("foi para a única conta", await saldoConta(p,"Caixa"), 99200);
t("sem erro de JS", erros, []);
await ctx.close();

/* ─────────── 14. celular: nenhuma tela vaza para o lado ─────────── */
g("celular: nenhuma tela passa da largura (sem rolagem lateral)");
({p,erros,ctx}=await abrir({largura:390,altura:844,legado:legadoDemo("2026-09-27"),hoje:HOJE}));
await p.waitForSelector("#painel.on",{timeout:15000}); await p.click('#painel [data-a="painel-fechar"]'); await p.waitForTimeout(350);
t("painel fechado sai do Tab (visibility hidden)", await p.evaluate(()=>getComputedStyle(document.getElementById("painel")).visibility), "hidden");
const vazam=[];
for(const r of ["visao","movimentos","pagar","receber","faturas","pagamentos","recebimentos","transferencias","reconciliacao","parceiros","contas",
  "cartoes","categorias","relatorios","relatorios/razao","relatorios/fluxo","relatorios/resultado","relatorios/avancados","relatorios/cartoes",
  "relatorios/obrigacoes","relatorios/conciliacao","relatorios/saldos","relatorios/parceiros","importacao","ajustes"]){
  await ir(p,r);
  if(await p.evaluate(()=>document.documentElement.scrollWidth>document.documentElement.clientWidth)) vazam.push(r);
}
t("todas as telas cabem em 390px", vazam, []);
t("filtros recolhidos atrás de um botão", await ir(p,"pagar").then(()=>p.locator(".filtros-bt").isVisible()), true);
await p.click(".filtros-bt");
t("abrir os filtros mostra os campos", await p.locator('.filtros [data-k="pn"]').isVisible(), true);
t("sem erro de JS", erros, []);
await ctx.close();

await encerrar();
fim();
