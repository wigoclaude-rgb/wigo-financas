/* Os 12 casos financeiros obrigatórios da especificação, e o que mais
   sustenta o motor. Rodar: node tests/motor.test.mjs */
import { g, t, lanca, fim } from "./util.mjs";
import { Livro } from "../js/financas/livro.js";
import * as C from "../js/financas/comandos.js";
import { verificar } from "../js/financas/integridade.js";
import { fatura, faturaDaCompra, datasFatura, limiteCartao } from "../js/financas/cartoes.js";
import { definirRelogio } from "../js/nucleo/datas.js";
import { resultado } from "../js/financas/relatorios.js";
import { centavos, dividir } from "../js/nucleo/dinheiro.js";

definirRelogio(()=>new Date(2026,8,27,12));   // hoje = 27/09/2026
const R=v=>centavos(v);
function novoLivro(){ return new Livro(); }
function ex(L,m){ L.aplicar(m); return m; }
/* atalhos de montagem */
function conta(L,nome,saldo=0,data="2026-09-01",tipo="BANCO"){
  const m=ex(L,C.criarConta(L,{nome,tipo},{saldoInicial:R(saldo),dataAbertura:data}));
  return m.gravar.find(x=>x.colecao==="contas").id;
}
function cat(L,nome,natureza="DESPESA"){ return ex(L,C.salvarCategoria(L,{nome,natureza})).gravar.find(x=>x.colecao==="categorias").id; }
function pn(L,nome){ return ex(L,C.salvarParceiro(L,{nome})).gravar.find(x=>x.colecao==="parceiros").id; }
function cartao(L,nome,{limite=5000,fechamento=10,vencimento=17,contaPagamento=null}={}){
  return ex(L,C.salvarCartao(L,{nome,limite:R(limite),fechamento,vencimento,contaPagamento})).gravar.find(x=>x.colecao==="cartoes").id; }
function doc(L,spec){ const m=ex(L,C.criarDocumento(L,spec)); return L.documentos.get(m.gravar.find(x=>x.colecao==="documentos").id); }
const integro=(L,nome)=>t(nome||"integridade",verificar(L).problemas.map(p=>p.msg),[]);

/* ─────────── 1. Saldo inicial ─────────── */
g("Caso 1 — saldo inicial vira evento no razão");
{ const L=novoLivro(); const a=conta(L,"Nubank",1000);
  t("saldo = 1.000", L.saldoConta(a), R(1000));
  const ab=[...L.documentos.values()].find(d=>d.tipo==="ABERTURA");
  t("existe documento de abertura", ab&&ab.numero, "AB-000001");
  t("com lançamento no razão", L.lancamentosDoDocumento(ab.id).length, 1);
  t("antes da abertura o saldo é zero", L.saldoConta(a,"2026-08-31"), 0);
  integro(L); }

/* ─────────── 2. Despesa ─────────── */
g("Caso 2 — despesa paga reduz o saldo");
{ const L=novoLivro(); const a=conta(L,"Nubank",1000); const mer=cat(L,"Mercado");
  const d=doc(L,{tipo:"PAGAR",descricao:"Mercado",valor:R(200),data:"2026-09-10",categoria:mer,
    quitar:{data:"2026-09-10",conta:a,forma:"pix"}});
  t("saldo = 800", L.saldoConta(a), R(800));
  t("documento pago", L.estadoDocumento(d).status, "PAGA");
  t("numeração AP", d.numero, "AP-000001");
  const pg=[...L.pagamentos.values()][0];
  t("pagamento PAY vinculado", [pg.numero, pg.alocacoes[0].documento], ["PAY-000001", d.id]);
  integro(L); }

/* ─────────── 3. Receita ─────────── */
g("Caso 3 — receita recebida aumenta o saldo");
{ const L=novoLivro(); const a=conta(L,"Nubank",1000); const sal=cat(L,"Salário","RECEITA");
  doc(L,{tipo:"RECEBER",descricao:"Salário",valor:R(500),data:"2026-09-05",categoria:sal,
    quitar:{data:"2026-09-05",conta:a,forma:"transferencia"}});
  t("saldo = 1.500", L.saldoConta(a), R(1500));
  t("recebimento numerado REC", [...L.pagamentos.values()][0].numero, "REC-000001");
  integro(L); }

