/* Importação integrada ao motor, reconciliação, recorrências e relatórios.
   Rodar: node tests/analise.test.mjs */
import { g, t, lanca, fim } from "./util.mjs";
import { Livro } from "../js/financas/livro.js";
import * as C from "../js/financas/comandos.js";
import { verificar } from "../js/financas/integridade.js";
import { fatura } from "../js/financas/cartoes.js";
import * as I from "../js/importacao/analise.js";
import * as Lt from "../js/importacao/leitura.js";
import { resumoConciliacao, pontuar } from "../js/financas/conciliacao.js";
import * as Rec from "../js/financas/recorrencias.js";
import * as Rel from "../js/financas/relatorios.js";
import { buscar } from "../js/financas/busca.js";
import { definirRelogio } from "../js/nucleo/datas.js";
import { centavos } from "../js/nucleo/dinheiro.js";

definirRelogio(()=>new Date(2026,8,27,12));
const R=v=>centavos(v);
const ex=(L,m)=>{ L.aplicar(m); return m; };
const novoId=(m,col)=>m.gravar.find(x=>x.colecao===col).id;
const integro=(L,nome)=>t(nome||"integridade",verificar(L).problemas.map(p=>p.msg),[]);
function base(){
  const L=new Livro();
  const a=novoId(ex(L,C.criarConta(L,{nome:"Nubank",tipo:"BANCO"},{saldoInicial:R(1000),dataAbertura:"2026-09-01"})),"contas");
  for(const [n,nat] of [["Mercado","DESPESA"],["Restaurantes/Delivery","DESPESA"],["Salário","RECEITA"],["Assinaturas","DESPESA"]])
    ex(L,C.salvarCategoria(L,{nome:n,natureza:nat}));
  return {L,a};
}
const csv=txt=>{ const bruto=Lt.parseCSV(txt,Lt.detectarSeparadorCSV(txt)); const cab=Lt.acharCabecalhoCSV(bruto);
  return Lt.mapearCSV(bruto.slice(cab.idx+1),cab.cols); };

const EXTRATO=`Data,Valor,Identificador,Descrição
05/09/2026,-45.90,a1,Compra no débito - IFOOD
10/09/2026,3500.00,a2,Transferência recebida - EMPRESA X LTDA - 12.345.678/0001-00 - Agência 0001 Conta: 123
12/09/2026,-120.00,a3,Pix enviado - MERCADO BOM - 111.222.333-44 - Agência 1 Conta: 9
15/09/2026,-120.00,a4,Pix enviado - MERCADO BOM - 111.222.333-44 - Agência 1 Conta: 9
20/09/2026,-39.90,a5,Compra no débito - NETFLIX.COM`;

g("Caso 9 — importar o mesmo extrato duas vezes não duplica");
{ const {L,a}=base();
  const movs=csv(EXTRATO);
  const an=I.analisar(L,{modo:"CONTA",conta:a,movs});
  t("5 linhas novas", an.resumo.novas, 5);
  t("categoria sugerida pelas palavras, e só se existir", an.linhas.map(l=>L.nomeCategoria(l.categoria)), ["Restaurantes/Delivery","","Mercado","Mercado","Assinaturas"]);
  ex(L,I.confirmar(L,{arquivo:"nubank.csv",modo:"CONTA",conta:a,linhas:an.linhas}));
  t("saldo = 1000 −45,90 +3500 −120 −120 −39,90", L.saldoConta(a), R(1000-45.9+3500-120-120-39.9));
  t("5 documentos, 5 pagamentos", [[...L.documentos.values()].filter(d=>d.origem==="IMPORTACAO").length, L.pagamentos.size], [5,5]);
  t("tudo nasce conciliado", [...L.extrato.values()].map(e=>e.estado), Array(5).fill("CONCILIADA"));
  const an2=I.analisar(L,{modo:"CONTA",conta:a,movs:csv(EXTRATO)});
  t("segunda vez: 5 duplicadas", an2.resumo.duplicadas, 5);
  const antes=L.documentos.size;
  ex(L,I.confirmar(L,{arquivo:"nubank.csv",modo:"CONTA",conta:a,linhas:an2.linhas}));
  t("nenhum documento novo", L.documentos.size, antes);
  t("saldo igual", L.saldoConta(a), R(1000-45.9+3500-120-120-39.9));
  integro(L); }

