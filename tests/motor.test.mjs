/* Os 12 casos financeiros obrigatórios da especificação, e o que mais
   sustenta o motor. Rodar: node tests/motor.test.mjs */
import { g, t, lanca, fim } from "./util.mjs";
import { Livro } from "../js/financas/livro.js";
import * as C from "../js/financas/comandos.js";
import { verificar } from "../js/financas/integridade.js";
import { fatura, faturaDaCompra, datasFatura, limiteCartao, divisaoDaFatura } from "../js/financas/cartoes.js";
import { definirRelogio } from "../js/nucleo/datas.js";
import { resultado, resultadoCaixa, fluxoDeCaixa, resumoDoMes, saldoPrevistoDoMes, compromissos } from "../js/financas/relatorios.js";
import * as Inv from "../js/financas/investimentos.js";
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


/* ─────────── Compra de outra pessoa ─────────── */
const tenta=f=>{ try{ f(); return "aceito"; }catch(e){ return e.message; } };
function cenarioTerceiro(){
  const L=novoLivro(); const a=conta(L,"Nubank",1000); const nu=cartao(L,"Roxinho",{contaPagamento:a});
  const comb=cat(L,"Combustível"), mer=cat(L,"Mercado"); const joao=pn(L,"João"), pedro=pn(L,"Pedro");
  return {L,a,nu,comb,mer,joao,pedro};
}
g("Terceiro — compra no cartão para o João: fatura igual, conta a receber vinculada, não é despesa minha");
{ const {L,a,nu,comb,joao}=cenarioTerceiro();
  const d=doc(L,{tipo:"COMPRA_CARTAO",descricao:"Gasolina",valor:R(600),data:"2026-09-15",cartao:nu,categoria:comb,parcelas:3,
    terceiro:{pessoa:joao,modo:"PARCELAS"}});
  const r=L.documentos.get(d.terceiro.receber);
  t("vínculo nos dois sentidos", [r.tipo,r.reembolsoDe,r.parceiro,d.terceiro.pessoa], ["RECEBER",d.id,joao,joao]);
  t("numeração: a compra e a conta a receber", [d.numero,r.numero], ["CP-000001","AR-000001"]);
  t("a compra continua em 3 parcelas na fatura", d.parcelas.map(p=>[p.valor,p.fatura]), [[R(200),"2026-10"],[R(200),"2026-11"],[R(200),"2026-12"]]);
  t("o cartão deve os 600", L.dividaCartao(nu), R(600));
  t("o reembolso acompanha as parcelas do cartão", r.parcelas.map(p=>[p.valor,p.vencimento]), d.parcelas.map(p=>[p.valor,p.vencimento]));
  t("João me deve 600", L.saldoChave("R:"+joao), R(600));
  const rs=resultado(L,{de:"2026-09-01",ate:"2026-09-30"});
  t("não entra nas minhas despesas", rs.despesas, 0);
  t("aparece à parte, na categoria real e por pessoa", [rs.terceiros.total, rs.terceiros.categorias.map(c=>c.nome), rs.terceiros.pessoas], [R(600),["Combustível"],[{pessoa:joao,total:R(600)}]]);
  t("a conta a receber não lança nada no razão", L.lancamentosDoDocumento(r.id).length, 0);
  t("não existe despesa em Combustível no razão", L.saldoChave("E:"+comb), 0);
  integro(L);

g("Terceiro — recebimento parcial e total: dinheiro que volta, não receita");
  ex(L,C.registrarPagamento(L,{direcao:"ENTRADA",data:"2026-09-20",conta:a,alocacoes:[{parcela:r.parcelas[0].id,valor:R(150)}]}));
  t("parcialmente recebido", [L.estadoDocumento(r).status,L.estadoDocumento(r).pago,L.estadoDocumento(r).restante], ["PARCIAL",R(150),R(450)]);
  t("a conta subiu 150", L.saldoConta(a), R(1150));
  t("João agora deve 450", L.saldoChave("R:"+joao), R(450));
  t("não virou receita", resultado(L,{de:"2026-09-01",ate:"2026-09-30"}).receitas, 0);
  const cx=resultadoCaixa(L,{de:"2026-09-01",ate:"2026-09-30"});
  t("no caixa: devolvido, não entrada", [cx.entradas,cx.devolvido,cx.pessoas[0].devolvido], [0,R(150),R(150)]);
  const fl=fluxoDeCaixa(L,{de:"2026-09-01",ate:"2026-09-30"})[0];
  t("no fluxo: entrou, e mostra que foi devolução", [fl.entradas,fl.deTerceiros], [R(150),R(150)]);
  integro(L);
  ex(L,C.registrarPagamento(L,{direcao:"ENTRADA",data:"2026-09-25",conta:a,alocacoes:r.parcelas.map((p,i)=>({parcela:p.id,valor:i===0?R(50):p.valor}))}));
  t("recebido por inteiro", [L.estadoDocumento(r).status,L.saldoChave("R:"+joao),L.saldoConta(a)], ["PAGA",0,R(1600)]);
  t("a fatura não mudou", [fatura(L,nu,"2026-10").total,L.dividaCartao(nu)], [R(200),R(600)]);
  ex(L,C.pagarFatura(L,{cartao:nu,ref:"2026-10",valor:R(200),data:"2026-09-26",conta:a}));
  const cx2=resultadoCaixa(L,{de:"2026-09-01",ate:"2026-09-30"});
  t("pagar a fatura com a parte do João: adiantado, não despesa minha", [cx2.saidas,cx2.adiantado], [0,R(200)]);
  const fl2=fluxoDeCaixa(L,{de:"2026-09-01",ate:"2026-09-30"})[0];
  t("no fluxo a saída aparece como paga por outros", [fl2.saidas,fl2.paraTerceiros], [R(200),R(200)]);
  integro(L); }

