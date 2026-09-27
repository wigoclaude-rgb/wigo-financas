/* ══════════ MODELO DO WIGO 3 ══════════
   Cinco coisas diferentes, que no 2.2 eram um registro só:

   DOCUMENTO   a operação: "comprei R$ 600 no mercado em 3x no cartão"
   PARCELA     cada obrigação dentro dele: 1/3, 2/3, 3/3 (vivem no documento)
   PAGAMENTO   a liquidação: "paguei a fatura com R$ 1.000 do Nubank"
   LANÇAMENTO  o impacto contábil, em partidas dobradas (a soma das linhas é 0)
   CONCILIAÇÃO a confirmação contra o extrato do banco

   Nomes em português, como o resto do código. Equivalência com a
   especificação: PAYABLE=PAGAR, RECEIVABLE=RECEBER, CARD_PURCHASE=
   COMPRA_CARTAO, CARD_REFUND=ESTORNO_CARTAO, TRANSFER=TRANSFERENCIA,
   ADJUSTMENT=AJUSTE, OPENING_BALANCE=ABERTURA. */

export const DOC={ PAGAR:"PAGAR", RECEBER:"RECEBER", COMPRA:"COMPRA_CARTAO",
  ESTORNO_CARTAO:"ESTORNO_CARTAO", TRANSF:"TRANSFERENCIA", AJUSTE:"AJUSTE", ABERTURA:"ABERTURA" };

export const PREFIXO={ PAGAR:"AP", RECEBER:"AR", COMPRA_CARTAO:"CP", ESTORNO_CARTAO:"CR",
  TRANSFERENCIA:"TRF", AJUSTE:"ADJ", ABERTURA:"AB", SAIDA:"PAY", ENTRADA:"REC" };

export const ROTULO_DOC={ PAGAR:"Conta a pagar", RECEBER:"Conta a receber",
  COMPRA_CARTAO:"Compra no cartão", ESTORNO_CARTAO:"Estorno no cartão",
  TRANSFERENCIA:"Transferência", AJUSTE:"Ajuste de saldo", ABERTURA:"Saldo inicial" };

/* documentos que geram obrigação com parcelas; os outros são movimento direto */
export const COM_PARCELAS=new Set([DOC.PAGAR,DOC.RECEBER,DOC.COMPRA,DOC.ESTORNO_CARTAO]);
export const DO_CARTAO=new Set([DOC.COMPRA,DOC.ESTORNO_CARTAO]);

export const TIPO_CONTA={ BANCO:"Conta bancária", DINHEIRO:"Dinheiro", CARTEIRA:"Carteira digital",
  RESERVA:"Reserva / investimento", BENEFICIO:"Vale / benefício", OUTRA:"Outra" };
/* Dinheiro que dá para gastar hoje. Reserva é patrimônio mas não é caixa do
   mês, e o vale só paga o que o vale aceita — os dois ficam fora do
   "disponível", como a poupança e o ticket ficavam fora do saldo no 2.2. */
export const DISPONIVEL=new Set(["BANCO","DINHEIRO","CARTEIRA","OUTRA"]);

export const FORMAS={ pix:"Pix", transferencia:"Transferência", boleto:"Boleto", debito:"Débito",
  dinheiro:"Dinheiro", beneficio:"Vale / benefício", cartao:"Cartão de crédito", outro:"Outro" };
export const TIPO_PN={ PESSOA:"Pessoa", CLIENTE:"Cliente", FORNECEDOR:"Fornecedor",
  AMBOS:"Cliente e fornecedor", OUTRO:"Outro" };

export const ST={ ABERTA:"ABERTA", PARCIAL:"PARCIAL", PAGA:"PAGA", VENCIDA:"VENCIDA",
  CANCELADA:"CANCELADA", EFETIVADA:"EFETIVADA", PLANEJADA:"PLANEJADA" };
export const ROTULO_ST={ ABERTA:"Em aberto", PARCIAL:"Parcial", PAGA:"Paga", VENCIDA:"Vencida",
  CANCELADA:"Cancelada", EFETIVADA:"Efetivada", PLANEJADA:"Planejada" };

/* ── Contas do razão ──
   Cada linha de lançamento aponta para uma "chave":
     A:<conta>     dinheiro numa conta (ativo)
     C:<cartão>    o que se deve ao cartão (passivo)
     P:<pn>        contas a pagar a um parceiro (passivo)
     R:<pn>        contas a receber de um parceiro (ativo)
     E:<categoria> despesa · I:<categoria> receita
     Q:abertura    contrapartida do saldo inicial
     X:ajuste      contrapartida de ajuste de saldo
   Convenção: valor positivo = débito. Ativo e despesa crescem com positivo;
   passivo e receita, com negativo. Todo lançamento soma zero. */
export const K={
  conta:id=>"A:"+id, cartao:id=>"C:"+id,
  pagar:pn=>"P:"+(pn||"-"), receber:pn=>"R:"+(pn||"-"),
  despesa:c=>"E:"+(c||"-"), receita:c=>"I:"+(c||"-"),
  ABERTURA:"Q:abertura", AJUSTE:"X:ajuste",
  JUROS_PAGOS:"E:#juros", DESCONTO_OBTIDO:"I:#desconto",
  JUROS_RECEBIDOS:"I:#juros", DESCONTO_CONCEDIDO:"E:#desconto"
};
export const tipoChave=k=>k.slice(0,1);
export const idChave=k=>k.slice(2);
export const CATEGORIA_SISTEMA={ "#juros":"Juros e multas", "#desconto":"Descontos", "-":"Sem categoria" };

/* Ponto de partida para quem começa do zero, em dois níveis: a categoria
   (Alimentação) e as subcategorias (Mercado, Restaurantes…). Conta nova já
   nasce com elas; Cadastros → Categorias acrescenta as que faltarem. O
   usuário arquiva o que não usa — arquivar não apaga histórico. */
export const CATEGORIAS_SUGERIDAS={
  DESPESA:[
    ["Moradia",["Aluguel","Condomínio","Contas de Casa","Internet/Telefone","Manutenção/Reparos"]],
    ["Alimentação",["Mercado","Restaurantes/Delivery","Padaria/Lanches"]],
    ["Transporte",["Combustível","Aplicativo/Táxi","Transporte público","Veículo","Estacionamento/Pedágio"]],
    ["Saúde",["Plano de saúde","Consultas/Exames","Farmácia","Academia/Esportes"]],
    ["Educação",["Escola/Faculdade","Cursos","Livros/Material"]],
    ["Família",["Filhos","Pets"]],
    ["Cuidados pessoais",["Vestuário","Beleza/Cuidados"]],
    ["Lazer",["Passeios","Viagens","Assinaturas"]],
    ["Compras",["Tecnologia","Casa/Decoração","Presentes"]],
    ["Financeiro",["Tarifas Bancárias","Impostos/Taxas","Seguros","Empréstimos/Dívidas","Investimentos"]],
    ["Outros",[]]],
  RECEITA:[
    ["Trabalho",["Salário","Pró-labore","Freelance","Comissões","13º/Férias/Bônus"]],
    ["Negócios",["Vendas","Serviços"]],
    ["Investimentos",["Rendimentos","Aluguel Recebido"]],
    ["Outras receitas",["Reembolso","Presentes recebidos","Outros"]]]
};

export class ErroFinanceiro extends Error{
  constructor(msg,detalhe){ super(msg); this.name="ErroFinanceiro"; this.detalhe=detalhe; }
}