/* ─────────── 4 e 5. Cartão ─────────── */
g("Caso 4 — compra no cartão não mexe no banco");
{ const L=novoLivro(); const a=conta(L,"Nubank",1000); const nu=cartao(L,"Roxinho",{contaPagamento:a});
  const d=doc(L,{tipo:"COMPRA_CARTAO",descricao:"Loja",valor:R(300),data:"2026-09-08",cartao:nu});
  t("banco continua 1.000", L.saldoConta(a), R(1000));
  t("cartão deve 300", L.dividaCartao(nu), R(300));
  t("compra dia 08 com fechamento 10 → fatura que vence em 17/09", d.parcelas[0].fatura, "2026-09");
  integro(L);

g("Caso 5 — pagar a fatura tira do banco e zera o cartão, sem criar despesa nova");
  const despesaAntes=L.saldoChave("E:-");
  ex(L,C.pagarFatura(L,{cartao:nu,ref:"2026-09",valor:R(300),data:"2026-09-17",conta:a}));
  t("banco = 700", L.saldoConta(a), R(700));
  t("cartão = 0", L.dividaCartao(nu), 0);
  t("a despesa não mudou (foi reconhecida na compra)", L.saldoChave("E:-"), despesaAntes);
  t("fatura paga", fatura(L,nu,"2026-09").status, "PAGA");
  integro(L); }

/* ─────────── 6. Parcelamento ─────────── */
g("Caso 6 — parcelamento cria exatamente as parcelas");
{ const L=novoLivro(); conta(L,"Nubank",0); const nu=cartao(L,"Roxinho");
  const d=doc(L,{tipo:"COMPRA_CARTAO",descricao:"Geladeira",valor:R(900),data:"2026-09-11",cartao:nu,parcelas:3});
  t("3 parcelas de 300", d.parcelas.map(p=>p.valor), [R(300),R(300),R(300)]);
  t("numeradas 1/3, 2/3, 3/3", d.parcelas.map(p=>p.n+"/"+p.de), ["1/3","2/3","3/3"]);
  t("compra dia 11 (depois do fechamento 10) → faturas out, nov, dez", d.parcelas.map(p=>p.fatura), ["2026-10","2026-11","2026-12"]);
  t("cartão deve o total, inclusive o futuro", L.dividaCartao(nu), R(900));
  t("R$ 100 em 3x: o centavo vai na primeira", dividir(R(100),3), [3334,3333,3333]);
  integro(L); }

/* ─────────── 7. Pagamento parcial ─────────── */
g("Caso 7 — pagamento parcial deixa o resto em aberto");
{ const L=novoLivro(); const a=conta(L,"Nubank",1000); const joao=pn(L,"João");
  const d=doc(L,{tipo:"PAGAR",descricao:"Serviço",valor:R(300),data:"2026-09-01",parceiro:joao,primeiroVencimento:"2026-10-05"});
  ex(L,C.registrarPagamento(L,{direcao:"SAIDA",data:"2026-09-20",conta:a,forma:"pix",
    alocacoes:[{parcela:d.parcelas[0].id,valor:R(100)}]}));
  const e=L.estadoParcela(d.parcelas[0],d);
  t("pago 100, restante 200", [e.pago,e.restante], [R(100),R(200)]);
  t("status PARCIAL", e.status, "PARCIAL");
  t("banco = 900", L.saldoConta(a), R(900));
  lanca("não aceita pagar mais que o restante",()=>C.registrarPagamento(L,{direcao:"SAIDA",data:"2026-09-21",conta:a,
    alocacoes:[{parcela:d.parcelas[0].id,valor:R(250)}]}),"restam R$ 200,00");
  ex(L,C.registrarPagamento(L,{direcao:"SAIDA",data:"2026-09-25",conta:a,alocacoes:[{parcela:d.parcelas[0].id,valor:R(200)}]}));
  t("dois pagamentos no histórico da parcela", L.estadoParcela(d.parcelas[0],d).alocacoes.length, 2);
  t("agora PAGA", L.estadoParcela(d.parcelas[0],d).status, "PAGA");
  integro(L); }

/* ─────────── 8. Transferência ─────────── */
g("Caso 8 — transferência não cria nem destrói dinheiro");
{ const L=novoLivro(); const a=conta(L,"A",2000); const b=conta(L,"B",0);
  const total=L.saldoTodasContas();
  const m=ex(L,C.criarTransferencia(L,{de:a,para:b,valor:R(500),data:"2026-09-15"}));
  t("A = 1.500", L.saldoConta(a), R(1500));
  t("B = 500", L.saldoConta(b), R(500));
  t("patrimônio igual", L.saldoTodasContas(), total);
  const lanc=m.gravar.filter(x=>x.colecao==="lancamentos");
  t("um único lançamento com as duas pernas", [lanc.length, lanc[0].dados.linhas.length], [1,2]);
  t("não é receita nem despesa", lanc[0].dados.linhas.every(x=>x.k.startsWith("A:")), true);
  lanca("mesma conta nos dois lados",()=>C.criarTransferencia(L,{de:a,para:a,valor:100,data:"2026-09-15"}),"contas diferentes");
  integro(L); }

