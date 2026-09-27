/* Testes de leitura e parsing de extrato — os mesmos do WIGO 2.2, agora
   contra o módulo js/importacao/leitura.js. Os grupos que dependiam do estado
   antigo (S.tx, pré-lançamento) foram substituídos pelos de analise.test.mjs.
   Rodar: node tests/leitura.test.mjs */
import * as M from "../js/importacao/leitura.js";
const { detectarFormatoArquivo, detectarEncodingCSV, normalizarTextoImportacao, normalizarValorImportacao,
  normalizarDataImportacao, parseOFX, detectarSeparadorCSV, parseCSV, detectarColunasCSV, limparDescricaoImportacao,
  pareceLinhaDeDados, acharCabecalhoCSV, mapearCSV, gerarHashImportacao, numeroParcela, mesmaParcela,
  compararDescricoesImportacao, sugerirTipoImportacao, sinalFatura, ehPagamentoFatura, sugerirMetodoImportacao,
  ehLinhaDeSaldo, normalizarMovimentacaoImportada, lerTabelaHTML, IMP_COLS } = M;
const EXP=["Alimentação","Mercado","Restaurantes/Delivery","Transporte","Combustível","Moradia","Aluguel","Contas de Casa","Internet/Telefone","Assinaturas","Saúde","Farmácia","Educação","Cursos","Lazer","Viagens","Vestuário","Beleza/Cuidados","Pets","Presentes/Doações","Impostos/Taxas","Tarifas Bancárias","Empréstimos/Dívidas","Investimentos","Manutenção/Reparos","Tecnologia","Academia/Esportes","Outros"];
const INC=["Salário","Aulas","Freelance","Vendas","Comissões","Rendimentos","Reembolso","Aluguel Recebido","Presente","Outros"];
const sugerirCategoriaImportacao=(d,tipo)=>M.sugerirCategoriaImportacao(d,tipo,tipo==="inc"?INC:EXP);
let ok=0, fail=0;
const t=(nome,real,esp)=>{
  const a=JSON.stringify(real), b=JSON.stringify(esp);
  if(a===b){ ok++; } else { fail++; console.log("  FALHOU "+nome+"\n    esperado: "+b+"\n    obtido:   "+a); }
};
const g=(nome,fn)=>{ console.log("\n— "+nome); fn(); };

g("normalizarValorImportacao (§10)",()=>{
  t("1.234,56", normalizarValorImportacao("1.234,56"), 1234.56);
  t("1234,56", normalizarValorImportacao("1234,56"), 1234.56);
  t("1234.56", normalizarValorImportacao("1234.56"), 1234.56);
  t("-1.234,56", normalizarValorImportacao("-1.234,56"), -1234.56);
  t("R$ 1.234,56", normalizarValorImportacao("R$ 1.234,56"), 1234.56);
  t("1.234 (milhar)", normalizarValorImportacao("1.234"), 1234);
  t("1.234.567,89", normalizarValorImportacao("1.234.567,89"), 1234567.89);
  t("1,234.56 (US)", normalizarValorImportacao("1,234.56"), 1234.56);
  t("150", normalizarValorImportacao("150"), 150);
  t("150,00 D", normalizarValorImportacao("150,00 D"), -150);
  t("150,00 C", normalizarValorImportacao("150,00 C"), 150);
  t("(150,00)", normalizarValorImportacao("(150,00)"), -150);
  t("numero cru", normalizarValorImportacao(-150.5), -150.5);
  t("vazio -> NaN", isNaN(normalizarValorImportacao("")), true);
  t("texto -> NaN", isNaN(normalizarValorImportacao("saldo")), true);
  t("nunca string", typeof normalizarValorImportacao("1.234,56"), "number");
});

g("normalizarDataImportacao (§6)",()=>{
  t("OFX c/ tz", normalizarDataImportacao("20260908120000[-03:BRT]"), "2026-09-08");
  t("OFX curto", normalizarDataImportacao("20260908"), "2026-09-08");
  t("BR", normalizarDataImportacao("08/09/2026"), "2026-09-08");
  t("BR hifen", normalizarDataImportacao("08-09-2026"), "2026-09-08");
  t("BR 2 digitos", normalizarDataImportacao("08/09/26"), "2026-09-08");
  t("ISO", normalizarDataImportacao("2026-09-08"), "2026-09-08");
  t("dia>12 continua dd/mm", normalizarDataImportacao("25/12/2026"), "2026-12-25");
  t("mm/dd corrigido", normalizarDataImportacao("09/25/2026"), "2026-09-25");
  t("31/02 invalida", normalizarDataImportacao("31/02/2026"), null);
  t("lixo", normalizarDataImportacao("ontem"), null);
  t("vazio", normalizarDataImportacao(""), null);
});