g("Importação — desfazer cancela o que criou, estorna o que quitou e libera o arquivo");
{ const {L,a}=base();
  const d=L.documentos.get(novoId(ex(L,C.criarDocumento(L,{tipo:"PAGAR",descricao:"Compra do mês",valor:R(120),data:"2026-09-01",primeiroVencimento:"2026-09-12"})),"documentos"));
  const an=I.analisar(L,{modo:"CONTA",conta:a,movs:csv(EXTRATO)});
  const m=ex(L,I.confirmar(L,{arquivo:"x.csv",modo:"CONTA",conta:a,linhas:an.linhas}));
  const lote=novoId(m,"importacoes");
  t("antes: conta quitada pelo extrato", L.estadoDocumento(d).status, "PAGA");
  ex(L,I.desfazerImportacao(L,lote));
  t("saldo volta ao de antes da importação", L.saldoConta(a), R(1000));
  t("a conta que já existia volta a ficar em aberto (e vencida)", L.estadoDocumento(d).status, "VENCIDA");
  t("documentos criados ficam cancelados, não apagados", [...L.documentos.values()].filter(x=>x.origem==="IMPORTACAO").every(x=>x.status==="CANCELADO"), true);
  const an2=I.analisar(L,{modo:"CONTA",conta:a,movs:csv(EXTRATO)});
  t("reimportar: as linhas voltam como novas", an2.resumo.duplicadas, 0);
  integro(L); }

g("Importação — sem identificador, duas linhas iguais são duas compras (ocorrência)");
{ const {L,a}=base();
  const txt="Data;Historico;Valor\n12/09/2026;CAFE;-15,00\n12/09/2026;CAFE;-15,00";
  const an=I.analisar(L,{modo:"CONTA",conta:a,movs:csv(txt)});
  t("as duas são novas", an.linhas.map(l=>l.estado), ["NOVA","NOVA"]);
  t("com digitais diferentes", an.linhas[0].digital!==an.linhas[1].digital, true);
  ex(L,I.confirmar(L,{modo:"CONTA",conta:a,linhas:an.linhas}));
  const an2=I.analisar(L,{modo:"CONTA",conta:a,movs:csv(txt)});
  t("reimportar reconhece as duas", an2.linhas.map(l=>l.estado), ["DUPLICADA","DUPLICADA"]); }

g("Importação — o que já foi digitado à mão vira conciliação, não duplicata");
{ const {L,a}=base();
  C.criarDocumento; const m=ex(L,C.criarDocumento(L,{tipo:"PAGAR",descricao:"Netflix",valor:R(39.90),data:"2026-09-20",quitar:{data:"2026-09-20",conta:a}}));
  const an=I.analisar(L,{modo:"CONTA",conta:a,movs:csv(EXTRATO)});
  const nf=an.linhas.find(l=>/NETFLIX/.test(l.descricao));
  t("linha da Netflix: já no app", [nf.estado,nf.acao], ["NO_APP","VINCULAR"]);
  ex(L,I.confirmar(L,{modo:"CONTA",conta:a,linhas:an.linhas}));
  t("sem despesa em dobro", [...L.documentos.values()].filter(d=>/netflix/i.test(d.descricao)).length, 1);
  const l=L.lancamentosDoPagamento([...L.pagamentos.values()][0].id)[0];
  t("o lançamento digitado ficou conciliado", l.linhas.some(x=>x.conc), true);
  integro(L); }

