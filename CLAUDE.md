# WIGO Finanças — memória do projeto

App de finanças pessoais **em arquivo único**: todo o CSS, o HTML e o JavaScript
vivem dentro de `index.html` (4.175 linhas, ~280 KB). Não há build, framework,
bundler nem dependência instalada — o navegador abre o arquivo e o app está de pé.

Firebase Auth + **Firestore** (não é Realtime Database). Não existe backend
próprio: o navegador fala direto com o Firebase, e quem protege os dados é a
regra do Firestore.

- **Site:** https://fastidious-hamster-2b9ffd.netlify.app
- **Projeto Firebase:** `app-fin-ebcfe` (só Auth + Firestore — o site não é hospedado lá)
- Versão do app exibida ao usuário: **2.1** (ver `APP_VERSION` no `index.html`)

---

## Como rodar

Não há `npm install`, `dev` nem `build`. Abrir `index.html` no navegador já roda o
app apontando para o Firebase de produção.

```bash
python3 -m http.server 8000    # se precisar servir por HTTP
```

O `firebaseConfig` está **hardcoded** no `index.html` e é público de propósito
(ver "Por que o repositório é público", abaixo). Não existe `.env`.

Não há testes, linter nem typecheck configurados no projeto.

### Deploy

O Netlify está ligado ao repositório. Publicar é empurrar para o `main`:

```bash
git push
```

O Netlify publica sozinho em ~30 segundos. Como `netlify.toml` deixa o `command`
vazio, **não existe etapa de build** — o consumo de build minutes fica perto de zero.

---

## Atenção: existem dois projetos no Netlify

| Projeto | URL | Situação |
|---|---|---|
| `hamster-fastidious-2b9ffd` | fastidious-hamster-2b9ffd.netlify.app | **Este é o site real** |
| `stalwart-capibara-312533` | stalwart-capybara-312533.netlify.app | Abandonado — versão de 06/07/2026 |

O segundo não recebe atualizações. Só existe risco se alguém acessar aquele link
achando que é o app atual.

### Por que o repositório é público

O plano gratuito do Netlify só aceita **um contribuidor** em repositórios privados
e exige que o autor do commit seja membro verificado da conta. Com o repositório
privado, o deploy do commit `60df7fe` foi recusado com *"Build bloqueada:
contribuinte Git não reconhecido"*.

Tornar público não expõe nada novo: o `firebaseConfig` já é visível no código-fonte
do site publicado, e não há `.env`, token nem chave privada versionados. **O que
protege os dados é a regra do Firestore, não o sigilo do código.**

---

## Arquivos

| Arquivo | Papel |
|---|---|
| `index.html` | O app inteiro — CSS, JS e markup inline |
| `netlify.toml` | Deploy: sem build, redirect de SPA, `no-cache` no HTML |
| `firestore.rules.referencia` | Regras sugeridas — **referência, não é publicado** |
| `firebase.json` / `.firebaserc` | **Inativos.** Sobraram de uma migração para Firebase Hosting que foi abandonada |

O `no-cache` no `index.html` é intencional: sem ele um deploy novo demora a
aparecer para quem já abriu o app antes.

---

## Modelo de dados (Firestore)

Um documento por usuário, com o estado inteiro serializado:

```
users/{uid} = { data: "<JSON.stringify(S)>", updatedAt: <serverTimestamp> }
```

`S` é o estado global em memória. `save()` faz debounce de 700 ms e grava o objeto
todo; `load()` lê uma vez no login. Não há listener em tempo real — o app assume um
usuário, um aparelho por vez.

### O estado `S`

```js
{ appName, expCats[], incCats[], cards[], tickets[], tx[], goals[],
  accounts[], people[], cdiRef, opening,
  tutorialSeen, seenVersion, tourAdvSeen }
```

### Lançamento (`S.tx[]`) — o registro central