/* ─────────── 11. Estorno ─────────── */
g("Caso 11 — estorno zera o efeito e preserva o histórico");
{ const L=novoLivro(); const a=conta(L,"Nubank",1000); const mer=cat(L,"Mercado");
  const d=doc(L,{tipo:"PAGAR",descricao:"Compra errada",valor:R(500),data:"2026-09-10",categoria:mer,
    quitar:{data:"2026-09-10",conta:a}});
  t("antes: 500", L.saldoConta(a), R(500));
  const pg=[...L.pagamentos.values()][0];
  ex(L,C.estornarPagamento(L,pg.id,{motivo:"lancei errado"}));
  t("depois do estorno do pagamento: 1.000", L.saldoConta(a), R(1000));
  t("documento volta a dever — e como venceu dia 10, está vencido", L.estadoDocumento(d).status, "VENCIDA");
  ex(L,C.cancelarDocumento(L,d.id,{motivo:"não existiu"}));
  t("cancelado", L.documentos.get(d.id).status, "CANCELADO");
  t("despesa da categoria volta a zero", L.saldoChave("E:"+mer), 0);
  t("nada foi apagado: 2 pagamentos e 4 lançamentos", [L.pagamentos.size, L.lancamentos.size-1], [2,4]);
  lanca("estornar duas vezes",()=>C.estornarPagamento(L,pg.id,{motivo:"de novo"}),"já foi estornado");
  integro(L); }

/* ─────────── 12. Competência × caixa ─────────── */
g("Caso 12 — competência em agosto, pagamento em setembro");
{ const L=novoLivro(); const a=conta(L,"Nubank",1000,"2026-08-01"); const al=cat(L,"Aluguel");
  const d=doc(L,{tipo:"PAGAR",descricao:"Aluguel de agosto",valor:R(800),data:"2026-08-31",competencia:"2026-08",
    categoria:al,primeiroVencimento:"2026-09-05"});
  ex(L,C.registrarPagamento(L,{direcao:"SAIDA",data:"2026-09-05",conta:a,alocacoes:[{parcela:d.parcelas[0].id,valor:R(800)}]}));
  const prov=L.lancamentosDoDocumento(d.id)[0], pag=L.lancamentosDoPagamento([...L.pagamentos.values()][0].id)[0];
  t("despesa por competência: agosto", prov.competencia, "2026-08");
  t("saída de caixa: setembro", pag.data.slice(0,7), "2026-09");
  t("banco em 31/08 ainda 1.000", L.saldoConta(a,"2026-08-31"), R(1000));
  t("banco em 30/09: 200", L.saldoConta(a,"2026-09-30"), R(200));
  integro(L); }

/* ─────────── regras que não podem ser violadas ─────────── */
g("Regras — lançamento desbalanceado não entra");
{ const L=novoLivro(); const m=new C.Mudanca(L);
  lanca("postar com soma diferente de zero",()=>C.postar(m,{data:"2026-09-01",natureza:"AJUSTE",descricao:"x",
    linhas:[{k:"A:x",v:100},{k:"X:ajuste",v:-90}]}),"desbalanceado"); }

g("Regras — documento pago não muda de valor");
{ const L=novoLivro(); const a=conta(L,"Nubank",1000);
  const d=doc(L,{tipo:"PAGAR",descricao:"Conta",valor:R(100),data:"2026-09-10",quitar:{data:"2026-09-10",conta:a}});
  lanca("mudar valor",()=>C.editarDocumento(L,d.id,{valor:R(150)}),"já tem pagamento");
  ex(L,C.editarDocumento(L,d.id,{descricao:"Conta de luz"}));
  t("descrição pode", L.documentos.get(d.id).descricao, "Conta de luz");
  lanca("cancelar sem estornar",()=>C.cancelarDocumento(L,d.id,{motivo:"x"}),"pagamento");
  ex(L,C.cancelarDocumento(L,d.id,{motivo:"duplicado",estornarPagamentos:true}));
  t("estornar e cancelar devolve o dinheiro", L.saldoConta(a), R(1000));
  integro(L); }