g("Importação — linha do banco quita a conta em aberto (baixa pelo extrato)");
{ const {L,a}=base();
  const pn=novoId(ex(L,C.salvarParceiro(L,{nome:"Mercado Bom"})),"parceiros");
  const d=L.documentos.get(novoId(ex(L,C.criarDocumento(L,{tipo:"PAGAR",descricao:"Compra do mês",valor:R(120),data:"2026-09-01",parceiro:pn,primeiroVencimento:"2026-09-12"})),"documentos"));
  const an=I.analisar(L,{modo:"CONTA",conta:a,movs:csv(EXTRATO)});
  const q=an.linhas.filter(l=>l.estado==="QUITA");
  t("só uma das duas linhas de 120 quita (a outra é compra nova)", q.length, 1);
  t("a de 12/09, do vencimento", q[0].data, "2026-09-12");
  ex(L,I.confirmar(L,{modo:"CONTA",conta:a,linhas:an.linhas}));
  t("conta paga pelo extrato", L.estadoDocumento(d).status, "PAGA");
  integro(L); }

g("Importação — pagamento de fatura no extrato paga a fatura, não vira despesa");
{ const {L,a}=base();
  const nu=novoId(ex(L,C.salvarCartao(L,{nome:"Roxinho",limite:R(5000),fechamento:10,vencimento:17,contaPagamento:a})),"cartoes");
  ex(L,C.criarDocumento(L,{tipo:"COMPRA_CARTAO",cartao:nu,descricao:"Loja",valor:R(300),data:"2026-09-05"}));
  const an=I.analisar(L,{modo:"CONTA",conta:a,movs:csv("Data,Valor,Identificador,Descrição\n17/09/2026,-300.00,f1,Pagamento de fatura")});
  t("reconhece a fatura", [an.linhas[0].estado,an.linhas[0].acao], ["FATURA","PAGAR_FATURA"]);
  const despesaAntes=L.saldoChave("E:-");
  ex(L,I.confirmar(L,{modo:"CONTA",conta:a,linhas:an.linhas}));
  t("fatura paga", fatura(L,nu,"2026-09").status, "PAGA");
  t("nenhuma despesa nova", L.saldoChave("E:-"), despesaAntes);
  t("banco 700", L.saldoConta(a), R(700));
  integro(L); }

g("Importação — fatura do cartão com parcelas, e o mês seguinte reconhece a parcela");
{ const {L,a}=base();
  const nu=novoId(ex(L,C.salvarCartao(L,{nome:"Roxinho",limite:R(5000),fechamento:10,vencimento:17,contaPagamento:a})),"cartoes");
  const set=`date,title,amount
2026-08-02,Mercado Livre - Fone - Parcela 2/4,100.00
2026-08-20,Padaria,12.50
2026-08-25,Pagamento recebido,-500.00
2026-08-26,Estorno Padaria,-2.50`;
  const movs=csv(set);
  const an=I.analisar(L,{modo:"CARTAO",cartao:nu,movs,faturaRef:"2026-09"});
  t("pagamento da fatura anterior nasce ignorado", an.linhas[2].acao, "IGNORAR");
  t("estorno reconhecido", an.linhas[3].tipo, "ESTORNO");
  ex(L,I.confirmar(L,{modo:"CARTAO",cartao:nu,faturaRef:"2026-09",linhas:an.linhas}));
  const fone=[...L.documentos.values()].find(d=>/Fone/.test(d.descricao));
  t("parcela 2/4 cria 2/4, 3/4, 4/4 (as anteriores não)", fone.parcelas.map(p=>p.n+"/"+p.de+"@"+p.fatura), ["2/4@2026-09","3/4@2026-10","4/4@2026-11"]);
  t("sufixo de parcela sai da descrição", fone.descricao, "Mercado Livre - Fone");
  t("fatura de setembro: 100 + 12,50 − 2,50", fatura(L,nu,"2026-09").restante, R(110));
  t("cartão deve 110 + 200 futuros", L.dividaCartao(nu), R(310));
  const out=`date,title,amount
2026-08-02,Mercado Livre - Fone - Parcela 3/4,100.00
2026-09-12,Farmácia,40.00`;
  const an2=I.analisar(L,{modo:"CARTAO",cartao:nu,movs:csv(out),faturaRef:"2026-10"});
  t("mês seguinte: parcela 3/4 já existe", [an2.linhas[0].estado,an2.linhas[1].estado], ["DUPLICADA","NOVA"]);
  ex(L,I.confirmar(L,{modo:"CARTAO",cartao:nu,faturaRef:"2026-10",linhas:an2.linhas}));
  t("sem parcela em dobro", fatura(L,nu,"2026-10").itens.length, 2);
  integro(L); }