```js
{ id, gid,                       // gid agrupa parcelas/fixos do mesmo lançamento
  type: "exp"|"inc"|"xfer",
  dest: "savings"|null,          // "savings" = guardar em meta
  desc, cat, method,             // method: cartao|ticket|pix|boleto|debito|transferencia|dinheiro
  cardId, ticketId, goalId,
  accId,                         // conta de onde o dinheiro sai/entra
  accTo,                         // só em xfer: conta de destino
  pesId,                         // pessoa vinculada
  kind: "avista"|"parcelado"|"fixo",
  i, n,                          // parcela i de n (n=0 em fixo perpétuo)
  amount, due, comp,             // comp = mês de competência (opcional)
  paid, payDate, payAmt,         // payAmt permite juros/desconto/pagamento parcial
  perp,                          // 1 = fixo "sempre"
  impId,                         // marca de origem, quando veio de um extrato
  deleted, deletedAt }           // lixeira
```

| Coleção | Campos |
|---|---|
| `accounts[]` | `id, name, bank, type, color, opening{amount,month}` |
| `cards[]` | `id, bank, nick, color, noLimit, limit, closeDay, dueDay, accId` |
| `tickets[]` | `id, brand, name, color, monthly, day, overrides{"YYYY-MM":valor}` |
| `goals[]` | `id, name, bank, color, goal, monthly, cdi, showHome, moves[]` |
| `goals[].moves[]` | `id, txId, date, amount, kind:"in"\|"out"` |
| `people[]` | `id, name, note` |

`S.ultimaImportacao = { ids[], quando }` guarda o último lote importado — existe
só para o botão de desfazer.

### Regra do Firestore

Está em `firestore.rules.referencia` e **precisa ser conferida no console à mão** —
o repositório não a publica. A regra mínima correta:

```
match /users/{uid} { allow read, write: if request.auth != null && request.auth.uid == uid; }
match /{document=**} { allow read, write: if false; }
```

Se a regra do console for mais permissiva (`if true`), qualquer pessoa com o
`apiKey` — que é público — lê os dados de todos os usuários.
Conferir em: https://console.firebase.google.com/project/app-fin-ebcfe/firestore/rules

---

## Telas

Quatro abas mais Ajustes. **As abas são estado local (`tab`), não rotas** — trocar
de aba não muda a URL nem entra no histórico.

| Aba | O que tem |
|---|---|
| **Início** (`renderHome`) | Hero de extrato do mês, alertas, métricas, mini-cartões, donut de categorias, lista de lançamentos com filtros |
| **Carteira** (`renderCards`) | Contas · Cartões de crédito · Tickets e benefícios · Pessoas |
| **Metas** (`renderSavings`) | Poupanças com valor alvo, aporte, progresso e rendimento estimado |
| **Análise** (`renderReport`) | Tendência de 12 meses, comparação, projeção, heatmap por dia, médias por categoria |
| **Ajustes** (`renderSettings`) | Contas e pessoas, lixeira, saldo de abertura, ajuda/tours, categorias, CDI, conta, backup |

Navegação: **dock** inferior no celular, **sidebar** de 250 px no desktop
(`min-width:1024px`). Modais são bottom sheet no celular e painel lateral direito
no desktop. `Ctrl/⌘+K` abre a command palette.

---

## Decisões que não devem ser desfeitas

### Dinheiro

- **`effMonth()` e `cashMonth()` são coisas diferentes, de propósito.** `effMonth`
  é regime de **competência** (a que mês o valor pertence) e alimenta a Análise;
  `cashMonth` é regime de **caixa** (quando o dinheiro se moveu) e alimenta o saldo.
  Um adiantamento recebido em julho com competência de agosto é de agosto na
  Análise, mas entrou no banco em julho — e é julho que o extrato mostra.
- **Mês encerrado não tem previsão.** Em `cashFlow()`, `final = fechado ? atual :
  atual + aReceber - aPagar`. É isso que faz o fechamento de um mês ser sempre
  igual à abertura do seguinte, fechando a conciliação contra o extrato do banco.
  O que ficou pendente não some: continua em "a pagar" do mês corrente até ser
  baixado, só deixa de ser descontado de um mês que já terminou.
- **O saldo inicial de um mês é o REALIZADO do anterior**, não o final previsto.
  Assim a coluna fecha na tela: inicial + recebido − pago = atual.
- **Transferência entre contas é neutra no total.** `type:"xfer"`, com `accId`
  (origem) e `accTo` (destino). `signedFor(t, null)` devolve 0 para xfer: o
  dinheiro trocou de lugar, o patrimônio não mudou. Nasce já `paid:true`.