g("Regras — editar documento em aberto refaz a provisão sem apagar");
{ const L=novoLivro(); conta(L,"Nubank"); const x=cat(L,"Casa"), y=cat(L,"Lazer");
  const d=doc(L,{tipo:"PAGAR",descricao:"Sofá",valor:R(1200),data:"2026-09-10",categoria:x,parcelas:3});
  ex(L,C.editarDocumento(L,d.id,{valor:R(1500),categoria:y,parcelas:5}));
  const nd=L.documentos.get(d.id);
  t("5 parcelas de 300", nd.parcelas.map(p=>p.valor), Array(5).fill(R(300)));
  t("categoria antiga zerada", L.saldoChave("E:"+x), 0);
  t("categoria nova com 1.500", L.saldoChave("E:"+y), R(1500));
  t("provisão original + estorno + nova", L.lancamentosDoDocumento(d.id).map(l=>l.natureza), ["DOCUMENTO","ESTORNO","DOCUMENTO"]);
  integro(L); }

g("Regras — trocar parceiro de documento já pago mantém o a pagar de cada um");
{ const L=novoLivro(); const a=conta(L,"Nubank",1000); const p1=pn(L,"Ana"), p2=pn(L,"Beto");
  const d=doc(L,{tipo:"PAGAR",descricao:"Serviço",valor:R(300),data:"2026-09-10",parceiro:p1});
  ex(L,C.registrarPagamento(L,{direcao:"SAIDA",data:"2026-09-11",conta:a,alocacoes:[{parcela:d.parcelas[0].id,valor:R(100)}]}));
  ex(L,C.editarDocumento(L,d.id,{parceiro:p2}));
  t("Ana não deve nada", -L.saldoChave("P:"+p1), 0);
  t("Beto: resta 200", -L.saldoChave("P:"+p2), R(200));
  integro(L); }

g("Pagamento — várias parcelas de vários documentos num Pix só, com juros e desconto");
{ const L=novoLivro(); const a=conta(L,"Nubank",5000); const f=pn(L,"Fornecedor");
  const d1=doc(L,{tipo:"PAGAR",descricao:"A",valor:R(300),data:"2026-09-01",parceiro:f});
  const d2=doc(L,{tipo:"PAGAR",descricao:"B",valor:R(400),data:"2026-09-01",parceiro:f,parcelas:2});
  ex(L,C.registrarPagamento(L,{direcao:"SAIDA",data:"2026-09-20",conta:a,parceiro:f,alocacoes:[
    {parcela:d1.parcelas[0].id,valor:R(300),juros:R(10)},
    {parcela:d2.parcelas[0].id,valor:R(200),desconto:R(20)},
    {parcela:d2.parcelas[1].id,valor:R(200)}]}));
  const pg=[...L.pagamentos.values()][0];
  t("dinheiro = 300+10 + 200−20 + 200 = 690", pg.valor, R(690));
  t("banco = 4.310", L.saldoConta(a), R(4310));
  t("tudo pago", [L.estadoDocumento(d1).status, L.estadoDocumento(d2).status], ["PAGA","PAGA"]);
  t("juros viram despesa", L.saldoChave("E:#juros"), R(10));
  t("desconto vira receita", -L.saldoChave("I:#desconto"), R(20));
  integro(L); }

g("Cartão — fatura parcial, estorno de compra e limite");
{ const L=novoLivro(); const a=conta(L,"Nubank",3000); const nu=cartao(L,"Roxinho",{limite:5000,contaPagamento:a});
  doc(L,{tipo:"COMPRA_CARTAO",descricao:"Mercado",valor:R(1000),data:"2026-09-02",cartao:nu});
  doc(L,{tipo:"COMPRA_CARTAO",descricao:"Farmácia",valor:R(500),data:"2026-09-03",cartao:nu});
  t("limite: 5.000, usado 1.500, disponível 3.500", Object.values(limiteCartao(L,nu)).slice(0,3), [R(5000),R(1500),R(3500)]);
  doc(L,{tipo:"ESTORNO_CARTAO",descricao:"Devolução farmácia",valor:R(100),data:"2026-09-05",cartao:nu});
  const f=fatura(L,nu,"2026-09");
  t("fatura líquida 1.400", f.restante, R(1400));
  ex(L,C.pagarFatura(L,{cartao:nu,ref:"2026-09",valor:R(500),data:"2026-09-17",conta:a}));
  const f2=fatura(L,nu,"2026-09");
  t("pagou 500: resta 900; venceu dia 17, então VENCIDA e parcial", [f2.restante,f2.status,f2.parcial], [R(900),"VENCIDA",true]);
  t("banco = 2.500", L.saldoConta(a), R(2500));
  t("limite disponível = 5.000 − 900", limiteCartao(L,nu).disponivel, R(4100));
  lanca("pagar mais do que falta",()=>C.pagarFatura(L,{cartao:nu,ref:"2026-09",valor:R(1000),data:"2026-09-18",conta:a}),"passa do que falta");
  ex(L,C.pagarFatura(L,{cartao:nu,ref:"2026-09",valor:R(900),data:"2026-09-18",conta:a}));
  t("fatura paga", fatura(L,nu,"2026-09").status, "PAGA");
  t("cartão zerado", L.dividaCartao(nu), 0);
  integro(L); }