g("parseCSV + separador (§7)",()=>{
  t("sep ;", detectarSeparadorCSV("Data;Historico;Valor\n01/01/2026;X;1,00"), ";");
  t("sep ,", detectarSeparadorCSV("Data,Historico,Valor\n01/01/2026,X,1.00"), ",");
  t("sep tab", detectarSeparadorCSV("Data\tHistorico\tValor\n01/01/2026\tX\t1,00"), "\t");
  t("empate -> ;", detectarSeparadorCSV("a;b\nc;d"), ";");
  t("aspas com sep dentro",
    parseCSV('Data;Desc;Valor\n01/01/2026;"PADARIA; LTDA";-10,00',";")[1],
    ["01/01/2026","PADARIA; LTDA","-10,00"]);
  t("aspas escapadas", parseCSV('a;b\n"diz ""oi""";2',";")[1], ['diz "oi"',"2"]);
  t("quebra dentro de aspas", parseCSV('a;b\n"linha\nquebrada";2',";").length, 2);
  t("BOM removido", parseCSV("﻿Data;Valor\n01/01/2026;1,00",";")[0], ["Data","Valor"]);
  t("linha vazia ignorada", parseCSV("a;b\n\n1;2\n",";").length, 2);
});

g("detectarColunasCSV (§8)",()=>{
  let c=detectarColunasCSV(["Data","Histórico","Valor"]);
  t("basico", [c.data,c.desc,c.valor,c.confiavel], [0,1,2,true]);
  c=detectarColunasCSV(["Data Lançamento","Descrição","Débito","Crédito"]);
  t("debito/credito", [c.data,c.desc,c.debito,c.credito,c.valor,c.confiavel], [0,1,2,3,null,true]);
  c=detectarColunasCSV(["dt","memo","amount"]);
  t("ingles", [c.data,c.desc,c.valor,c.confiavel], [0,1,2,true]);
  c=detectarColunasCSV(["Data","Histórico","Valor","Tipo"]);
  t("coluna tipo", c.tipo, 3);
  c=detectarColunasCSV(["col1","col2","col3"]);
  t("ambiguo nao confiavel", c.confiavel, false);
  c=detectarColunasCSV(["Data","Histórico","Valor Débito","Valor Crédito"]);
  t("valor nao rouba debito", c.valor, null);
});

g("mapearCSV (§11)",()=>{
  let c=detectarColunasCSV(["Data","Histórico","Valor"]);
  let m=mapearCSV([["08/09/2026","PIX MERCADO X","-150,00"],["05/09/2026","SALARIO","3.500,00"]],c);
  t("valor unico", m.map(x=>[x.data,x.amount]), [["2026-09-08",-150],["2026-09-05",3500]]);
  c=detectarColunasCSV(["Data","Descrição","Débito","Crédito"]);
  m=mapearCSV([["08/09/2026","MERCADO","150,00",""],["05/09/2026","SALARIO","","3.500,00"]],c);
  t("debito/credito", m.map(x=>x.amount), [-150,3500]);
  c=detectarColunasCSV(["Data","Histórico","Valor","Tipo"]);
  m=mapearCSV([["08/09/2026","MERCADO","150,00","D"],["05/09/2026","SALARIO","3500,00","C"]],c);
  t("coluna D/C manda no sinal", m.map(x=>x.amount), [-150,3500]);
  c=detectarColunasCSV(["Data","Histórico","Valor"]);
  m=mapearCSV([["xx","SEM DATA","10,00"],["08/09/2026","SEM VALOR","abc"]],c);
  t("linha ruim nao explode", [m[0].data,isNaN(m[1].amount)], [null,true]);
});