- **A compra no cartão nasce sem `accId`.** O dinheiro não saiu no dia da compra.
  Ao pagar a fatura, `applyPaid()` atribui a conta de débito do cartão (`card.accId`)
  — e é aí que o valor sai do saldo daquela conta. Por isso o formulário de
  lançamento **não pede conta** quando a forma é cartão ou ticket: pedir daria a
  entender que o dinheiro já saiu.
- **Poupança sai do caixa.** Guardar (`dest:"savings"`) entra no fluxo como saída e
  vira Patrimônio.
- **`payAmt` existe para juros, desconto e pagamento parcial.** `val(t)` usa
  `payAmt` quando o lançamento está pago e `amount` quando não está. Nunca calcular
  direto por `amount`.
- **Saldo por pessoa:** positivo = a pessoa te deve; negativo = você deve a ela
  (`pesFlow`).

### Lançamentos

- **`aTx()` é o único caminho para ler lançamentos** em cálculo ou listagem. Ler
  `S.tx` direto só é correto para: buscar por id (inclusive excluído), restaurar, e
  limpar referências de cartão/ticket/meta apagados.
- **Excluir não apaga.** Marca `deleted:true` e vai para a Lixeira, de onde volta.
  Por isso não há confirmação assustadora ao excluir.
- **Fixo "sempre" não gera registros infinitos.** Mantém uma janela de
  `PERP_WINDOW = 24` meses à frente de HOJE e a estica a cada carregamento
  (`extendPerpetual`). A conta de quantas ocorrências criar parte de hoje, igual à
  do esticador — senão um fixo que começa no passado nasceria com a janela incompleta.
- **Espelhar sempre cria à vista.** Duplicar um parcelado no tipo oposto geraria um
  segundo grupo de N parcelas, que quase nunca é o que se quer ao inverter o sinal.
  E a tela pede a categoria nova, porque as listas de gasto e receita são diferentes.
- **`filters` nasce de `resetFilters()`, não de um objeto literal.** Quando os
  filtros avançados foram criados, o literal ficou para trás e os campos novos
  nasciam `undefined` — como `undefined !== "all"`, `passFilter` rejeitava tudo e a
  lista abria vazia.
- **A pessoa é obrigatória no formulário de lançamento**, de propósito: força
  decidir de quem é o lançamento em vez de deixar em branco por descuido.
  "Ninguém" é uma resposta válida.
- **`migraContas()` roda uma vez.** Antes existia um caixa único (`S.opening`); ao
  introduzir contas, esse valor virou a abertura de uma conta "Principal" e todo o
  histórico foi atribuído a ela — o saldo por conta já nasce com passado e nenhum
  número muda no momento da atualização.

### Importação de extrato

- **O arquivo nunca escreve direto em `S.tx`.** Ele vira *pré-lançamentos* numa
  estrutura fora de `S` (`imp`, como `filters` e `rep`), e só a confirmação chama
  `createTx` — o mesmo caminho da criação manual. Uma segunda porta de entrada em
  `S.tx` faria qualquer regra futura de criação valer só para metade do app.
- **Extrato de conta e fatura de cartão são documentos diferentes, e o lançamento
  sai diferente de cada um.** No extrato de conta o dinheiro já saiu: `paid:true`,
  `due` e `payDate` na data do arquivo. Na fatura ainda não saiu: a linha traz a
  data da **compra**, o vencimento sai do `closeDay`/`dueDay` do cartão via
  `cardFirstDue`, `accId` fica **null** e `paid:false`. Marcar a compra como paga
  faria o valor sair duas vezes — na compra e de novo quando a fatura for paga.
  Em ambos, `kind:"avista"` e competência no mês em que a coisa aconteceu, então
  uma compra de 30/09 que vence em 10/10 continua pesando em setembro na Análise.
  A importação nunca cria previsão a partir de extrato de conta.
- **`sinal` é qual sinal representa despesa, e é derivado do documento, nunca
  recebido por parâmetro.** No extrato de conta despesa é sempre negativa; numa
  fatura depende do banco (Nubank manda a compra positiva, OFX de cartão manda
  negativa), então quem decide é a maioria das linhas (`sinalFatura`). Confiar no
  parâmetro já inverteu tipo, categoria e filtros de uma vez, em silêncio.