g("Cartão — regra de fechamento e vencimento");
{ const c={fechamento:10,vencimento:17};
  t("compra dia 08 → fatura do mês", faturaDaCompra(c,"2026-09-08"), "2026-09");
  t("compra no dia do fechamento → fatura do mês (regra do 2.2)", faturaDaCompra(c,"2026-09-10"), "2026-09");
  t("compra dia 11 → próxima", faturaDaCompra(c,"2026-09-11"), "2026-10");
  const c2={fechamento:28,vencimento:5};
  t("fecha 28 vence 5: compra 20/09 vence em outubro", faturaDaCompra(c2,"2026-09-20"), "2026-10");
  t("datas da fatura de outubro", datasFatura(c2,"2026-10"), {fechamento:"2026-09-28",vencimento:"2026-10-05"});
  t("fechamento 31 em fevereiro", datasFatura({fechamento:31,vencimento:10},"2027-03"), {fechamento:"2027-02-28",vencimento:"2027-03-10"}); }

g("Saldo inicial e ajuste — nunca substituem, sempre acrescentam");
{ const L=novoLivro(); const a=conta(L,"Nubank",1000);
  ex(L,C.corrigirSaldoInicial(L,a,{valor:R(1200),data:"2026-09-01",motivo:"conferi no app do banco"}));
  t("saldo corrigido", L.saldoConta(a), R(1200));
  t("o antigo ficou cancelado, não apagado", [...L.documentos.values()].filter(d=>d.tipo==="ABERTURA").map(d=>d.status), ["CANCELADO","EFETIVADO"]);
  lanca("ajuste sem motivo",()=>C.ajustarSaldo(L,{conta:a,valor:R(50),data:"2026-09-20",motivo:""}),"motivo");
  ex(L,C.ajustarSaldo(L,{conta:a,valor:R(-50),data:"2026-09-20",motivo:"tarifa não lançada"}));
  t("ajuste entra como evento", L.saldoConta(a), R(1150));
  lanca("arquivar conta com saldo",()=>C.arquivar(L,"contas",a),"ainda tem");
  integro(L); }

g("Transferência planejada só mexe no saldo quando é feita");
{ const L=novoLivro(); const a=conta(L,"Conta",1000); const r=conta(L,"Reserva",0,"2026-09-01","RESERVA");
  const m=ex(L,C.criarTransferencia(L,{de:a,para:r,valor:R(200),data:"2026-10-05",planejada:true}));
  const id=m.gravar.find(x=>x.colecao==="documentos").id;
  t("planejada: nada moveu", [L.saldoConta(a),L.saldoConta(r)], [R(1000),0]);
  ex(L,C.efetivarTransferencia(L,id,{data:"2026-09-26"}));
  t("feita: moveu", [L.saldoConta(a),L.saldoConta(r)], [R(800),R(200)]);
  t("disponível exclui reserva", L.saldoDisponivel(), R(800));
  integro(L); }

g("Atomicidade — Mudanca não toca no livro até ser aplicada, e desfaz inteira");
{ const L=novoLivro(); const a=conta(L,"Nubank",1000);
  const m=C.criarDocumento(L,{tipo:"PAGAR",descricao:"X",valor:R(100),data:"2026-09-10",quitar:{data:"2026-09-10",conta:a}});
  t("antes de aplicar, saldo intacto", L.saldoConta(a), R(1000));
  const antes=L.aplicar(m);
  t("aplicada", L.saldoConta(a), R(900));
  L.desfazer(antes);
  t("desfeita (gravação recusada): tudo volta", [L.saldoConta(a), L.documentos.size, L.pagamentos.size], [R(1000),1,0]);
  integro(L); }