g("parseOFX (§6)",()=>{
  const sgml=`OFXHEADER:100
<OFX><BANKMSGSRSV1><STMTTRNRS><STMTRS><BANKTRANLIST>
<STMTTRN><TRNTYPE>DEBIT<DTPOSTED>20260908120000[-03:BRT]<TRNAMT>-150.50
<FITID>2026090801<NAME>MERCADO X<MEMO>COMPRA CARTAO DEBITO MERCADO X</STMTTRN>
<STMTTRN><TRNTYPE>CREDIT<DTPOSTED>20260905000000<TRNAMT>3500.00
<FITID>2026090502<NAME>SALARIO</STMTTRN>
</BANKTRANLIST></STMTRS></STMTTRNRS></BANKMSGSRSV1></OFX>`;
  let r=parseOFX(sgml);
  t("2 movimentacoes", r.movs.length, 2);
  t("data sem hora/tz", r.movs[0].data, "2026-09-08");
  t("valor negativo", r.movs[0].amount, -150.5);
  t("fitid", r.movs[0].fitid, "2026090801");
  t("MEMO contem NAME -> so MEMO", r.movs[0].desc, "COMPRA CARTAO DEBITO MERCADO X");
  t("so NAME", r.movs[1].desc, "SALARIO");
  const xml=`<OFX><STMTTRN><TRNTYPE>DEBIT</TRNTYPE><DTPOSTED>20260910</DTPOSTED><TRNAMT>-20.00</TRNAMT><FITID>9</FITID><NAME>UBER</NAME><MEMO>VIAGEM CENTRO</MEMO></STMTTRN></OFX>`;
  r=parseOFX(xml);
  t("XML fechado", [r.movs[0].data,r.movs[0].amount], ["2026-09-10",-20]);
  t("NAME+MEMO distintos combinam", r.movs[0].desc, "UBER · VIAGEM CENTRO");
  t("arquivo invalido", parseOFX("isso nao e ofx").erro, "ofx");
  t("sem TRNTYPE/NAME cai no fallback",
    parseOFX("<STMTTRN><DTPOSTED>20260101<TRNAMT>1.00</STMTTRN>").movs[0].desc, "Movimentação");
});

g("inteligencia (§11,12,13)",()=>{
  t("tipo por sinal", [sugerirTipoImportacao({amount:-1}),sugerirTipoImportacao({amount:1})], ["exp","inc"]);
  t("pix", sugerirMetodoImportacao("PIX ENVIADO JOAO"), "pix");
  t("ted", sugerirMetodoImportacao("TED RECEBIDA"), "transferencia");
  t("transferencia", sugerirMetodoImportacao("TRANSFERÊNCIA ENTRE CONTAS"), "transferencia");
  t("boleto", sugerirMetodoImportacao("PAGAMENTO BOLETO 001"), "boleto");
  t("default debito", sugerirMetodoImportacao("COMPRA QUALQUER"), "debito");
  t("nunca cartao", [ "COMPRA CARTAO DE CREDITO","CARTAO DE DEBITO" ].map(sugerirMetodoImportacao)
    .every(m=>m!=="cartao"), true);
  t("cat ifood", sugerirCategoriaImportacao("IFOOD *PIZZARIA","exp"), "Restaurantes/Delivery");
  t("cat posto", sugerirCategoriaImportacao("POSTO IPIRANGA","exp"), "Combustível");
  t("cat farmacia", sugerirCategoriaImportacao("DROGARIA PACHECO","exp"), "Farmácia");
  t("cat netflix", sugerirCategoriaImportacao("NETFLIX.COM","exp"), "Assinaturas");
  t("cat salario (inc)", sugerirCategoriaImportacao("CREDITO SALARIO","inc"), "Salário");
  t("sem match -> vazio", sugerirCategoriaImportacao("ZZZ QUALQUER COISA","exp"), "");
  t("so sugere categoria existente",
    M.sugerirCategoriaImportacao("IFOOD *PIZZARIA","exp",["Outros"]), "");
  t("hash determinista", gerarHashImportacao("a|b|c")===gerarHashImportacao("a|b|c"), true);
  t("hash diferente", gerarHashImportacao("a")===gerarHashImportacao("b"), false);
  t("desc igual", compararDescricoesImportacao("PIX MERCADO X","pix mercado x"), true);
  t("desc contida", compararDescricoesImportacao("PIX ENVIADO MERCADO X","PIX MERCADO X"), true);
  t("desc diferente", compararDescricoesImportacao("PIX MERCADO X","TED JOAO SILVA"), false);
});

