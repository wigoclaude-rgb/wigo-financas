# WIGO — Finanças

App de finanças pessoais em arquivo único (`index.html`), com Firebase Auth + Firestore.

- **Site:** https://fastidious-hamster-2b9ffd.netlify.app (projeto `hamster-fastidious-2b9ffd`)
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

## Atenção: existem dois projetos no Netlify

| Projeto | URL | Publicado | Situação |
|---|---|---|---|
| `hamster-fastidious-2b9ffd` | fastidious-hamster-2b9ffd.netlify.app | 27/07/2026 | **Este é o site real** |
| `stalwart-capibara-312533` | stalwart-capybara-312533.netlify.app | 06/07/2026 | Abandonado — versão velha |

O `index.html` deste repo é **byte a byte igual** ao que está publicado no
site real (MD5 `c0ff78d454c387d880a781bb01951e9e`). O mesmo arquivo está em
`Downloads/WIGO.html`.

O projeto `stalwart-capibara` serve a versão de 06/07 e não recebe
atualizações desde então. Só existe risco se alguém acessar aquele link
achando que é o app atual.

Observação: o app usa **Firestore**, não Realtime Database — documentos
anteriores diziam o contrário.