g("Conciliação — marca sem alterar valor");
{ const L=novoLivro(); const a=conta(L,"Nubank",1000);
  const d=doc(L,{tipo:"RECEBER",descricao:"Pix João",valor:R(500),data:"2026-09-26",quitar:{data:"2026-09-26",conta:a}});
  const l=L.lancamentosDoPagamento([...L.pagamentos.values()][0].id)[0];
  const i=l.linhas.findIndex(x=>x.k==="A:"+a);
  ex(L,C.conciliar(L,[{lancamento:l.id,linha:i}]));
  const l2=L.lancamentos.get(l.id);
  t("linha conciliada", !!l2.linhas[i].conc, true);
  t("valor intacto", l2.linhas[i].v, R(500));
  t("documento aparece como conciliado", L.documentoConciliado(d), true);
  integro(L); }


/* ─────────── subcategorias ─────────── */
g("Subcategorias: dois níveis, mesmo tipo, e o relatório soma na categoria");
{ const L=novoLivro(); const a=conta(L,"Nubank",1000);
  const alim=cat(L,"Alimentação");
  const merc=ex(L,C.salvarCategoria(L,{nome:"Mercado",natureza:"DESPESA",pai:alim})).gravar.find(x=>x.colecao==="categorias").id;
  t("nome completo", L.nomeCategoria(merc), "Alimentação › Mercado");
  t("mãe", L.grupoCategoria(merc), alim);
  const tenta=f=>{ try{ f(); return "aceito"; }catch(e){ return e.message; } };
  t("sub dentro de sub é recusado", /já é uma subcategoria/.test(tenta(()=>C.salvarCategoria(L,{nome:"Feira",natureza:"DESPESA",pai:merc}))), true);
  t("receita dentro de despesa é recusado", /mesmo tipo/.test(tenta(()=>C.salvarCategoria(L,{nome:"X",natureza:"RECEITA",pai:alim}))), true);
  t("mãe com filhas não vira filha", /tem subcategorias/.test(tenta(()=>C.salvarCategoria(L,{id:alim,nome:"Alimentação",natureza:"DESPESA",pai:cat(L,"Casa")}))), true);
  t("nome repetido na mesma mãe é recusado", /Já existe a subcategoria Mercado em Alimentação/.test(tenta(()=>C.salvarCategoria(L,{nome:"mercado",natureza:"DESPESA",pai:alim}))), true);
  t("o mesmo nome em outra mãe pode", tenta(()=>C.salvarCategoria(L,{nome:"Mercado",natureza:"DESPESA"})), "aceito");
  doc(L,{tipo:"PAGAR",descricao:"Compra do mês",valor:R(100),data:"2026-09-10",categoria:merc,quitar:{data:"2026-09-10",conta:a}});
  doc(L,{tipo:"PAGAR",descricao:"Lanche",valor:R(50),data:"2026-09-11",categoria:alim,quitar:{data:"2026-09-11",conta:a}});
  const r=resultado(L,{de:"2026-09-01",ate:"2026-09-30"});
  const g0=r.grupos.find(x=>x.id===alim);
  t("a categoria soma as subcategorias", g0.total, R(150));
  t("detalhe: Mercado e o que foi lançado direto na mãe", g0.subs.map(s=>[s.nome,s.total]), [["Mercado",R(100)],["Geral",R(50)]]);
  ex(L,C.arquivar(L,"categorias",alim,false));
  t("arquivar a mãe tira as filhas dos formulários", L.categoriasAtivas("DESPESA").some(c=>c.id===merc), false);
  integro(L); }

g("Categorias sugeridas: em dois níveis, sem duplicar o que já existe");
{ const L=novoLivro();
  cat(L,"Mercado");   /* solta, como veio do 2.2 */
  const m=ex(L,C.adicionarCategoriasSugeridas(L));
  const alim=[...L.categorias.values()].find(c=>c.nome==="Alimentação"&&!c.pai);
  t("criou as mães e as filhas", L.subcategorias(alim.id).map(c=>c.nome), ["Padaria/Lanches","Restaurantes/Delivery"]);
  t("não duplicou o Mercado que já existia", [...L.categorias.values()].filter(c=>c.nome==="Mercado").length, 1);
  t("de novo: nada a acrescentar", C.adicionarCategoriasSugeridas(L).vazia, true);
  t("contou o que criou", m.criadas>30, true); }

fim();
