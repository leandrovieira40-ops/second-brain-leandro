# ADR-0002 — Repositórios separados e hospedagem provisória do código

- **Status:** Aceito (provisório)
- **Data:** 2026-10-12

## Contexto

O código da aplicação e o conhecimento pessoal precisam de ciclos de versionamento independentes, e
o vault jamais pode ir para o repositório do aplicativo.

A sessão de desenvolvimento inicial tinha acesso apenas ao repositório privado
`leandrovieira40-ops/quiz-aiprospect`, que contém **outro projeto** (quiz de diagnóstico via WhatsApp,
em Python). Criar repositórios novos é uma ação externa que depende do dono da conta.

## Decisão

1. Arquitetura-alvo com **dois repositórios**:
   - `second-brain` — código, testes, documentação, CI (pode ser público ou privado).
   - `second-brain-vault` — **privado**, somente notas Markdown, templates e anexos versionáveis.
2. **Provisoriamente**, o código vive no subdiretório `second-brain/` do repositório
   `quiz-aiprospect`, de forma 100% isolada (dependências, CI e documentação próprias). Nenhum arquivo
   do quiz é alterado. O workflow de CI fica em `.github/workflows/second-brain.yml` com filtro de
   caminho `second-brain/**`.
3. Assim que o repositório `second-brain` existir, o código é extraído **preservando o histórico**:

   ```bash
   git subtree split --prefix=second-brain -b second-brain-export
   git push git@github.com:<owner>/second-brain.git second-brain-export:main
   ```

   Depois, o workflow é movido para `.github/workflows/` do novo repositório e o subdiretório é
   removido do `quiz-aiprospect` (em um PR revisado).
4. O vault de desenvolvimento usa **apenas fixtures sintéticas** (`tests/fixtures/vault/`) e o modelo
   de vault (`vault-template/`). Nenhum dado pessoal entra neste repositório; o `.gitignore` bloqueia
   `.env*`, `/vault/` e exports.

## Alternativas consideradas

- **Escrever na raiz do branch, substituindo o quiz:** descartaria trabalho existente. Rejeitado.
- **Esperar a criação do novo repositório:** bloquearia o progresso por uma decisão reversível.
- **Monorepo definitivo com os dois projetos:** acopla projetos sem relação. Rejeitado como destino final.

## Consequências

- (+) Progresso imediato sem risco para o projeto existente; extração simples e com histórico.
- (−) Até a extração, CI e deploy precisam apontar para o subdiretório (na Vercel: _Root Directory_ =
  `second-brain`).

## Revisar quando

O repositório `second-brain` for criado — este ADR passa a "Substituído" após a extração.