g("Terceiro — a fatura separa o que é meu do que é dos outros (exemplo do pedido)");
{ const {L,nu,comb,mer,joao,pedro}=cenarioTerceiro();
  doc(L,{tipo:"COMPRA_CARTAO",descricao:"Mercado",valor:R(800),data:"2026-09-12",cartao:nu,categoria:mer});
  const dj=doc(L,{tipo:"COMPRA_CARTAO",descricao:"Pneu do João",valor:R(600),data:"2026-09-13",cartao:nu,categoria:comb,
    terceiro:{pessoa:joao,modo:"PERSONALIZADO",cronograma:[{valor:R(200),vencimento:"2026-10-20"},{valor:R(200),vencimento:"2026-11-20"},{valor:R(200),vencimento:"2026-12-20"}]}});
  const dp=doc(L,{tipo:"COMPRA_CARTAO",descricao:"Jantar do Pedro",valor:R(300),data:"2026-09-14",cartao:nu,categoria:mer,
    terceiro:{pessoa:pedro,modo:"UNICO",vencimento:"2026-10-05"}});
  const dv=divisaoDaFatura(L,fatura(L,nu,"2026-10"));
  t("total 1.700 = 800 meus + 900 de terceiros", [dv.total,dv.minhas,dv.terceiros], [R(1700),R(800),R(900)]);
  t("a receber 900", dv.aReceber, R(900));
  t("por pessoa", dv.pessoas.map(x=>[x.pessoa,x.nestaFatura,x.falta]), [[joao,R(600),R(600)],[pedro,R(300),R(300)]]);
  t("João devolve em 3x", L.documentos.get(dj.terceiro.receber).parcelas.map(p=>p.vencimento), ["2026-10-20","2026-11-20","2026-12-20"]);
  t("Pedro de uma vez", L.documentos.get(dp.terceiro.receber).parcelas.map(p=>[p.valor,p.vencimento]), [[R(300),"2026-10-05"]]);
  t("minhas despesas do mês: só os 800", resultado(L,{de:"2026-09-01",ate:"2026-09-30"}).despesas, R(800));
  integro(L);
  /* parcelado no cartão: cada fatura leva a parte daquele mês */
  doc(L,{tipo:"COMPRA_CARTAO",descricao:"Celular do João",valor:R(900),data:"2026-09-14",cartao:nu,categoria:mer,parcelas:3,terceiro:{pessoa:joao}});
  const dv11=divisaoDaFatura(L,fatura(L,nu,"2026-11"));
  t("fatura seguinte: só a parcela do celular, de terceiro", [dv11.total,dv11.minhas,dv11.terceiros], [R(300),0,R(300)]);
  integro(L); }

