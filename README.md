# WIGO — Finanças

App de finanças pessoais em arquivo único (`index.html`), com Firebase Auth + Firestore.

- **Projeto Firebase:** `app-fin-ebcfe`
- **Hosting novo:** https://app-fin-ebcfe.web.app
- **Hosting antigo:** https://stalwart-capybara-312533.netlify.app (Netlify — desligar só depois de validar o novo)

---

## Como fazer deploy

```bash
firebase deploy --only hosting
```

Sempre com `--only hosting`. Sem essa flag, um `firebase deploy` tenta publicar
tudo que estiver declarado no `firebase.json`.

Não existe limite de quantidade de deploys no plano Spark (gratuito).

## Fluxo de trabalho

```bash
git add .
git commit -m "descricao da mudanca"
git push
firebase deploy --only hosting
```

O `git push` guarda o histórico. O `firebase deploy` publica. São passos
independentes — dá pra commitar sem publicar e vice-versa.

---

## Estrutura

| Arquivo | Papel |
|---|---|
| `index.html` | O app inteiro — CSS, JS e markup inline |
| `firebase.json` | Config do Hosting (SPA rewrite + no-cache no HTML) |
| `.firebaserc` | Aponta para o projeto `app-fin-ebcfe` |
| `firestore.rules.referencia` | Regras de segurança sugeridas — **não** entram em nenhum deploy |

## Onde os dados ficam

Firestore, um documento por usuário:

```
users/{uid} = { data: "<estado completo em JSON>", updatedAt: <timestamp> }
```

O Hosting serve apenas o `index.html`. Trocar de host não afeta os dados —
eles vivem no Firestore e são acessados pelo mesmo `projectId` em qualquer
lugar que o app rode.

## Versão publicada em 08/08/2026

O `index.html` deste repo foi capturado direto da produção do Netlify
(MD5 `882a0e8dc4bdf0043ede214c4ae6456a`). É idêntico ao `WIGO3.html`
de 06/07/2026.

Features descritas em documentos anteriores que **não** existem neste código:
campo de Competência, design system Aurora, Command Palette, tutorial de
9 steps, spending heatmap, floating dock. O app também usa **Firestore**,
não Realtime Database.