- **A tela avisa quando quase tudo virou receita no modo conta.** Fatura
  importada como extrato de conta entra INTEIRA como receita — o valor da compra
  vem positivo, e no extrato de conta positivo é entrada. O erro é um clique e a
  descoberta é tardia. Trocar o modo depois de ler o arquivo limpa as linhas e
  volta para a escolha: manter qualquer uma daria um estado meio conta, meio cartão.
- **Duas linhas idênticas no mesmo arquivo são duas compras**, não uma repetida —
  acontece quando dois parcelamentos caem no mesmo dia com a mesma loja e o mesmo
  valor (visto numa fatura real: quatro "Gowd - Parcela 5/5", duas delas com o
  mesmo valor). A ocorrência entra na marca de origem, e como a ordem do arquivo
  é estável, reimportar reconhece todas. Sem isso a segunda nascia desmarcada e o
  gasto sumia.
- **A limpeza de descrição só age quando a cauda é papelada de banco** (CPF,
  CNPJ, agência ou conta). Descrição de fatura tem a mesma forma — "Mercado Livre
  - ITEM - Parcela 1/2" — e encurtar ali jogava fora justamente a parcela.
- **A linha de "pagamento" na fatura nasce desmarcada.** É a quitação da fatura
  anterior, que já foi lançada do lado da conta; importar de novo criaria uma
  receita que nunca existiu.
- **Três coisas nunca são inferidas:** transferência (`type:"xfer"`), cartão
  (`cardId`/`method:"cartao"`) e poupança (`dest:"savings"`) — mesmo quando o
  histórico diz "TED", "cartão" ou "reserva". As três dependem de intenção, que o
  arquivo não tem; quem decide é o usuário, na revisão. Atribuir o cartão seria
  pior que inútil: o valor sairia duas vezes, na conta e na fatura.
- **`amount` entra positivo.** O parser trabalha com valor assinado, mas quem
  carrega o sinal no WIGO é o `type` — é o que `val()` e `signed()` esperam.
- **A marca de origem (`impId`) identifica a linha do arquivo e não muda quando o
  pré-lançamento é editado.** Se acompanhasse a edição, reimportar o mesmo extrato
  deixaria de reconhecer o que já entrou e criaria tudo de novo.
- **Duplicidade tem duas camadas, e nenhuma basta sozinha:** a marca de origem não
  existe no que foi digitado à mão, e a comparação por conta + valor + data (±1
  dia) + descrição não sobrevive a uma edição. **Valor igual sozinho nunca é
  duplicata** — dois cafés de R$ 15 no mesmo dia são duas compras, e é a descrição
  que os separa.
- **A certeza tem dois graus, e a tela não finge que são um só.** *Já no app*
  (marca de origem, ou valor + data ±1 dia + descrição parecida) nasce desmarcado;
  *Confira* (mesma conta, mesmo valor, mesmo dia, descrição diferente — pode ser o
  mesmo lançamento digitado com outro nome, pode ser coincidência) nasce marcado e
  apenas sinalizado. Rebaixar o segundo a "duplicado" faria o usuário desmarcar
  gasto de verdade; ignorá-lo deixaria passar repetição.
- **Identificador do banco é a melhor marca de origem que existe.** Quando o
  arquivo traz uma coluna de id (o extrato do Nubank manda um UUID por
  transação), ela vira o `impId` — não muda se o lançamento for editado e não
  depende de valor, data nem descrição casarem.
- **Descrição de Pix é encurtada para o nome da outra ponta.** O extrato manda
  150 caracteres com nome, CPF, banco, agência e conta; na lista do app isso vira
  reticências e não identifica nada. `limparDescricaoImportacao` guarda o que
  importa ("Pix enviado · FULANO") e a linha crua fica em `descOriginal`. De
  quebra some um falso positivo de categoria: "PAGSEGURO **INTERNET** IP S.A."
  virava Internet/Telefone num Pix para pessoa física.
- **"Pagamento de fatura" no extrato da conta ganha aviso.** Quem também importa
  a fatura do cartão lança as compras uma a uma, e elas debitam a conta quando a
  fatura é marcada como paga — lançar os dois cobra o mesmo dinheiro duas vezes.
  Fica marcado, porque quem não usa a fatura no app quer esse lançamento.
- **O selo nomeia o lançamento que casou**, com data e valor. Dizer "já está no
  app" sem dizer com o quê obriga a sair da tela para conferir — que é justamente
  o trabalho que a importação existe para poupar.