g("Terceiro — cronograma personalizado precisa somar o valor da compra");
{ const {L,nu,comb,joao}=cenarioTerceiro();
  const base={tipo:"COMPRA_CARTAO",descricao:"Pneu",valor:R(600),data:"2026-09-13",cartao:nu,categoria:comb};
  t("faltando", tenta(()=>C.criarDocumento(L,{...base,terceiro:{pessoa:joao,modo:"PERSONALIZADO",cronograma:[{valor:R(200),vencimento:"2026-10-20"},{valor:R(300),vencimento:"2026-11-20"}]}})),
    "O reembolso soma R$ 500,00 e a compra é de R$ 600,00: faltam R$ 100,00.");
  t("passando", /passou R\$ 50,00/.test(tenta(()=>C.criarDocumento(L,{...base,terceiro:{pessoa:joao,modo:"PERSONALIZADO",cronograma:[{valor:R(650),vencimento:"2026-10-20"}]}}))), true);
  t("sem data", /data de cada parcela/.test(tenta(()=>C.criarDocumento(L,{...base,terceiro:{pessoa:joao,modo:"PERSONALIZADO",cronograma:[{valor:R(600),vencimento:""}]}}))), true);
  t("sem pessoa", tenta(()=>C.criarDocumento(L,{...base,terceiro:{modo:"UNICO",vencimento:"2026-10-01"}})), "Diga quem é a pessoa responsável.");
  t("nada foi gravado", [...L.documentos.values()].filter(d=>d.tipo!=="ABERTURA").length, 0); }

g("Terceiro — despesa comum paga por mim para outra pessoa");
{ const {L,a,joao}=cenarioTerceiro(); const luz=cat(L,"Luz");
  const d=doc(L,{tipo:"PAGAR",descricao:"Luz da casa da mãe",valor:R(120),data:"2026-09-10",categoria:luz,conta:a,
    quitar:{data:"2026-09-10",conta:a},terceiro:{pessoa:joao,modo:"UNICO",vencimento:"2026-10-10"}});
  t("saiu da conta", L.saldoConta(a), R(880));
  t("não é despesa minha, é a receber", [resultado(L,{de:"2026-09-01",ate:"2026-09-30"}).despesas,L.saldoChave("R:"+joao)], [0,R(120)]);
  t("a conta a receber existe", L.documentos.get(d.terceiro.receber).parcelas.map(p=>[p.valor,p.vencimento]), [[R(120),"2026-10-10"]]);
  t("no caixa: adiantado", [resultadoCaixa(L,{de:"2026-09-01",ate:"2026-09-30"}).saidas,resultadoCaixa(L,{de:"2026-09-01",ate:"2026-09-30"}).adiantado], [0,R(120)]);
  t("recorrente não pode", /não se repete sozinha/.test(tenta(()=>C.criarDocumento(L,{tipo:"PAGAR",descricao:"x",valor:R(10),data:"2026-09-10",recorrencia:"r1",terceiro:{pessoa:joao,modo:"UNICO",vencimento:"2026-10-10"}}))), true);
  integro(L); }