g("formato pelos bytes, nao pela extensao",()=>{
  const bytes=str=>new TextEncoder().encode(str);
  const comMagic=(...xs)=>{ const b=new Uint8Array(600); xs.forEach((x,i)=>b[i]=x); return b; };
  t("PDF pelos magic bytes", detectarFormatoArquivo("extrato.csv",comMagic(0x25,0x50,0x44,0x46)), "pdf");
  t("PDF pela extensao tambem", detectarFormatoArquivo("extrato.pdf",bytes("qualquer coisa")), "pdf");
  t("xlsx e ZIP", detectarFormatoArquivo("planilha.xlsx",comMagic(0x50,0x4b,0x03,0x04)), "xlsx");
  t("xlsx mesmo com extensao .xls", detectarFormatoArquivo("extrato.xls",comMagic(0x50,0x4b,0x03,0x04)), "xlsx");
  t("xls antigo e OLE2", detectarFormatoArquivo("extrato.xls",comMagic(0xd0,0xcf,0x11,0xe0)), "xls-antigo");
  t("html disfarcado de xls",
    detectarFormatoArquivo("extrato.xls",bytes("<html><body><table><tr><td>1</td></tr></table>")), "html");
  t("ofx pela extensao", detectarFormatoArquivo("extrato.ofx",bytes("")), "ofx");
  t("ofx pelo conteudo", detectarFormatoArquivo("arquivo",bytes("OFXHEADER:100")), "ofx");
  t("csv pela extensao", detectarFormatoArquivo("extrato.csv",bytes("Data;Valor")), "csv");
  t("xls texto cai em csv", detectarFormatoArquivo("extrato.xls",bytes("Data;Valor\n01/01/2026;1,00")), "csv");
  t("desconhecido", detectarFormatoArquivo("foto.png",comMagic(0x89,0x50,0x4e,0x47)), null);
});

g("encoding",()=>{
  const utf8=new TextEncoder().encode("ALIMENTAÇÃO");
  t("utf-8", detectarEncodingCSV(utf8), {texto:"ALIMENTAÇÃO",encoding:"UTF-8"});
  const w1252=new Uint8Array([0x41,0x4c,0x49,0x4d,0x45,0x4e,0x54,0x41,0xc7,0xc3,0x4f]);
  t("windows-1252", detectarEncodingCSV(w1252), {texto:"ALIMENTAÇÃO",encoding:"Windows-1252"});
});

g("data serial de planilha",()=>{
  t("46209 = 06/07/2026", normalizarDataImportacao("46209"), "2026-07-06");
  t("46223 = 20/07/2026", normalizarDataImportacao("46223"), "2026-07-20");
  t("com fracao de hora", normalizarDataImportacao("46209.25"), "2026-07-06");
  t("numero fora da faixa nao vira data", normalizarDataImportacao("12345"), null);
  t("valor grande nao vira data", normalizarDataImportacao("99999"), null);
  t("limites da faixa", [normalizarDataImportacao("20000"),normalizarDataImportacao("59998")], ["1954-10-03","2064-04-06"]);
  t("texto de data continua funcionando", normalizarDataImportacao("06/07/2026"), "2026-07-06");
  t("ISO continua", normalizarDataImportacao("2026-07-06"), "2026-07-06");
});

g("extrato com preambulo antes do cabecalho",()=>{
  const bruto=[["Banco Exemplo S.A."],["Extrato de conta corrente"],
    ["Agencia: 0001  Conta: 12345-6"],["Periodo: 01/09/2026 a 30/09/2026"],[""],
    ["Data","Historico","Valor"],
    ["08/09/2026","PIX MERCADO X","-150,00"],["05/09/2026","SALARIO","3.500,00"]];
  const cab=acharCabecalhoCSV(bruto);
  t("acha a linha do cabecalho, nao a primeira", cab.idx, 5);
  t("e detecta as colunas dali", [cab.cols.data,cab.cols.desc,cab.cols.valor,cab.cols.confiavel], [0,1,2,true]);
  const movs=mapearCSV(bruto.slice(cab.idx+1),cab.cols);
  t("le so as linhas de dados", movs.length, 2);
  t("valores certos", movs.map(m=>[m.data,m.amount]), [["2026-09-08",-150],["2026-09-05",3500]]);
  t("sem preambulo continua na linha 0",
    acharCabecalhoCSV([["Data","Historico","Valor"],["01/01/2026","X","1,00"]]).idx, 0);
  const cego=acharCabecalhoCSV([["Relatorio"],["col1","col2","col3","col4"],["a","b","c","d"]]);
  t("sem cabecalho reconhecivel, pega a linha mais preenchida", cego.idx, 1);
  t("e cai no mapeamento manual", cego.cols.confiavel, false);
});

