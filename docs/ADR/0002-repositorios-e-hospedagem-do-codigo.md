# ADR-0002 — Repositórios separados para código e conhecimento

- **Status:** Aceito
- **Data:** 2026-10-12

## Contexto

O código da aplicação e o conhecimento pessoal precisam de ciclos de versionamento independentes, e
o vault jamais pode ir para o repositório do aplicativo.

## Decisão

1. **Dois repositórios no GitHub da conta `leandrovieira40-ops`:**
   - `second-brain-leandro` — código, testes, documentação e CI do aplicativo (privado).
   - `second-brain-leandro-vault` (nome sugerido) — **privado**, somente notas Markdown, templates e
     anexos versionáveis. Criado a partir de `vault-template/` ([VAULT_SYNC.md](../VAULT_SYNC.md)).
2. O repositório do aplicativo usa **apenas fixtures sintéticas** (`tests/fixtures/vault/`) e o modelo
   de vault (`vault-template/`). Nenhum dado pessoal entra nele; o `.gitignore` bloqueia `.env*`,
   `/vault/`, exports e o vault temporário dos testes.
3. O token do GitHub usado pela aplicação em produção dá acesso **somente** ao repositório do vault —
   nunca ao do aplicativo.
4. Os primeiros commits foram feitos num repositório temporário (o único disponível na sessão inicial)
   e transferidos com o histórico preservado (`git subtree split`) para `second-brain-leandro`.

## Alternativas consideradas

- **Monorepo com código e vault:** mistura dados pessoais com código e CI. Rejeitado.
- **Vault dentro do repositório do aplicativo em pasta ignorada:** frágil — um `git add -f` vaza tudo.

## Consequências

- (+) Ciclos de versão independentes; o vault pode ser clonado e aberto no Obsidian sem o código.
- (+) Permissões mínimas: o token de produção não enxerga o código, e vice-versa.
- (−) Dois repositórios para administrar (backup do vault é responsabilidade separada).