g("Terceiro — editar sem nada recebido atualiza o vínculo no lugar");
{ const {L,nu,comb,joao,pedro}=cenarioTerceiro();
  const d=doc(L,{tipo:"COMPRA_CARTAO",descricao:"Gasolina",valor:R(600),data:"2026-09-15",cartao:nu,categoria:comb,parcelas:3,terceiro:{pessoa:joao,modo:"PARCELAS"}});
  const rid=d.terceiro.receber;
  ex(L,C.editarDocumento(L,d.id,{valor:R(900)}));
  const r=L.documentos.get(rid);
  t("valor novo: o reembolso acompanha, mesma conta a receber", [r.valor,r.parcelas.map(p=>p.valor),r.numero], [R(900),[R(300),R(300),R(300)],"AR-000001"]);
  t("João deve 900", L.saldoChave("R:"+joao), R(900));
  ex(L,C.editarDocumento(L,d.id,{parcelas:2}));
  t("parcelas da compra mudaram: o reembolso também", L.documentos.get(rid).parcelas.map(p=>p.valor), [R(450),R(450)]);
  ex(L,C.editarDocumento(L,d.id,{terceiro:{pessoa:pedro,modo:"UNICO",vencimento:"2026-12-01"}}));
  const r2=L.documentos.get(rid);
  t("trocar a pessoa e o cronograma", [r2.parceiro,r2.parcelas.map(p=>[p.valor,p.vencimento]),L.documentos.get(d.id).terceiro.modo], [pedro,[[R(900),"2026-12-01"]],"UNICO"]);
  t("o a receber passou do João para o Pedro", [L.saldoChave("R:"+joao),L.saldoChave("R:"+pedro)], [0,R(900)]);
  ex(L,C.editarDocumento(L,d.id,{descricao:"Gasolina e óleo"}));
  t("a descrição automática acompanha", L.documentos.get(rid).descricao, "Reembolso · Gasolina e óleo");
  integro(L);
  ex(L,C.editarDocumento(L,d.id,{terceiro:null}));
  t("passou a ser minha: conta a receber cancelada, vira despesa", [L.documentos.get(rid).status,L.saldoChave("R:"+pedro),L.saldoChave("E:"+comb),L.documentos.get(d.id).terceiro], ["CANCELADO",0,R(900),null]);
  t("o cartão não mudou", L.dividaCartao(nu), R(900));
  integro(L);
  ex(L,C.editarDocumento(L,d.id,{terceiro:{pessoa:joao,modo:"PARCELAS"}}));
  const d3=L.documentos.get(d.id);
  t("de novo de terceiro: uma conta a receber nova", [d3.terceiro.receber!==rid,L.documentos.get(d3.terceiro.receber).numero,L.saldoChave("E:"+comb),L.saldoChave("R:"+joao)], [true,"AR-000002",0,R(900)]);
  const ativos=[...L.documentos.values()].filter(x=>x.reembolsoDe===d.id&&x.status!=="CANCELADO");
  t("nunca duas contas a receber ativas para a mesma compra", ativos.length, 1);
  integro(L); }

g("Terceiro — com dinheiro já devolvido, nada destrutivo");
{ const {L,a,nu,comb,joao,pedro}=cenarioTerceiro();
  const d=doc(L,{tipo:"COMPRA_CARTAO",descricao:"Gasolina",valor:R(600),data:"2026-09-15",cartao:nu,categoria:comb,parcelas:3,terceiro:{pessoa:joao,modo:"PARCELAS"}});
  const rid=d.terceiro.receber, r=L.documentos.get(rid);
  ex(L,C.registrarPagamento(L,{direcao:"ENTRADA",data:"2026-09-20",conta:a,alocacoes:[{parcela:r.parcelas[0].id,valor:R(200)}]}));
  t("trocar a pessoa é recusado", /João já devolveu R\$ 200,00.*estorne esse recebimento/.test(tenta(()=>C.editarDocumento(L,d.id,{terceiro:{pessoa:pedro,modo:"PARCELAS"}}))), true);
  t("tornar minha é recusado", /João já devolveu/.test(tenta(()=>C.editarDocumento(L,d.id,{terceiro:null}))), true);
  t("cancelar a compra é recusado", /João já devolveu/.test(tenta(()=>C.cancelarDocumento(L,d.id,{motivo:"teste"}))), true);
  t("cancelar a conta a receber direto é recusado", /nasceu da compra CP-000001/.test(tenta(()=>C.cancelarDocumento(L,rid,{motivo:"teste"}))), true);
  t("mudar o valor da conta a receber direto é recusado", /mudam por lá/.test(tenta(()=>C.editarDocumento(L,rid,{valor:R(100)}))), true);
  const p1=r.parcelas[0];
  ex(L,C.editarDocumento(L,d.id,{valor:R(900)}));
  const r2=L.documentos.get(rid);
  t("aumentar o valor: a parcela recebida fica como estava, o resto é refeito", [r2.parcelas[0].id,r2.parcelas[0].valor,r2.valor,r2.parcelas.map(p=>p.valor)], [p1.id,R(200),R(900),[R(200),R(100),R(300),R(300)]]);
  t("o recebimento continua apontando para a mesma parcela", L.estadoParcela(r2.parcelas[0],r2).pago, R(200));
  t("João deve 700", [L.saldoChave("R:"+joao),L.estadoDocumento(r2).restante], [R(700),R(700)]);
  integro(L);
  ex(L,C.editarDocumento(L,d.id,{terceiro:{pessoa:joao,modo:"UNICO",vencimento:"2026-12-15"}}));
  const r3=L.documentos.get(rid);
  t("reprogramar o que falta de uma vez", r3.parcelas.map(p=>[p.valor,p.vencimento]), [[R(200),p1.vencimento],[R(700),"2026-12-15"]]);
  t("personalizado conta só o que falta", tenta(()=>C.editarDocumento(L,d.id,{terceiro:{pessoa:joao,modo:"PERSONALIZADO",cronograma:[{valor:R(600),vencimento:"2026-11-01"}]}})),
    "O reembolso soma R$ 600,00 e falta programar R$ 700,00: faltam R$ 100,00.");
  t("diminuir abaixo do que já tem recebimento é recusado", /Estorne o recebimento antes de diminuir/.test(tenta(()=>C.editarDocumento(L,d.id,{valor:R(150)}))), true);
  integro(L);
  /* estornado o recebimento, a pessoa pode mudar */
  const pg=[...L.pagamentos.values()].find(x=>x.direcao==="ENTRADA");
  ex(L,C.estornarPagamento(L,pg.id,{motivo:"lancei errado"}));
  ex(L,C.editarDocumento(L,d.id,{terceiro:{pessoa:pedro,modo:"UNICO",vencimento:"2026-12-15"}}));
  t("depois do estorno, troca a pessoa", [L.documentos.get(rid).parceiro,L.saldoChave("R:"+joao),L.saldoChave("R:"+pedro)], [pedro,0,R(900)]);
  integro(L);
  ex(L,C.cancelarDocumento(L,d.id,{motivo:"compra devolvida"}));
  t("cancelar a compra leva a conta a receber junto", [L.documentos.get(rid).status,L.saldoChave("R:"+pedro),L.dividaCartao(nu)], ["CANCELADO",0,0]);
  integro(L); }