g("Importação — OFX traz saldo do banco e sugere modo");
{ const ofx=`OFXHEADER:100
<OFX><BANKMSGSRSV1><STMTTRNRS><STMTRS><BANKTRANLIST>
<STMTTRN><TRNTYPE>DEBIT<DTPOSTED>20260910<TRNAMT>-50.00<FITID>X1<MEMO>TARIFA</STMTTRN>
</BANKTRANLIST><LEDGERBAL><BALAMT>950.00<DTASOF>20260926</LEDGERBAL></STMTRS></STMTTRNRS></BANKMSGSRSV1></OFX>`;
  const r=await I.lerArquivo(new TextEncoder().encode(ofx),"extrato.ofx");
  t("modo conta", r.modoSugerido, "CONTA");
  t("saldo informado", r.saldoInformado, {valor:R(950),data:"2026-09-26"});
  t("uma movimentação", r.movs.length, 1);
  const pdf=await I.lerArquivo(new TextEncoder().encode("%PDF-1.4 ..."),"extrato.pdf");
  t("PDF recusado com motivo", pdf.erro, "pdf"); }

g("Caso 10 — reconciliação encontra e explica a diferença");
{ const {L,a}=base();   // WIGO: 1.000 em 01/09
  ex(L,C.criarDocumento(L,{tipo:"PAGAR",descricao:"Luz",valor:R(200),data:"2026-09-10",quitar:{data:"2026-09-10",conta:a}}));
  t("WIGO: 800", L.saldoConta(a), R(800));
  const r=resumoConciliacao(L,{conta:a,de:"2026-09-01",ate:"2026-09-30",bancoInicial:R(1000),bancoFinal:R(1000)});
  t("diferença de 200", r.diferenca, R(200));
  t("o saldo inicial é ponto de partida, não movimento", [r.wigoInicial, r.difInicial], [R(1000), 0]);
  t("a diferença é a Luz: está no WIGO e não no banco", r.soNoWigo.map(x=>x.valor), [R(-200)]);
  t("tudo explicado", r.naoExplicado, 0);
  integro(L); }

g("Reconciliação — sugestão de par com pontuação");
{ t("mesmo valor, dia e nome: alta", pontuar({valor:-5000,data:"2026-09-26",descricao:"PIX JOAO SILVA"},{valor:-5000,data:"2026-09-26",descricao:"Pagamento João Silva"}).pontos>=90, true);
  t("valor diferente: zero", pontuar({valor:-5000,data:"2026-09-26",descricao:"X"},{valor:-5001,data:"2026-09-26",descricao:"X"}).pontos, 0);
  t("mesmo identificador: 100", pontuar({valor:1,data:"2026-09-01",descricao:"a",refBanco:"Z"},{valor:1,data:"2026-09-09",descricao:"b",refBanco:"Z"}).pontos, 100); }

g("Recorrência — gera documentos de verdade, na janela, e encerra sem apagar o pago");
{ const {L,a}=base();
  const m=ex(L,Rec.criarRecorrencia(L,{tipo:"PAGAR",descricao:"Aluguel",valor:R(1500),inicio:"2026-09-05"}));
  const rid=novoId(m,"recorrencias");
  const docs=[...L.documentos.values()].filter(d=>d.recorrencia===rid);
  t("25 meses: set/2026 até set/2028", [docs.length, docs[0].data, docs.at(-1).data], [25,"2026-09-05","2028-09-05"]);
  t("cada um com número próprio", new Set(docs.map(d=>d.numero)).size, 25);
  ex(L,C.registrarPagamento(L,{direcao:"SAIDA",data:"2026-09-05",conta:a,alocacoes:[{parcela:docs[0].parcelas[0].id,valor:R(1500)}]}));
  ex(L,Rec.editarRecorrencia(L,rid,{valor:R(1600)}));
  t("reajuste só nos futuros sem pagamento", [L.documentos.get(docs[0].id).valor, L.documentos.get(docs[1].id).valor], [R(1500),R(1600)]);
  definirRelogio(()=>new Date(2026,10,1,12));   // passa o tempo
  const nova=Rec.gerarPendentes(L); if(nova) ex(L,nova);
  t("janela esticou 2 meses", [...L.documentos.values()].filter(d=>d.recorrencia===rid).length, 27);
  ex(L,Rec.encerrarRecorrencia(L,rid,{}));
  const vivos=[...L.documentos.values()].filter(d=>d.recorrencia===rid&&d.status!=="CANCELADO");
  t("encerrar mantém o pago e o que já venceu", vivos.map(d=>d.data), ["2026-09-05","2026-10-05"]);
  definirRelogio(()=>new Date(2026,8,27,12));
  integro(L); }

