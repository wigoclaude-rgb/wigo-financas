# Auditoria do WIGO 2.2 (antes da reconstrução)

Feita em 27/09/2026 sobre `index.html` (6.442 linhas, commit `be0ef58`). O objetivo
foi achar todo ponto onde dinheiro nasce, muda de lugar ou some — e onde duas
telas podem discordar sobre o mesmo número.

## Como o 2.2 guarda os dados

- Um documento por usuário: `users/{uid} = { data: JSON.stringify(S) }`.
- `save()` regrava o **estado inteiro** a cada alteração (debounce de 700 ms).
- Não há transação, nem controle de concorrência: dois aparelhos abertos ⇒ o
  último a salvar apaga o que o outro fez.
- O Firestore limita um documento a 1 MiB. Com ~300 bytes por lançamento, o app
  para de salvar por volta de 3.000 lançamentos — e o erro aparece só como
  "erro ao salvar", com a memória já divergindo do servidor.

## O registro central faz quatro papéis

`S.tx[]` é ao mesmo tempo **documento, parcela, pagamento e movimento de caixa**.
`paid`, `payDate`, `payAmt` e `accId` vivem na própria parcela. Consequências:

| Problema | Onde |
|---|---|
| Pagamento não existe como coisa: não há como pagar 3 contas com um Pix só e manter o vínculo | `applyPaid` |
| Pagamento parcial é impossível: `payAmt` menor **quita** a parcela (vira desconto) | `applyPaid`, `fPaid` |
| Desfazer um pagamento apaga o histórico, sem rastro | `undoPaid` (`tx-unpaid`, `card-unpay`, troca de tipo) |
| Editar data/valor de algo pago reescreve o passado do saldo | `fEdit` (`edPayDate`, `edPayAmt`, `edAcc`) |
| Excluir um lançamento pago muda saldos de meses já conferidos | `markDeleted` (lixeira) |
| Trocar o tipo de um grupo desfaz pagamentos e recria tudo | `fEdit` com `edKind` |

## Todos os pontos que alteram saldo

`applyPaid` (Pagar da lista, baixa em lote da Início, baixa da Consulta, baixa por
pessoa, pagar fatura), `undoPaid`, `createTx` com "já pago", criação de
transferência (`fXfer`), confirmação da importação (nasce `paid:true`), edição
(`fEdit`), lixeira, `migraContas`/`adotaOrfaos` (reatribuem conta de histórico),
`acc-delete` (zera `accId`/`accTo` do histórico).

**Risco grave em `acc-delete`:** zerar `accTo` de uma transferência deixa só uma
perna — o dinheiro some de uma conta sem aparecer em outra.

## Cálculos paralelos do mesmo número

| Número | Função | Regra de mês |
|---|---|---|
| Saldo do topo | `cashFlow` | `cashMonth` (data de pagamento) |
| Saldo por conta | `cashFlow(mk, acc)` | idem, mas abertura por conta |
| Saldo da pessoa | `pesFlow`, `pesRazao` | nenhuma (tudo) |
| Análise | `monthAgg` | `effMonth` = competência **ou** data de pagamento **ou** vencimento |
| Limite do cartão | `cardUsed` | depende do **mês que está na tela** (fixo só conta até `viewMonth`) |
| Saldo do vale | `ticketBalance` | zera todo mês |
| Metas | `goalBalance` | `goal.moves`, fonte separada de `tx` |

`effMonth` mistura competência e caixa: um lançamento pago sem competência passa a
"pertencer" ao mês do pagamento. O limite do cartão muda conforme o mês exibido.
A meta tem duas fontes de verdade (`goal.moves` e o lançamento de poupança),
sincronizadas à mão em três lugares.

## Saldo inicial

`opening = { amount, month }` por conta. Tudo que foi pago **antes** do mês de
abertura é ignorado em silêncio. Não é um evento: editar a abertura muda todos os
saldos desde então sem deixar rastro.

## Cartão

A compra é gravada como N lançamentos com `due` = vencimento da fatura; a data da
compra não é guardada. A fatura é "tudo do cartão que vence no mês". Se o cartão
não tem conta de débito, pagar a fatura cria saída **sem conta** — entra no total
e em nenhuma conta.

## Importação

O pipeline é bom (leitura sem biblioteca, cabeçalho, sinal, parcelas, duplicidade
em duas camadas) e **deve ser preservado**. O problema é o fim: cada linha vira
lançamento pago e a linha do extrato é descartada. Sem a linha, não existe
conciliação depois.

## Conciliação

Não existe. "Conciliação" no 2.2 é só a regra de que o mês fechado termina onde o
seguinte começa. Não há status de conciliado nem comparação com o saldo do banco.

## Outros

- Dinheiro em `float` com `Math.round(x*100)/100` espalhado — risco de centavo.
- Sem auditoria, sem numeração de documento.
- As regras do Firestore permitem **só** `users/{uid}`. Qualquer subcoleção é
  negada — a versão nova exige atualizar as regras no console antes do deploy.

## O que foi preservado na versão 3

Leitura de CSV/XLSX/HTML-xls/OFX, recusa explicada do PDF, detecção de coluna e
de sinal, parcelas da fatura, limpeza de descrição de Pix, sugestão de categoria,
duplicidade por identificador do banco e por ocorrência, regra de "uma conta só,
sem perguntar", pessoa opcional, grade de consulta, baixa em lote e por pessoa,
documento do parcelamento, relatório para imprimir.

## O que foi substituído

`tx` → documento + parcelas + pagamento (com alocações) + lançamento contábil;
JSON único → subcoleções com `writeBatch`; saldo recalculado por mês → razão por
data; metas → contas de reserva; vale → conta de benefício; lixeira → cancelamento
e estorno; abas em estado → rotas com `#`.