g("Terceiro — compra antiga, fatura já paga, marcada depois como do João");
{ const {L,a,nu,comb,joao}=cenarioTerceiro();
  const d=doc(L,{tipo:"COMPRA_CARTAO",descricao:"Posto",valor:R(250),data:"2026-08-05",cartao:nu,categoria:comb});
  ex(L,C.pagarFatura(L,{cartao:nu,ref:"2026-08",valor:R(250),data:"2026-08-17",conta:a}));
  const antes=L.saldoConta(a);
  ex(L,C.editarDocumento(L,d.id,{terceiro:{pessoa:joao,modo:"UNICO",vencimento:"2026-10-01"}}));
  t("a fatura paga continua paga, o banco não mexe", [fatura(L,nu,"2026-08").status,L.saldoConta(a),L.dividaCartao(nu)], ["PAGA",antes,0]);
  t("agosto: sai das minhas despesas", [resultado(L,{de:"2026-08-01",ate:"2026-08-31"}).despesas,resultado(L,{de:"2026-08-01",ate:"2026-08-31"}).terceiros.total], [0,R(250)]);
  t("João deve 250", L.saldoChave("R:"+joao), R(250));
  integro(L); }

g("Terceiro — perdoar parte da dívida vira despesa minha (desconto)");
{ const {L,a,nu,comb,joao}=cenarioTerceiro();
  const d=doc(L,{tipo:"COMPRA_CARTAO",descricao:"Posto",valor:R(100),data:"2026-09-15",cartao:nu,categoria:comb,terceiro:{pessoa:joao,modo:"UNICO",vencimento:"2026-10-01"}});
  const r=L.documentos.get(d.terceiro.receber);
  ex(L,C.registrarPagamento(L,{direcao:"ENTRADA",data:"2026-09-20",conta:a,alocacoes:[{parcela:r.parcelas[0].id,valor:R(100),desconto:R(20)}]}));
  t("quitado, entrou 80, 20 de desconto concedido", [L.estadoDocumento(r).status,L.saldoConta(a),L.saldoChave("E:#desconto")], ["PAGA",R(1080),R(20)]);
  integro(L); }

