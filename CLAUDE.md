# WIGO Finanças — memória do projeto

App de finanças pessoais. Versão **3.0**: motor financeiro reconstruído do zero
sobre **documento → parcela → pagamento → lançamento (razão em partidas
dobradas) → saldo → reconciliação**. JavaScript puro em módulos ES, sem build,
sem framework, sem dependência instalada. Firebase Auth + **Firestore** direto do
navegador; quem protege os dados é a regra do Firestore.

- **Site:** https://fastidious-hamster-2b9ffd.netlify.app
- **Projeto Firebase:** `app-fin-ebcfe` (só Auth + Firestore — o site não é hospedado lá)
- Versão exibida: `VERSAO` em `js/ui/telas/ajustes.js`
- A versão 2.2 (arquivo único) está preservada em `legado/wigo-2.2.html`.
  A auditoria dela — o que foi mantido e o que foi trocado — está em
  `docs/AUDITORIA.md`.

---

## Como rodar

```bash
python3 -m http.server 8000     # módulos ES não abrem por file://
```

Aponta para o Firebase de produção. `firebaseConfig` fica em `js/dados/firebase.js`
e é público de propósito (ver "Netlify e repositório").

### Testes

```bash
node tests/motor.test.mjs       # motor: partidas dobradas, parcelas, cartão, estorno, terceiros… (202)
node tests/leitura.test.mjs     # leitura de CSV/OFX/XLSX (151)
node tests/analise.test.mjs     # importação, reconciliação, recorrências, relatórios (78)
node tests/migracao.test.mjs    # 2.2 → 3 confere saldo a saldo (39)
node tests/e2e.test.mjs         # Chromium clicando no app, com Firebase simulado (157)
node tests/prints.mjs <pasta> [desktop|celular|ambos] [rota,rota]   # prints de todas as telas
```

Os de Node não precisam de nada instalado. Os de navegador usam o Playwright e o
Chromium do ambiente (`tests/navegador.mjs`): sobem um `http.server` na porta
8130 e trocam as URLs do Firebase no `gstatic.com` pelos simulados em
`tests/stub-firebase/`. **O Firestore simulado reproduz `firestore.rules`**
(`recusa()` em `tests/stub-firebase/firebase-firestore.js`): gravação que o
servidor recusaria falha no teste também. Mudou a regra? Mude lá junto. Não é
o emulador oficial — é a mesma lógica, reescrita.

Os 12 cenários obrigatórios da especificação estão cobertos: 1–8 e 11 em
`motor.test.mjs`; 9 (reimportar não duplica) e 10 (diferença de R$ 200
explicada) em `analise.test.mjs`; 12 (competência × caixa) nos dois.

### Deploy

O Netlify está ligado ao repositório; publicar é empurrar para o `main`. Não há
etapa de build (`command` vazio no `netlify.toml`). **Antes do primeiro deploy
da versão 3, trocar as regras do Firestore** — ver "Pendente de ação manual".

---

## Arquitetura

```
js/nucleo/      dinheiro (centavos inteiros), datas, ids, texto — sem nada do app
js/financas/    o motor: modelo, livro (estado + índices), comandos, cartões,
                recorrências, relatórios, conciliação, busca, integridade
js/importacao/  leitura (parsers de arquivo) e análise (casar, confirmar, desfazer)
js/dados/       firebase, repositório (Firestore), migração do 2.2, cálculo legado
js/ui/          base (rotas, eventos, painel), componentes, formulários, documento
js/ui/telas/    uma tela por arquivo
css/wigo.css    tokens, tema claro/escuro, componentes, celular, impressão
tests/          ver acima
```

**Regra de ouro: comando não mexe no livro.** Todo comando de
`js/financas/comandos.js` recebe o `Livro`, valida e devolve uma `Mudanca` (a
lista do que gravar). Quem aplica é o `Repositorio.gravar()`: aplica na memória
(a tela responde na hora), manda tudo num `writeBatch` e, se o servidor recusar,
**desfaz** — "Nenhuma alteração foi aplicada" é literal (testado no e2e). A tela
nunca calcula saldo nem grava no Firestore por conta própria.

### Modelo de dados (Firestore)

Tudo abaixo do próprio usuário, um registro por documento:

```
users/{uid}                         ← JSON do 2.2, mantido intacto (fonte da migração)
users/{uid}/contas|parceiros|categorias|cartoes/{id}
users/{uid}/documentos/{id}         AP-, AR-, CP- (compra cartão), CR- (estorno), TRF-, ADJ-, AB-
users/{uid}/pagamentos/{id}         PAY- (saída), REC- (entrada) — com alocações por parcela
users/{uid}/lancamentos/{id}        o razão: linhas {chave, valor} que somam zero
users/{uid}/recorrencias|importacoes|extrato|conciliacoes/{id}
users/{uid}/meta/{contadores|preferencias|migracao}
users/{uid}/auditoria/{id}          lida sob demanda, nunca carregada inteira
```

Toda gravação leva `_ts: serverTimestamp()`. É o que permite a **carga
incremental**: o app lê o cache do aparelho e pede ao servidor só o que tem `_ts`
depois da última visita (`localStorage wigo3.sync.<uid>`). Recarregar sem mudança
custa zero leituras — testado no e2e. A cota grátis é de 50 mil leituras/dia.
A migração grava essa marca ao terminar; sem isso, a primeira abertura depois
dela relia tudo do servidor.

### Chaves do razão

Valor positivo = débito. Cada lançamento soma zero; `postar()` recusa o que não
fecha.

| Chave | O que é |
|---|---|
| `A:<conta>` | dinheiro numa conta (ativo) |
| `C:<cartao>` | dívida do cartão (passivo) |
| `P:<parceiro\|->` / `R:<parceiro\|->` | a pagar / a receber (linha com `terceiro:true` = compra feita para outra pessoa) |
| `E:<cat>` / `I:<cat>` | despesa / receita (`E:#juros`, `I:#desconto`… para juros e descontos) |
| `Q:abertura` / `X:ajuste` | contrapartida de saldo inicial / de ajuste |

**Saldo de conta = soma das linhas `A:<conta>`**, e mais nada. Não existe campo
de saldo gravado em lugar nenhum.

---

## Decisões que não devem ser desfeitas

### Dinheiro

- **Centavos inteiros em todo lugar.** `dividir(total,n)` põe a sobra na
  primeira parcela; nunca `total/n`.
- **Documento reconhece, pagamento move.** Uma despesa em aberto lança
  `E:cat / P:parceiro` na data de competência — a conta não muda. O pagamento
  lança `P:parceiro / A:conta` na data do pagamento. Por isso competência e
  caixa são relatórios diferentes e os dois batem.
- **Estado da parcela é derivado das alocações**, nunca gravado:
  ABERTA/PARCIAL/PAGA/VENCIDA/CANCELADA. Pagamento menor que o restante deixa o
  resto em aberto; "quitar com desconto" é escolha explícita; valor maior vira
  juros.
- **Nada financeiro é apagado.** Corrigir pagamento = estorno (outro pagamento,
  valor negativo, `estornoDe`). Cancelar documento = status CANCELADO, estornando
  o reconhecimento; com pagamento, só "estornar e cancelar". As regras do
  Firestore reforçam isso no servidor.
- **Editar depende do estado.** Sem pagamento, tudo é editável (estorna e reposta
  o reconhecimento). Com pagamento, valor, parcelas e datas ficam travados e a
  tela diz por quê; descrição, categoria e observação continuam livres. Trocar o
  parceiro depois de pago gera um lançamento de RECLASSIFICACAO.
- **Saldo inicial e ajuste são documentos** (AB-, ADJ-), com data e motivo.
  "Corrigir saldo inicial" estorna o anterior. O ajuste pela diferença do banco
  pede o saldo do banco e calcula o valor — o usuário não digita a diferença.
- **Transferência é um documento com duas pernas** num lançamento só. Não é
  receita nem despesa; o fluxo de caixa a ignora quando as duas contas são
  "disponíveis". Pode nascer planejada e ser efetivada depois.
- **Compra no cartão não sai do banco.** Lança `E:cat / C:cartao`, e cada parcela
  leva `fatura:"AAAA-MM"` (mês de vencimento). Compra até o dia de fechamento
  cai na fatura corrente (mesma regra do `cardFirstDue` do 2.2). **Pagar a
  fatura é um pagamento `C:cartao / A:conta`**, nunca uma despesa nova — senão o
  gasto contaria duas vezes.