- **Duplicado suspeito continua na lista, só nasce desmarcado.** Sumir com a linha
  esconderia do usuário uma decisão que é dele.
- **Um `save()` para o lote inteiro.** O debounce de 700 ms existe justamente para
  40 lançamentos não virarem 40 escritas no Firestore.
- **Desfazer manda para a Lixeira**, não remove: nada some do histórico sem poder
  voltar.
- **Detecção de coluna duvidosa pergunta em vez de errar calado.** É melhor uma
  tela a mais que um extrato inteiro importado na coluna errada.
- **`TRNTYPE` do OFX manda no tipo, acima do sinal.** Só `DEBIT` e `CREDIT`, que
  são inequívocos — `PAYMENT` significa coisas opostas no extrato de conta e na
  fatura. Sem isso, uma fatura OFX com poucas linhas invertia tudo, porque o
  desempate do sinal predominante não tem como acertar com dois registros.
- **Linha de saldo não é movimentação.** "SALDO ANTERIOR", "SALDO FINAL",
  "TOTAL DO PERÍODO" viram erro visível e desmarcado; sem isso um saldo anterior
  de mil reais entrava como receita e estragava o mês.
- **Extrato sem cabeçalho nenhum existe** (alguns bancos exportam assim). A
  primeira linha já é dado: consumi-la como cabeçalho perdia uma transação em
  silêncio. `acharCabecalhoCSV` devolve `idx: -1` nesse caso, e a tela de
  mapeamento numera as colunas em vez de fingir que o conteúdo é rótulo.

### Cobertura real da importação

Testado de ponta a ponta com **Nubank** (extrato de conta e fatura, arquivos
reais). Variações estruturais de outros bancos foram exercitadas com fixtures
plausíveis, não com arquivos reais — coluna Saldo, débito/crédito separados,
preâmbulo, colunas extras, sem cabeçalho e OFX de cartão (`CCSTMTRS`) passam.

Limitações conhecidas, todas em aberto:
- **Excel (.xlsx) é lido sem biblioteca.** Um .xlsx é um ZIP de XMLs: o ZIP é
  percorrido à mão e inflado com `DecompressionStream`, que o navegador tem
  nativamente. Isso evita uma biblioteca de planilha de ~1 MB por CDN e mantém a
  regra de que o Firebase é a única dependência externa. Data de planilha vem
  como número de dias desde 30/12/1899 e é convertida na faixa 20000–60000.
- **Formato vem dos primeiros bytes, não da extensão.** Banco chama de `.xls` um
  HTML com `<table>` dentro, e de `.csv` um arquivo separado por tab. `%PDF`,
  `PK\x03\x04` (xlsx) e `D0CF11E0` (xls binário antigo) são reconhecidos assim.
- **PDF não é lido, e a recusa é uma tela, não um toast.** Ler PDF exigiria
  pdf.js por CDN, e o conteúdo não compensa: no extrato do Santander as seis
  movimentações do mês vêm espalhadas num documento com propaganda, telefone do
  SAC, cotação de dólar e uma seção de "Comprovantes" que repete os mesmos
  valores — a data sem o ano (`06/07`), o sinal depois do número (`1.057,08-`),
  o saldo grudado na linha e o favorecido na linha seguinte. Quem escolheu o PDF
  não errou: é o formato que o banco oferece primeiro. Por isso a tela explica o
  motivo, lista o que funciona e ensina a converter.
- **Data ambígua é lida como dd/mm.** `10/02/2026` vira 10 de fevereiro, não 2 de
  outubro. Correto para banco brasileiro, errado para internacional — e é o único
  caso que falha em silêncio, sem marcar erro.
- **Descrição com o separador dentro e sem aspas** quebra a linha. Falha visível
  (a linha fica com "Valor não reconhecido" e desmarcada), não vira lançamento errado.

### Interface

- **Ícones sempre via `ic(nome)`.** Biblioteca SVG de traço 24×24 que substituiu 115
  emojis: a aparência passa a ser a mesma em Windows, iOS e Android e a cor
  acompanha o texto. Nunca colar `<svg>` solto no meio do HTML.