g("Compra antiga no cartão: com parcelas já pagas, só entram as que faltam");
{ const L=novoLivro(); const a=conta(L,"Nubank",5000,"2026-09-27"); const nu=cartao(L,"Roxinho",{limite:10000});
  const d=doc(L,{tipo:"COMPRA_CARTAO",descricao:"TV",valor:R(1000),data:"2026-05-05",cartao:nu,parcelas:10,parcelasPagas:5});
  t("nascem 6/10 a 10/10", d.parcelas.map(p=>p.n+"/"+p.de), ["6/10","7/10","8/10","9/10","10/10"]);
  t("cada uma na sua fatura, a partir de outubro", d.parcelas.map(p=>p.fatura), ["2026-10","2026-11","2026-12","2027-01","2027-02"]);
  t("o documento vale o que falta; o total da compra fica guardado", [d.valor,d.valorOriginal], [R(500),R(1000)]);
  t("o cartão deve só o que falta, e o limite também", [L.dividaCartao(nu),limiteCartao(L,nu).disponivel], [R(500),R(9500)]);
  t("nenhuma fatura antiga vencida", ["2026-05","2026-06","2026-07","2026-08","2026-09"].map(r=>fatura(L,nu,r).status), ["VAZIA","VAZIA","VAZIA","VAZIA","VAZIA"]);
  t("o banco não mexe", L.saldoConta(a), R(5000));
  integro(L);
  ex(L,C.editarDocumento(L,d.id,{valor:R(600)}));
  const d2=L.documentos.get(d.id);
  t("editar o valor não joga as parcelas para as faturas antigas", d2.parcelas.map(p=>p.n+"@"+p.fatura), ["6@2026-10","7@2026-11","8@2026-12","9@2027-01","10@2027-02"]);
  t("o total da compra acompanha (o que foi pago antes não muda)", [d2.valor,d2.valorOriginal], [R(600),R(1100)]);
  ex(L,C.editarDocumento(L,d.id,{data:"2026-06-05"}));
  t("data nova: conta da fatura da compra, pulando as já pagas", L.documentos.get(d.id).parcelas[0].fatura, "2026-11");
  integro(L);
  t("centavos: a sobra fica na primeira, que já foi paga", doc(L,{tipo:"COMPRA_CARTAO",descricao:"X",valor:100001,data:"2026-09-01",cartao:nu,parcelas:3,parcelasPagas:1}).parcelas.map(p=>p.valor), [33333,33333]);
  t("todas pagas é recusado", tenta(()=>C.criarDocumento(L,{tipo:"COMPRA_CARTAO",descricao:"Y",valor:R(100),data:"2026-09-01",cartao:nu,parcelas:3,parcelasPagas:3})), "As parcelas já pagas precisam ser menos que o total (3x).");
  t("só vale para cartão", tenta(()=>C.criarDocumento(L,{tipo:"PAGAR",descricao:"Y",valor:R(100),data:"2026-09-01",parcelas:3,parcelasPagas:1})), "Parcelas já pagas só vale para compra no cartão.");
  const {joao}={joao:pn(L,"João")};
  const dt=doc(L,{tipo:"COMPRA_CARTAO",descricao:"Celular do João",valor:R(1200),data:"2026-06-05",cartao:nu,parcelas:12,parcelasPagas:4,terceiro:{pessoa:joao,modo:"PARCELAS"}});
  const r=L.documentos.get(dt.terceiro.receber);
  t("de terceiro: o reembolso cobre o que falta, parcela a parcela", [r.valor,r.parcelas.length,r.parcelas[0].vencimento], [R(800),8,dt.parcelas[0].vencimento]);
  integro(L); }

g("Importação de fatura \"Parcela 6/10\" guarda o total da compra");
{ const L=novoLivro(); const nu=cartao(L,"Roxinho");
  const d=doc(L,{tipo:"COMPRA_CARTAO",descricao:"TV",valor:R(500),data:"2026-05-05",cartao:nu,
    parcelas:Array.from({length:5},()=>({valor:R(100)})),parcelaInicial:{n:6,de:10},fatura:"2026-10",valorOriginal:R(1000)});
  ex(L,C.editarDocumento(L,d.id,{valor:R(550)}));
  t("editar não volta para a fatura de maio", L.documentos.get(d.id).parcelas[0].fatura, "2026-10");
  integro(L); }