- **Limite disponível = limite − toda a dívida do cartão**, parcelas futuras
  inclusive.
- **Recorrência gera documentos de verdade** numa janela de 24 meses
  (`JANELA_MESES`), esticada a cada abertura por `gerarPendentes`. Editar pode
  valer só para os futuros; encerrar pode cancelar os futuros.
- **"Saldo previsto no fim do mês" é o número principal da Visão geral**, a
  pedido do usuário (27/09): hoje em contas + o que ainda vence no mês. Os outros
  números ficam em cartões separados.
- **Contas "disponíveis" são BANCO, DINHEIRO, CARTEIRA e OUTRA.** RESERVA
  (antigas metas) e BENEFICIO (antigos tickets) aparecem à parte e não entram no
  "em contas".
- **Com uma conta só, o campo Conta não aparece** e tudo vai para ela
  (`campoConta`/`contaPadrao` em `js/ui/util.js`) — herança do 2.2 que o usuário
  pediu.

### Categorias e subcategorias

- **Dois níveis e nada mais**: categoria (Alimentação) › subcategoria
  (Mercado), no campo `pai` da categoria. A subcategoria é do mesmo tipo da
  mãe; uma subcategoria não tem filhas; uma categoria com filhas não vira
  filha. O nome só não repete no mesmo lugar ("Outros" pode existir em cada
  categoria). Validação em `salvarCategoria`.
- **O lançamento guarda a subcategoria** (a chave do razão é `E:<sub>`);
  relatórios e a Visão geral somam na mãe com `agruparCategorias()`, e o que
  foi lançado direto na mãe aparece como "Geral" dentro dela.
- Nos formulários a lista vem agrupada (`<optgroup>`); nos filtros, escolher
  a categoria traz as subcategorias junto ("Alimentação (todas)").
- Categorias sem mãe (como as migradas do 2.2) continuam valendo.
- **Conta nova já nasce com `CATEGORIAS_SUGERIDAS`** (`modelo.js`); em
  Cadastros → Categorias um botão acrescenta as que faltarem, sem duplicar
  nome que já exista e sem reativar o que foi arquivado.

### Compra de outra pessoa (terceiro)

"Abasteci o carro do João no meu cartão, ele me devolve em 3x." Pedido do
usuário em 27/09. **O cartão controla a dívida com o banco; a conta a receber
controla a dívida do terceiro comigo.**

- Despesa (`PAGAR`) e compra no cartão (`COMPRA_CARTAO`) têm Responsabilidade
  **Minha | Terceiro**. Terceiro exige a pessoa (criada na hora se não existe)
  e o cronograma de devolução. A categoria continua a real.
- **Um registro principal e um vínculo**, nunca a despesa duas vezes: a compra
  ganha `terceiro:{pessoa, receber, modo}` e nasce junto uma conta a receber
  (`RECEBER`, AR-) com `reembolsoDe` apontando de volta.
- **No razão a compra lança `R:<pessoa>` / `C:<cartão>`** (ou `P:` na despesa
  comum) em vez de `E:<cat>`: não é despesa minha. A linha leva
  `terceiro:true` e a categoria real; o estorno copia a marca. **A conta a
  receber vinculada não lança nada** (`linhasProvisao`) — o direito já nasceu
  na compra; lançar de novo faria a pessoa dever o dobro. Por isso a regra
  "a receber de cada parceiro = documentos em aberto" continua valendo sem
  exceção.
- **Receber não é receita**: é um recebimento comum (`A:conta` / `R:pessoa`),
  com parcial, estorno, juros e desconto como qualquer outro. Perdoar parte
  (desconto) vira despesa minha (`E:#desconto`), que é o que aconteceu.
- Fatura, parcelas, limite e dívida do cartão **não mudam**. Marcar depois
  como de terceiro uma compra com a fatura já paga é permitido: só troca o
  débito do reconhecimento (estorna e reposta na data original).
- Modos: `PARCELAS` (acompanha as parcelas da compra), `UNICO` (uma data),
  `PERSONALIZADO` (valor e data de cada uma; **tem de somar o valor da
  compra**, e a mensagem diz quanto falta ou passou).