g("separador sobrevive ao preambulo",()=>{
  const comPreambulo="Extrato de conta corrente\nPeriodo: 01/09 a 30/09\nData,Historico,Valor\n08/09/2026,PIX,-150.00\n05/09/2026,SALARIO,3500.00";
  t("virgula achada apesar do preambulo", detectarSeparadorCSV(comPreambulo), ",");
  const pv="Banco X\nAgencia 0001\nData;Historico;Valor\n08/09/2026;PIX;-150,00";
  t("ponto e virgula achado apesar do preambulo", detectarSeparadorCSV(pv), ";");
  t("tab com preambulo", detectarSeparadorCSV("Extrato\nData\tHist\tValor\n01/01/2026\tX\t1,00"), "\t");
  t("descricao com virgula nao rouba o separador",
    detectarSeparadorCSV("Data;Historico;Valor\n08/09/2026;LOJA A, B E C;-1,00\n07/09/2026;OUTRA;-2,00"), ";");
});

g("sinal da fatura e pagamento da fatura",()=>{
  const compraPos=[{amount:150},{amount:89},{amount:12},{amount:-500}];
  t("Nubank: compra positiva manda", sinalFatura(compraPos), 1);
  const compraNeg=[{amount:-150},{amount:-89},{amount:-12},{amount:500}];
  t("OFX de cartao: compra negativa manda", sinalFatura(compraNeg), -1);
  t("sinal 1: positivo e despesa", sugerirTipoImportacao({amount:150},1), "exp");
  t("sinal 1: negativo e credito", sugerirTipoImportacao({amount:-500},1), "inc");
  t("sinal -1: negativo e despesa", sugerirTipoImportacao({amount:-150},-1), "exp");
  t("sinal -1: positivo e credito", sugerirTipoImportacao({amount:500},-1), "inc");
  t("conta (sem sinal) segue a regra antiga",
    [sugerirTipoImportacao({amount:-1}),sugerirTipoImportacao({amount:1})], ["exp","inc"]);
  t("pagamento reconhecido", ["PAGAMENTO RECEBIDO","PGTO FATURA","Pagto. Fatura"].map(ehPagamentoFatura), [true,true,true]);
  t("compra nao e pagamento", ["MERCADO X","IFOOD"].map(ehPagamentoFatura), [false,false]);
});

g("cabecalhos de fintech em ingles",()=>{
  let c=detectarColunasCSV(["date","title","amount"]);
  t("fatura do Nubank", [c.data,c.desc,c.valor,c.confiavel], [0,1,2,true]);
  c=detectarColunasCSV(["Date","Description","Value"]);
  t("variante em ingles", c.confiavel, true);
  c=detectarColunasCSV(["Data","Estabelecimento","Valor"]);
  t("fatura em portugues", c.confiavel, true);
});

g("descricao de Pix vira algo legivel",()=>{
  const pix="Transferência enviada pelo Pix - HINOVA PAYMENTS - 27.970.567/0001-47 - ITAÚ UNIBANCO S.A. (0341) Agência: 937 Conta: 50089-0";
  t("Pix enviado", limparDescricaoImportacao(pix), "Pix enviado · HINOVA PAYMENTS");
  t("Pix recebido", limparDescricaoImportacao(
    "Transferência recebida pelo Pix - FULANO DA SILVA - •••.694.704-•• - BCO DO BRASIL S.A. (0001) Agência: 1838 Conta: 73545-0"),
    "Pix recebido · FULANO DA SILVA");
  t("transferencia sem Pix", limparDescricaoImportacao(
    "Transferência Recebida - Jose Felipe - •••.725.934-•• - NU PAGAMENTOS - IP (0260) Agência: 1"),
    "Transferência recebida · Jose Felipe");
  t("descricao curta passa intacta", limparDescricaoImportacao("Pagamento de fatura"), "Pagamento de fatura");
  t("sem a estrutura passa intacta", limparDescricaoImportacao("IFOOD *PIZZARIA"), "IFOOD *PIZZARIA");
  t("dois tracos so nao mexe", limparDescricaoImportacao("COMPRA - LOJA X"), "COMPRA - LOJA X");
  t("segunda parte que nao e nome nao vira titulo",
    limparDescricaoImportacao("REF - 12345678 - 99999"), "REF - 12345678 - 99999");
  t("nao explode com vazio", limparDescricaoImportacao(""), "");
  t("corta o ruido", limparDescricaoImportacao(pix).length<40, true);
});

