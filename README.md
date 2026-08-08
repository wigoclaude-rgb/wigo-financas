# WIGO — Finanças

App de finanças pessoais em arquivo único (`index.html`), com Firebase Auth + Firestore.

- **Site:** https://stalwart-capybara-312533.netlify.app
- **Repositório:** https://github.com/wigoclaude-rgb/wigo-financas (privado)
- **Projeto Firebase:** `app-fin-ebcfe` (só Auth + Firestore — o site não é hospedado lá)

---

## Como fazer deploy

O Netlify está ligado a este repositório. Publicar é só empurrar para o `main`:

```bash
git add .
git commit -m "descricao da mudanca"
git push
```

O Netlify detecta o push e publica sozinho em ~30 segundos. Não há terminal
nem upload manual no meio do caminho.

Como o `netlify.toml` deixa o `command` vazio, não existe etapa de build —
o consumo de build minutes por deploy fica perto de zero.

---

## Estrutura

| Arquivo | Papel |
|---|---|
| `index.html` | O app inteiro — CSS, JS e markup inline |
| `netlify.toml` | Config do deploy: sem build, SPA redirect, no-cache no HTML |
| `firestore.rules.referencia` | Regras de segurança sugeridas — referência, não é publicado |
| `firebase.json` / `.firebaserc` | **Inativos.** Sobraram de uma migração para Firebase Hosting que foi abandonada. Não afetam o deploy do Netlify |

## Onde os dados ficam

Firestore, um documento por usuário:

```
users/{uid} = { data: "<estado completo em JSON>", updatedAt: <timestamp> }
```

O Netlify serve apenas o `index.html`. Os dados vivem no Firestore e são
acessados pelo `projectId` embutido no HTML, de qualquer lugar que o app rode —
hospedagem e banco são independentes.

## Histórico de versões do `index.html`

| Commit | Origem | Tamanho | Estado |
|---|---|---|---|
| 1º | Produção do Netlify (= `WIGO3.html`, 06/07/2026) | 100.314 B | O que está no ar hoje |
| 2º | `Downloads/WIGO.html` (08/08/2026) | 153.834 B | Versão atual — a publicar |

A versão nova traz Competência, design system Aurora, Command Palette,
tutorial de onboarding, spending heatmap, floating dock e bottom sheets.

Ela aponta para o mesmo projeto (`app-fin-ebcfe`) e grava no mesmo caminho
(`users/{uid}`) que a versão em produção, então **não há migração de dados**
envolvida na troca.

Observação: o app usa **Firestore**, não Realtime Database — documentos
anteriores diziam o contrário.