- **Editar sem nada recebido**: a mesma AR- é atualizada (valor, parcelas,
  pessoa, data, descrição automática), com auditoria. Tornar minha cancela a
  AR- com o motivo; voltar a ser de terceiro cria outra.
- **Com dinheiro já devolvido nada destrutivo acontece**: parcela que teve
  recebimento (mesmo estornado) fica com id, valor e vencimento — o
  recebimento aponta para ela; o cronograma novo cobre só o resto. Trocar a
  pessoa, tornar minha ou cancelar a compra exige estornar o recebimento
  antes (a tela trava e explica). O valor não pode ficar abaixo do que as
  parcelas presas somam.
- A AR- vinculada **não se cancela nem muda valor sozinha**: aponta para a
  compra. Cancelar a compra cancela a AR- junto (se nada foi recebido).
- Relatórios: `resultado` deixa o terceiro fora de receitas/despesas e o
  devolve em `terceiros` (por pessoa e pela categoria real); `resultadoCaixa`
  põe o que foi pago por outros e o devolvido em `adiantado`/`devolvido`;
  `fluxoDeCaixa` continua com o dinheiro real nas entradas e saídas e mostra
  quanto foi de terceiros; `divisaoDaFatura` (cartoes.js) dá total, minhas,
  de terceiros e, por pessoa, a parcela do mês, o devolvido e o que falta.
- Integridade confere o vínculo nos dois sentidos, valor e pessoa iguais, uma
  AR- ativa por compra, e AR- vinculada sem lançamento próprio.
- Não há orçamento no WIGO; se um dia houver, ele lê `resultado`, que já
  separa.
- Despesa de terceiro **não se repete sozinha** ("Repetir todo mês" fica
  desligado): recorrência não carrega a pessoa.

### Integridade

`verificar(L)` (`js/financas/integridade.js`) confere a cada carga e em
Ajustes → Saúde dos dados:
- todo lançamento soma zero;
- dívida do cartão = parcelas de cartão em aberto;
- a pagar/receber de cada parceiro = documentos em aberto;
- pagamento = soma das alocações;
- parcelas somam o documento;
- transferência tem as duas pernas;
- compra de terceiro ↔ conta a receber vinculada, nos dois sentidos.

Se aparecer problema, é defeito do motor — não se "ajusta" o dado.

### Importação

Pipeline: **lote → linhas (`extrato`) → deduplicação → casamento → confirmação**.
O arquivo nunca escreve direto: cada linha vira uma decisão revisada na tela.

- **Impressão digital da linha** = id do banco quando o arquivo traz (UUID do
  Nubank, FITID do OFX); senão, hash de conta|data|valor|descrição|parcela|
  ocorrência. Reimportar o mesmo arquivo mostra "Já importadas" e cria zero
  documento.
- **A ocorrência entra no hash:** duas linhas idênticas no mesmo arquivo são duas
  compras (visto numa fatura real).
- **O número da parcela entra na comparação** ("Parcela 1/3" ≠ "Parcela 2/3").
- **Estados:** NOVA, DUPLICADA, NO_APP (já lançada à mão), QUITA (paga uma conta
  em aberto), FATURA (é o pagamento da fatura), POSSIVEL (mesmo valor, descrição
  diferente — o usuário decide), ERRO. **Ações:** CRIAR, VINCULAR, QUITAR,
  PAGAR_FATURA, TRANSFERIR, IGNORAR.
- **Extrato de conta:** o dinheiro já se moveu, então a linha vira documento pago
  (ou pagamento de algo em aberto) e **nasce conciliada**. **Fatura:** vira
  compra no cartão; parcela declarada ("3/4") cria as que faltam, nunca as
  anteriores.
- **Desfazer importação** estorna/cancela o que ela criou e marca as linhas
  DESFEITA. Nada é apagado.
- Decisões herdadas do 2.2 que continuam valendo em `js/importacao/leitura.js`:
  - formato pelos primeiros bytes, não pela extensão;
  - `.xlsx` lido sem biblioteca (ZIP + `DecompressionStream`);
  - **PDF recusado com explicação**;
  - data ambígua é dd/mm (única falha silenciosa conhecida);
  - `TRNTYPE` DEBIT/CREDIT manda no sinal;
  - linha de SALDO não é movimento;
  - CSV sem cabeçalho existe;
  - descrição de Pix encurtada para o nome da outra ponta;
  - transferência, cartão e reserva nunca são inferidos do texto.