- **A sidebar é irmã de `#appScreen`, não mãe.** Assim o layout mobile continua
  exatamente como era e a sidebar é puramente aditiva. Tudo dela vive dentro de
  `@media (min-width:1024px)`.
- **O PDF é impresso num iframe isolado.** A tentativa anterior escondia o app com
  uma classe no `body` e a removia por temporizador — só que o diálogo de impressão
  fica aberto o tempo que o usuário quiser, então a página voltava ao normal antes
  de ele salvar e o PDF saía com a tela inteira. Sem biblioteca externa: monta a
  folha e chama `print()`, onde o navegador oferece "Salvar como PDF".
- **`REPORT_CSS` vive separado do `<style>` da página**, porque é injetado no iframe
  — o relatório não divide CSS com a tela do app. Preto no branco de propósito: o
  tema escuro gastaria tinta e ficaria ilegível no papel.
- **O relatório não leva o e-mail da conta no cabeçalho** — ele costuma ser enviado
  a terceiros (o caso de uso é cobrar alguém).
- **No tour, quem escurece a tela é o próprio recorte**, cuja sombra de 9999px abre
  um buraco real sobre o elemento. Somar uma máscara por cima escureceria justamente
  o que se quer mostrar. A máscara só existe nos passos sem alvo.
- **O tour posiciona o recorte na hora e reajusta no quadro seguinte.**
  `requestAnimationFrame` sozinho não dispara com a aba em segundo plano, e o anel
  ficava sem posição.
- **Passo de tour cujo alvo não existe é pulado.** É o que permite o mesmo roteiro
  funcionar no celular e no computador, onde a navegação é diferente.
- **A seleção dentro da tela de uma pessoa (`detSel`) é local**, separada da seleção
  da lista principal (`selTx`), para não misturar duas coisas na mesma barra flutuante.
- **A soma de faturas marcadas (`selCards`) zera ao trocar de mês**, porque ela
  sempre se refere às faturas do mês exibido.
- **Busca por valor casa contra o formatado e o cru**: digitar `90` acha
  R$ 90,00, R$ 189,90 e R$ 1.900.

---

## Onde fica cada coisa no `index.html`

O arquivo é organizado por faixas comentadas. Os marcadores `/* ═══ NOME ═══ */`
são a forma de navegar — procure por eles antes de por número de linha.

| Faixa | Assunto |
|---|---|
| `<style>` | Design system "Aurora": tokens (cor, tipografia, espaço, raio, elevação, movimento) → primitivos → componentes → layout → sidebar/desktop |
| FIREBASE / CONSTANTES / ÍCONES | Config, listas fixas (bancos, categorias, formas), biblioteca SVG |
| ESTADO / HELPERS / PERSISTÊNCIA | `defaultState`, `S`, formatação, `save`/`load` |
| AUTENTICAÇÃO | `onAuthStateChanged`, mensagens de erro traduzidas |
| MOTOR DE LANÇAMENTOS | `createTx`, `cardFirstDue`, lixeira, fixo perpétuo, `effMonth` |
| SALDO DE CAIXA | `cashMonth`, `signedFor`, `cashRealized`, `cashPending`, `cashFlow`, `migraContas`, `pesFlow`, `applyPaid` |
| RENDER SHELL | `render`, `mpick`, `txRow`, `filterBar` |
| MOTOR DE INSIGHTS | `buildInsights` — avisos automáticos na Início |
| INÍCIO / CARTEIRA / METAS / ANÁLISE / AJUSTES | as cinco telas |
| BARRA DE SELEÇÃO / COMMAND PALETTE | `updateSelBar`, `CMD_ACTIONS` |
| MODAIS | novo lançamento, pagamento, exclusão, edição, cartão, ticket, meta, conta, pessoa, transferência, vincular, abertura, lixeira, filtros avançados, espelhar |
| RELATÓRIO EM PDF | `repRows`, `buildReport`, `REPORT_CSS`, `printReport` |
| TOUR GUIADO | `TOUR_BASIC`, `TOUR_LANCAR`, `TOUR_CONFERIR`, `TOUR_CARTOES`, `TOUR_ANALISE`, `TOUR_ADV`, `TOUR_COMPLETO` |
| NOVIDADES DA VERSÃO | `APP_VERSION`, `WHATS_NEW`, `decidirOnboarding` |
| EXPORTAÇÕES / EVENTOS | CSV, backup JSON, e o dispatcher de `data-action` |