g("Poupança e investimentos: rendimento estimado como no 2.2, para cada tipo");
{ const L=novoLivro();
  const inv=(nome,saldo,reserva,data="2026-01-02")=>ex(L,C.criarConta(L,{nome,tipo:"RESERVA",reserva},{saldoInicial:R(saldo),dataAbertura:data})).gravar.find(x=>x.colecao==="contas").id;
  t("índices de referência padrão (o CDI do 2.2)", Inv.indices(L), {cdi:14.65,selic:14.75,ipca:4.5,tr:0.15});
  const cdb=inv("CDB Nubank",10000,{produto:"CDB",indexador:"CDI",taxa:100});
  const e=Inv.rendimentoEstimado(L,L.contas.get(cdb));
  t("100% do CDI: ao ano = saldo × CDI (fórmula do 2.2)", e.ano, R(1465));
  t("ao mês = saldo × ((1+taxa)^(1/12) − 1)", e.mes, Math.round(1000000*(Math.pow(1.1465,1/12)-1)));
  t("aplicado há mais de 180 dias: IR de 20%", [e.dias>180,e.ir,e.mesLiquido], [true,0.2,Math.round(e.mes*0.8)]);
  const pou=inv("Poupança Caixa",10000,{produto:"POUPANCA"});
  const ep=Inv.rendimentoEstimado(L,L.contas.get(pou));
  t("poupança com Selic acima de 8,5%: 0,5% + TR ao mês, sem IR", [ep.mes,ep.ir,ep.mesLiquido], [R(65),0,R(65)]);
  t("com Selic de 7%: 70% da Selic + TR", Math.round(Inv.poupancaMensal({selic:7,tr:0})*1e6), Math.round((Math.pow(1.049,1/12)-1)*1e6));
  const lci=inv("LCI",10000,{produto:"LCI_LCA",indexador:"CDI",taxa:90});
  t("LCI é isenta de IR", Inv.rendimentoEstimado(L,L.contas.get(lci)).ir, 0);
  const ipca=inv("Tesouro IPCA",10000,{produto:"TESOURO_IPCA",taxa:6});
  t("IPCA + 6%: (1+IPCA)(1+6%) − 1", Inv.rendimentoEstimado(L,L.contas.get(ipca)).ano, Math.round(1000000*(1.045*1.06-1)));
  const pre=inv("CDB pré",10000,{produto:"CDB",indexador:"PRE",taxa:12.5});
  t("prefixado 12,5% ao ano", Inv.rendimentoEstimado(L,L.contas.get(pre)).ano, R(1250));
  const acoes=inv("Ações",5000,{produto:"ACOES"});
  t("renda variável não tem cálculo automático", [Inv.rendimentoEstimado(L,L.contas.get(acoes)).calcula,Inv.rendimentoEstimado(L,L.contas.get(acoes)).mes], [false,0]);
  const novo=inv("CDB novo",1000,{produto:"CDB",taxa:100},"2026-09-10");
  t("aplicado há menos de 180 dias: IR de 22,5%", Inv.rendimentoEstimado(L,L.contas.get(novo)).ir, 0.225);
  t("rótulos", [cdb,pou,ipca,pre,acoes].map(id=>Inv.rotuloTaxa(Inv.perfil(L.contas.get(id)))), ["100% do CDI","regra da poupança","IPCA + 6%","12,5% ao ano","sem rendimento fixo"]);
  /* meta do 2.2: só tem `cdi` */
  const velha=inv("Viagem (2.2)",2000,{alvo:R(10000),aporte:R(500),cdi:110});
  t("meta migrada do 2.2 vale como % do CDI", Inv.rotuloTaxa(Inv.perfil(L.contas.get(velha))), "110% do CDI");
  const mt=Inv.progressoMeta(L,L.contas.get(velha));
  t("meta: 20%, faltam 8.000, 16 meses no ritmo do aporte", [Math.round(mt.pct),mt.falta,mt.meses], [20,R(8000),16]);
  const cart=Inv.carteira(L);
  t("carteira soma o guardado e o rendimento líquido", [cart.itens.length,cart.guardado,cart.rendeMes], [8,R(58000),cart.itens.reduce((s,x)=>s+x.est.mesLiquido,0)]);
  /* índices editados em Ajustes */
  ex(L,C.salvarIndices(L,{cdi:13,selic:13.1,ipca:5,tr:0.1}));
  t("índices salvos valem para a estimativa", Inv.rendimentoEstimado(L,L.contas.get(cdb)).ano, R(1300));
  t("índice inválido é recusado", tenta(()=>C.salvarIndices(L,{cdi:-1,selic:13,ipca:5,tr:0})), "Índice inválido: CDI.");
  t("tipo que não aceita o indexador é recusado", tenta(()=>C.criarConta(L,{nome:"X",tipo:"RESERVA",reserva:{produto:"LCI_LCA",indexador:"SELIC",taxa:100}})), "LCI / LCA não rende por % da Selic.");
  t("meta negativa é recusada", tenta(()=>C.criarConta(L,{nome:"X",tipo:"RESERVA",reserva:{alvo:-100}})), "Meta e aporte não podem ser negativos.");
  ex(L,C.editarConta(L,cdb,{reserva:{produto:"CDB",indexador:"CDI",taxa:110,alvo:0,aporte:0}}));
  t("editar a taxa", [Inv.rotuloTaxa(Inv.perfil(L.contas.get(cdb))),L.contas.get(cdb).reserva.cdi], ["110% do CDI",110]);
  const L2=novoLivro(); ex(L2,(()=>{ const m=new C.Mudanca(L2); m.set("meta","preferencias",{id:"preferencias",cdiRef:0.1390}); return m; })());
  t("o CDI de referência que veio do 2.2 vale", Inv.indices(L2).cdi, 13.9);
  integro(L); }