- Testado com arquivos reais só do **Nubank**; o resto é fixture plausível.

### Reconciliação

`resumoConciliacao()` responde "por que o WIGO diz X e o banco diz Y":

```
diferença = dif. no saldo inicial + Σ só no banco − Σ só no WIGO + não explicado
```

- Saldo inicial lançado dentro do período entra no "WIGO no início", não como
  movimento — senão a diferença viria errada justo no primeiro mês.
- Sugestão de par exige **valor igual**; data próxima e descrição parecida só
  ordenam. Mesma referência do banco = certeza. **Nada concilia sem confirmação.**
- "Pistas" apontam as causas comuns: saldo inicial já diferente, movimento igual
  duas vezes no mesmo dia, pagamento de fatura só no banco, transferência
  planejada não efetivada.

### Migração do 2.2

Roda sozinha no primeiro login da versão 3, se `meta/migracao` não diz CONCLUIDA.

- **O JSON do 2.2 não é alterado**; a migração só lê.
- Marca EM_ANDAMENTO primeiro, grava em lotes de 450 com `_mig: <tentativa>` e
  marca CONCLUIDA por último. Se cair no meio, a próxima abertura apaga só o que
  aquela tentativa gravou e recomeça — a regra do Firestore só permite esse
  delete nesse estado. **Nunca migra duas vezes.**
- Tudo que veio do 2.2 guarda a origem no campo `legado` (ids do 2.2).
- Mapeamento:
  - parcelado → um documento;
  - fixo → recorrência + um documento por mês;
  - compras de cartão pagas → pagamentos de fatura agrupados por cartão|data|conta;
  - metas → contas RESERVA; tickets → contas BENEFICIO;
  - transferência sem uma perna → ajuste;
  - excluídos → documentos CANCELADOS;
  - `payAmt` diferente → juros/desconto.
- **Saldo inicial é recalculado**, descontando o que foi pago antes do mês de
  abertura, para o saldo de hoje bater.
- O relatório compara com o cálculo fiel do 2.2 (`js/dados/legado.js`): saldo de
  cada conta, total, dívida de cada cartão, a pagar e a receber. Com a base de
  demonstração, tudo "igual". Fica em Ajustes → Relatório da migração.
- **Mudanças de comportamento assumidas** (aparecem no relatório):
  - compra parcelada no cartão pesa no mês da compra na análise por competência
    (no 2.2 pesava em cada fatura);
  - quando o 2.2 não guardava a data da compra no cartão, a migração usa a do
    1º vencimento.
- **Data ruim não derruba a migração.** `normData()` lê "2026-9-5",
  "10/09/2026" e data com hora; ano fora de 1990–2100 é ilegível. O lançamento
  sem data legível fica de fora, contado em `ignorados` e nomeado nos avisos;
  a conferência compara com o 2.2 **com** ele, para a diferença aparecer.
- **A tela da migração mostra "Gravando X de Y"** (lotes de 200) e, se o
  Firebase passar 45 s sem confirmar um lote, explica — sem desistir. O
  Firestore trata cota diária estourada, servidor ocupado e conexão ruim como
  passageiros e tenta de novo para sempre em silêncio; foi isso que deixou o
  primeiro acesso real parado na tela de carregamento sem explicação. Nas
  gravações do dia a dia o mesmo prazo vira um aviso.
- **Depois de migrar, o 2.2 não conversa mais com a 3.** Lançar em
  `legado/wigo-2.2.html` depois disso muda só o JSON antigo, que a 3 não relê.

### Login

- **E-mail e senha, ou Google.** O Google abre em janela (popup), nunca por
  redirecionamento: o redirecionamento exige que o site e o `authDomain`
  (`app-fin-ebcfe.firebaseapp.com`) sejam o mesmo domínio, e com o site no
  Netlify o Safari e o Chrome novos perdem o retorno do login.