**Tudo é delegação no `document`.** Um `click` procura o `[data-action]` mais
próximo e cai num `switch` com ~100 casos; `submit` despacha por `f.id` (`fCard`,
`fPes`, `fXfer`…); `input` e `change` cuidam de busca e formulários. Botão novo =
`data-action` novo + um `case`. Só três elementos têm listener próprio
(`#sheetWrap`, `#cmdWrap` e `#appNameEl`), mais um `keydown` global para `Esc` e
`Ctrl/⌘+K`.

---

## Tutorial e novidades

- **Tour em balões ancorados** a elementos reais via `data-tour="..."`. Um passo
  pode pedir uma aba (`tab`), abrir uma tela (`abre`) ou fechá-la (`fecha`).
  O capítulo "Como lançar" abre o formulário de verdade e explica campo a campo —
  nada é salvo, o passo final fecha a tela sem submeter.
- **Seis capítulos** ficam em Ajustes → Ajuda: intro, lançar, conferir, cartões,
  análise, avançado. `TOUR_COMPLETO` é a sequência inteira do primeiro acesso.
- **`decidirOnboarding()` mostra uma coisa de cada vez:** primeiro acesso sem dados
  → tour completo; quem já usa e não viu a versão → novidades; quem já tem 3+
  lançamentos e um cartão → tour avançado. Quem chega com dados (conta antiga) não
  leva o tour de boas-vindas.

### Para publicar uma novidade no app

Suba `APP_VERSION` e acrescente um bloco **no topo** de `WHATS_NEW`, com `v`, `d`
(mês por extenso) e `itens` como pares `[título, descrição]`. `S.seenVersion` guarda
o que o usuário já viu — não dá para deduzir isso do código sozinho.

---

## Convenções do código

- **Tudo em português**: nomes de variáveis, funções e comentários.
- Comentários explicam **por quê**, não o quê — e vários registram decisões de
  arquitetura ou bugs já corrigidos. Não apague ao refatorar.
- Estilo compacto: várias declarações por linha, `const` curtos, HTML montado por
  concatenação de string. Acompanhe o estilo do arquivo em vez de reformatar.
- **Todo texto vindo do usuário passa por `esc()`** antes de entrar no HTML.
- Sem framework, sem TypeScript, sem dependência instalada. O único import externo
  é o SDK do Firebase, por URL do `gstatic.com`.
- Mensagens de commit: uma linha em português descrevendo o efeito para quem usa
  ("Conciliacao: mes encerrado fecha onde o seguinte abre"), não o arquivo mexido.
  Corpo opcional explicando a causa. Sem acentos no assunto, por convenção do repo.

---

## Histórico do projeto

26 commits, de 08/08/2026 a 30/08/2026. As fases:

1. **08/08 — nascimento e infraestrutura.** Versão inicial, documentação, deploy
   contínuo pelo Netlify (e a descoberta de qual dos dois projetos era produção),
   115 emojis substituídos por biblioteca de ícones SVG, sidebar e layout de
   desktop mantendo o mobile intacto, pacote de ERP (busca, competência em gastos,
   espelhar, fixo sem fim, lixeira), relatório em PDF com filtros, repositório
   tornado público para destravar o build.
2. **16/08 — saldo e aprendizado.** Saldo de caixa encadeado entre os meses, tour
   com balões ancorados, aviso de novidades por versão, tutorial em capítulos.
3. **30/08 — versão 2.1.** Contas bancárias, pessoas vinculadas a lançamentos
   (com vínculo em lote para o histórico antigo), transferência entre contas,
   cartão ligado à conta, conciliação (mês encerrado fecha onde o seguinte abre),
   filtros e desvínculo em lote, correção do destaque do tour.

---

## Estado atual

`main` está em `27e0f0f`. Nada pendente no código.

## Pendente de ação manual

1. **Conferir as regras do Firestore no console** contra
   `firestore.rules.referencia`. O deploy não as publica.
2. **Decidir o que fazer com `stalwart-capibara-312533`** no Netlify — serve uma
   versão de julho e nunca mais foi atualizado.
3. `firebase.json` e `.firebaserc` podem ser removidos: são restos de uma migração
   para Firebase Hosting que foi abandonada e não afetam o deploy do Netlify.