g("Visão geral mês a mês: passado é o que foi, atual é previsto, futuro é projeção");
{ const L=novoLivro(); const a=conta(L,"Nubank",1000,"2026-07-01"), b=conta(L,"Reserva",0,"2026-07-01","RESERVA");
  const nu=cartao(L,"Roxinho"), joao=pn(L,"João");
  doc(L,{tipo:"PAGAR",descricao:"Luz de agosto",valor:R(200),data:"2026-08-10",conta:a,quitar:{data:"2026-08-10",conta:a}});
  doc(L,{tipo:"RECEBER",descricao:"Salário",valor:R(500),data:"2026-09-05",conta:a,quitar:{data:"2026-09-05",conta:a}});
  doc(L,{tipo:"PAGAR",descricao:"Dentista",valor:R(300),data:"2026-09-20",conta:a,primeiroVencimento:"2026-10-05"});
  doc(L,{tipo:"COMPRA_CARTAO",descricao:"Tênis",valor:R(600),data:"2026-09-12",cartao:nu,parcelas:3});
  const dt=doc(L,{tipo:"COMPRA_CARTAO",descricao:"Pneu do João",valor:R(400),data:"2026-09-13",cartao:nu,terceiro:{pessoa:joao,modo:"UNICO",vencimento:"2026-10-10"}});
  ex(L,C.criarTransferencia(L,{de:a,para:b,valor:R(100),data:"2026-09-15"}));
  const ago=resumoDoMes(L,"2026-08");
  t("agosto já passou: saldo real no fim", [ago.tipo,ago.saldoFim], ["PASSADO",R(800)]);
  t("agosto: o que venceu e foi pago", [ago.pagar.total,ago.pagar.restante], [R(200),0]);
  t("agosto: seus lançamentos", ago.lancamentos.map(d=>d.descricao), ["Luz de agosto"]);
  t("agosto: entrou e saiu", [ago.fluxo.entradas,ago.fluxo.saidas], [0,R(200)]);
  const set=resumoDoMes(L,"2026-09");
  t("setembro é o mês atual: o saldo previsto", [set.tipo,set.saldoFim], ["ATUAL",saldoPrevistoDoMes(L).final]);
  t("setembro: lançamentos da competência, do mais novo ao mais velho, sem o reembolso", set.lancamentos.map(d=>d.descricao),
    ["Dentista","Transferência Nubank → Reserva","Pneu do João","Tênis","Salário"]);
  t("o reembolso do João não entra como lançamento do mês", set.lancamentos.some(d=>d.id===dt.terceiro.receber), false);
  const out=resumoDoMes(L,"2026-10");
  t("outubro é futuro: projeção pelos compromissos", [out.tipo,out.saldoFim], ["FUTURO",compromissos(L,{meses:2})[1].saldoFinal]);
  t("outubro: o que vai vencer", [out.pagar.total,out.pagar.restante,out.receber.total], [R(300),R(300),R(400)]);
  t("outubro: nenhum lançamento com competência nele", out.lancamentos.length, 0);
  t("seis meses à frente também projeta", resumoDoMes(L,"2027-03").tipo, "FUTURO");
  integro(L); }

fim();