- **Quem já tem conta continua sendo o MESMO usuário** — os dados ficam em
  `users/{uid}`, e um uid novo abriria o app vazio.
  - Num @gmail.com o Firebase junta sozinho as duas formas de entrar. Se o
    e-mail nunca foi confirmado, o Firebase **desliga a senha antiga**
    (proteção contra roubo de conta): a pessoa passa a entrar pelo Google, ou
    usa "Esqueci a senha" para ter senha de novo. Os dados não mudam.
  - Num e-mail que não é do Google (Hotmail, por exemplo), o Firebase recusa
    com `account-exists-with-different-credential`. O app guarda a credencial
    do Google, pede a senha uma vez e liga as duas (`linkWithCredential`).
- Ajustes → Conta mostra por onde a pessoa entra e oferece "Conectar conta
  Google" (`linkWithPopup`) para quem hoje entra só com senha.

### Interface

- **Rotas por hash** (`#/pagar`, `#/faturas/<cartao>/<AAAA-MM>`); o botão voltar
  funciona. Menu: Visão geral · Movimentações · Documentos (a pagar, a receber,
  faturas) · Financeiro (pagamentos, recebimentos, transferências,
  reconciliação) · Cadastros · Relatórios · Importação · Ajustes.
- **Eventos por delegação**: `data-a` (clique), `data-f` (submit), `data-i`
  (digitação), `data-c` (change). Registrar com `acao`/`form`/`aoDigitar`/
  `aoMudar` de `js/ui/base.js`. `data-i` é reservado — índice de linha usa
  `data-ln`.
- **Todo HTML passa pelo `h` de `js/ui/html.js`**, que escapa o que é
  interpolado. `raw()` só para markup gerado pelo próprio app. `juntar(lista,
  (x,i)=>…)` passa o índice — antes não passava, e a tela "Quais colunas são
  quais?" da importação saía com todas as opções `value=""`.
- **Função solta não pode ir dentro de `const REL={…}`** em
  `telas/relatorios.js` (é um objeto): quebra o app inteiro no navegador, e o
  `node --check` não acusa. Os testes de Node também não — só o e2e pega.
- **Documento abre num painel** (lateral no computador, folha no celular) com
  resumo, parcelas, pagamentos, lançamentos do razão, histórico de auditoria e só
  as ações válidas no estado.
- **Pagamento no modelo do SAP** (pedido do usuário): parceiro → tudo que ele tem
  em aberto daquele lado → marca e ajusta o valor de cada linha → conta e data.
  Um pagamento quita várias contas; valor menor = parcial. Cartão não aparece
  ali — é pago pela fatura.
- **Busca global** `Ctrl/⌘+K`: documentos (por número também), parceiros, contas,
  cartões, faturas, pagamentos.
- **No celular:**
  - dock com "+";
  - tabela vira cartão, em grade: texto à esquerda, valores empilhados à direita
    (posição absoluta empilhava um valor sobre o outro);
  - filtros recolhidos atrás de "Filtros (n)", que conta os que fogem do padrão;
  - indicadores das listas rolam de lado;
  - o e2e confere que nenhuma tela passa de 390 px — elemento por elemento,
    porque com `overflow-x:clip` no html o `scrollWidth` não denuncia mais;
  - **campos com 16px no celular**: com menos, o iPhone dá zoom ao tocar no
    campo e não volta, e o usuário tinha de afastar o zoom com os dedos;
  - **no iOS, `maximum-scale=1`** (script no `index.html`): trava só o zoom
    automático — a pinça continua, porque o iOS ignora a trava para o gesto.
    No Android travaria a pinça, então não entra lá;
  - **áreas do sistema** (`env(safe-area-inset-*)`): com `viewport-fit=cover`
    o app vai até a borda, e no iPhone o relógio e a bateria ficavam por cima
    do título e do botão de busca. Topo, login, menu de baixo, avisos, barra
    de seleção e painel reservam esse espaço.
  - `overflow-x:clip` em html e body (não `hidden`, que quebraria a barra do
    topo presa) e `overflow-wrap:anywhere` nos textos: descrição de banco sem
    espaço quebra a linha em vez de alargar a tela.
- **Valor nunca é cortado com reticências.** O tamanho do número do indicador
  sai da largura do próprio cartão (`cqi`).
- **A classe `.sec` é do botão secundário; seção é `.secao`.** As duas já foram a
  mesma classe, e todo botão secundário ganhava 22 px de margem.