g("Relatórios — todos leem o mesmo livro");
{ const {L,a}=base(); const res=novoId(ex(L,C.criarConta(L,{nome:"Reserva",tipo:"RESERVA"},{dataAbertura:"2026-09-01"})),"contas");
  const sal=[...L.categorias.values()].find(c=>c.nome==="Salário").id, mer=[...L.categorias.values()].find(c=>c.nome==="Mercado").id;
  ex(L,C.criarDocumento(L,{tipo:"RECEBER",descricao:"Salário",valor:R(5000),data:"2026-09-05",categoria:sal,quitar:{data:"2026-09-05",conta:a}}));
  ex(L,C.criarDocumento(L,{tipo:"PAGAR",descricao:"Mercado",valor:R(800),data:"2026-09-06",categoria:mer,quitar:{data:"2026-09-06",conta:a}}));
  ex(L,C.criarTransferencia(L,{de:a,para:res,valor:R(1000),data:"2026-09-07"}));
  ex(L,C.criarDocumento(L,{tipo:"PAGAR",descricao:"Internet",valor:R(100),data:"2026-09-20",primeiroVencimento:"2026-09-30"}));
  ex(L,C.criarDocumento(L,{tipo:"RECEBER",descricao:"Freela",valor:R(300),data:"2026-09-20",primeiroVencimento:"2026-10-10"}));
  const fc=Rel.fluxoDeCaixa(L,{de:"2026-09-01",ate:"2026-09-30"})[0];
  t("fluxo: saldo inicial não é entrada — só o salário", fc.entradas, R(5000));
  t("mas o saldo inicial do mês parte dele", fc.saldoInicial, 0);
  t("saídas 800, para reservas 1.000", [fc.saidas,fc.paraReservas], [R(800),R(1000)]);
  t("saldo final do fluxo = saldo disponível", fc.saldoFinal, L.saldoDisponivel("2026-09-30"));
  const prev=Rel.saldoPrevistoDoMes(L);
  t("previsto do mês: 4.200 − 100 de internet", prev.final, R(4100));
  const raz=Rel.razao(L,"A:"+a,{de:"2026-09-06"});
  t("razão: saldo anterior de 6.000", raz.anterior, R(6000));
  t("última linha do razão = saldo da conta", raz.linhas.at(-1).saldo, L.saldoConta(a));
  const r=Rel.resultado(L,{de:"2026-09-01",ate:"2026-09-30"});
  t("competência: receitas 5.300, despesas 900", [r.receitas,r.despesas], [R(5300),R(900)]);
  const pat=Rel.patrimonio(L);
  t("patrimônio = contas + a receber − a pagar", pat.liquido, R(4200)+R(1000)+R(300)-R(100));
  const f=Rel.faixas(L,"PAGAR");
  t("a pagar em 7 dias: internet", [f.total,f.sete], [R(100),R(100)]);
  t("busca por número", buscar(L,"AP-000002")[0].itens[0].titulo.startsWith("AP-000002"), true);
  t("busca por valor", buscar(L,"800")[0].itens.some(i=>/Mercado/.test(i.titulo)), true);
  integro(L); }

fim();