g("limpeza de descricao nao come a parcela",()=>{
  t("fatura mantem a parcela",
    limparDescricaoImportacao("Mercado Livre - CUECAS DE JORGINHO - Parcela 1/2"),
    "Mercado Livre - CUECAS DE JORGINHO - Parcela 1/2");
  t("Pix no credito da fatura mantem a parcela",
    limparDescricaoImportacao("Pix no Crédito - Fulano de Tal - 2/2"),
    "Pix no Crédito - Fulano de Tal - 2/2");
  t("mas extrato com CPF continua encurtando",
    limparDescricaoImportacao("Transferência enviada pelo Pix - FULANO - •••.694.704-•• - BCO DO BRASIL S.A. (0001) Agência: 1838"),
    "Pix enviado · FULANO");
  t("com CNPJ tambem",
    limparDescricaoImportacao("Transferência enviada pelo Pix - LOJA X - 27.970.567/0001-47 - ITAÚ (0341) Agência: 937 Conta: 50089-0"),
    "Pix enviado · LOJA X");
  t("com Conta: mas sem documento tambem",
    limparDescricaoImportacao("Transferência Recebida - Jose Felipe - NU PAGAMENTOS - IP (0260) Agência: 1 Conta: 16815306-4"),
    "Transferência recebida · Jose Felipe");
});

g("valor da fatura do Nubank",()=>{
  t("aspas com virgula decimal", normalizarValorImportacao("80,28"), 80.28);
  t("negativo com espaco depois do sinal", normalizarValorImportacao("- 2.798,32"), -2798.32);
  t("milhar e decimal juntos", normalizarValorImportacao("2.798,32"), 2798.32);
  t("csv com aspas no valor",
    parseCSV('date,title,amount\n2026-09-09,Domino\'S Setubal,"80,28"',",")[1],
    ["2026-09-09","Domino'S Setubal","80,28"]);
  t("virgula dentro de aspas nao quebra a linha",
    parseCSV('date,title,amount\n2026-09-04,Pagamento recebido,"- 2.798,32"',",")[1].length, 3);
});

g("Mercado Livre nao e supermercado",()=>{
  t("marketplace nao vira Mercado", sugerirCategoriaImportacao("Mercado Livre - CUECAS - Parcela 1/2","exp"), "");
  t("Mercado Pago tambem nao", sugerirCategoriaImportacao("Mercado Pago *LOJA","exp"), "");
  t("supermercado de verdade continua", sugerirCategoriaImportacao("Recibom Supermercados","exp"), "Mercado");
  t("burguer entra em delivery", sugerirCategoriaImportacao("Deus Burguer.","exp"), "Restaurantes/Delivery");
  t("99food entra em delivery", sugerirCategoriaImportacao("99food *M e Lanchonet","exp"), "Restaurantes/Delivery");
  t("99app continua transporte", sugerirCategoriaImportacao("99app *99app","exp"), "Transporte");
});

g("CSV sem cabecalho nao perde a primeira transacao",()=>{
  const bruto=parseCSV("01/09/2026;PIX ENVIADO JOAO;-150,00\n02/09/2026;SALARIO;3.500,00",";");
  const cab=acharCabecalhoCSV(bruto);
  t("marca que nao ha cabecalho", cab.semCabecalho, true);
  t("idx -1 faz o slice comecar do zero", cab.idx, -1);
  t("as duas linhas sao dados", bruto.slice(cab.idx+1).length, 2);
  t("cai no mapeamento manual", cab.cols.confiavel, false);
  const cols={data:0,desc:1,valor:2,debito:null,credito:null,tipo:null,id:null};
  const movs=mapearCSV(bruto.slice(cab.idx+1),cols);
  t("mapeadas as duas", movs.map(m=>m.amount), [-150,3500]);
  t("com cabecalho de verdade continua em 0",
    acharCabecalhoCSV(parseCSV("Data;Historico;Valor\n01/01/2026;X;1,00",";")).idx, 0);
  t("pareceLinhaDeDados exige data E valor",
    [pareceLinhaDeDados(["01/09/2026","X","-150,00"]),pareceLinhaDeDados(["Data","Historico","Valor"])], [true,false]);
});


console.log("\n══════════════════════════════");
console.log(ok+" passaram, "+fail+" falharam");
if(fail) process.exitCode=1;