- **Filho de grade com coluna definida mede `position:absolute` pela coluna**, não
  pela linha. Por isso a caixa de seleção do cartão-linha tem `grid-column:auto`.
- **Painel fechado tem `visibility:hidden`.** Só deslizar para fora deixava o
  conteúdo alcançável pelo Tab.
- **Gráficos:**
  - `--serie1`/`--serie2` são azul e laranja, validados para daltonismo no claro
    e no escuro;
  - cor de estado nunca é cor de série;
  - dica ao passar o mouse;
  - tabela junto de todo gráfico.
- **Tema: escuro por padrão** (como o 2.2), claro, automático (escuro das
  18h às 6h, virando sozinho sem recarregar) ou igual ao aparelho —
  `js/ui/tema.js`. O `index.html` repete a regra antes do primeiro desenho
  (`localStorage wigo3.tema`) para a tela não piscar branca.
- **O nome no menu é sempre WIGO.** O campo de renomear saiu a pedido do
  usuário; `preferencias.nomeApp` continua gravado pela migração, sem uso.

---

## Com o usuário

**Fale SEMPRE em português com o usuário** — respostas, perguntas, avisos e
resumos. Pedido explícito dele.

## Convenções do código

- **Tudo em português**: nomes, funções, comentários.
- Comentários explicam **por quê**, não o quê; vários registram bugs já
  corrigidos. Não apague ao refatorar.
- Estilo compacto, várias declarações por linha. Acompanhe o arquivo.
- Regra de negócio nova vai para `js/financas/`, com teste em `tests/`; a tela só
  chama comando e desenha.
- Sem framework, sem TypeScript, sem dependência instalada. Único import externo:
  o SDK do Firebase pelo `gstatic.com`.
- Commit: uma linha em português, sem acento, descrevendo o efeito para quem usa.

---

## Netlify e repositório

| Projeto | URL | Situação |
|---|---|---|
| `hamster-fastidious-2b9ffd` | fastidious-hamster-2b9ffd.netlify.app | **Este é o site real** |
| `stalwart-capibara-312533` | stalwart-capybara-312533.netlify.app | Abandonado — versão de 06/07/2026 |

`netlify.toml`:
- sem etapa de build;
- `no-cache` no HTML;
- revalidação (ETag) em `js/` e `css/` — os módulos não têm hash no nome, e um
  `app.js` novo com um `base.js` velho do cache quebraria a importação.

**Por que o repositório é público:** o plano gratuito do Netlify só aceita um
contribuidor em repositório privado, e o deploy do commit `60df7fe` foi recusado
("contribuinte Git não reconhecido"). Tornar público não expõe nada: o
`firebaseConfig` já é visível no site, e não há `.env`, token nem chave privada
versionados. **O que protege os dados é a regra do Firestore.**

Arquivos que sobraram:
- `firebase.json` e `.firebaserc`: restos de uma migração para Firebase Hosting
  que foi abandonada;
- `firestore.rules.referencia`: a regra do 2.2, substituída por `firestore.rules`.

---

## Estado atual

Versão 3 publicada no `main` em 27/09/2026, direto, sem PR, a pedido do
usuário. No mesmo dia: subcategorias e, depois, compra de outra pessoa
(terceiro) com conta a receber vinculada — sem mudança nas regras do
Firestore. As regras de `firestore.rules` foram coladas no console no mesmo dia.
Cada usuário (eram 8, todos com e-mail e senha) migra os dados do 2.2 no
primeiro login na versão 3.

## Pendente de ação manual

1. **Para o login com Google funcionar** (sem isso o botão mostra a
   mensagem de onde ativar):
   - Authentication → **Método de login** → Adicionar novo provedor →
     **Google** → Ativar → e-mail de suporte → Salvar;
   - Authentication → **Configurações → Domínios autorizados** → adicionar
     `fastidious-hamster-2b9ffd.netlify.app`.
2. As regras do Firestore não foram testadas no emulador oficial. Os testes
   reproduzem a mesma lógica no Firestore simulado (ver "Testes"), e o app
   não grava nada que elas recusem.
3. Decidir o destino de `stalwart-capibara-312533` no Netlify.
