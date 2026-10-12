# ADR-0004 — Acesso ao vault via API REST do GitHub com concorrência otimista

- **Status:** Aceito
- **Data:** 2026-10-12

## Contexto

A aplicação roda em funções serverless (sistema de arquivos efêmero, sem processo persistente).
Clonar o repositório a cada requisição é lento e caro. Precisamos ler e gravar notas com segurança,
sem sobrescrever edições concorrentes feitas no Obsidian ou em outra aba.

Limites verificados em 12/10/2026 (docs.github.com):

- Limite primário: 5.000 requisições/hora por usuário (token pessoal); GitHub App: ≥ 5.000, até 12.500.
- Limites secundários de criação de conteúdo (≈ 80/min e 500/h, **não confirmado nesta data** —
  tratamos como restrição de projeto).
- Contents API: leitura de até 1 MB com o media type padrão; 1–100 MB só via `raw`/blob.
- Trees API recursiva: até 100.000 entradas / 7 MB (acima disso, `truncated: true`).
- Gravações via Contents API no mesmo repositório devem ser serializadas (concorrência gera 409).

## Decisão

1. Uma **porta** `VaultStore` (`src/lib/vault/types.ts`) com operações `list`, `read`, `create`,
   `update`. Adaptadores:
   - `GitHubVaultStore` — produção. `fetch` injetável; timeout por requisição; sem dependência do Octokit.
   - `FsVaultStore` — pasta local (desenvolvimento, E2E, uso local com o Obsidian). **Recusa iniciar
     na Vercel.**
   - `MemoryVaultStore` — testes unitários.
2. **Versão = SHA do blob Git** (`sha1("blob <bytes>\0" + conteúdo)`). O adaptador local calcula o
   mesmo SHA que o GitHub, então as semânticas de conflito são idênticas em todos os adaptadores.
3. Operações:
   - `list`: `GET /git/trees/{branch}?recursive=1` (1 chamada para a árvore inteira). Repositório
     vazio → lista vazia. Árvore truncada → erro explícito (fallback por subárvores fica para quando
     for necessário).
   - `read`: `GET /contents/{path}?ref={branch}`; se o arquivo tiver > 1 MB, lê o blob pelo SHA.
   - `create`: `PUT /contents/{path}` **sem** `sha` → falha se já existir (`AlreadyExistsError`).
   - `update`: `PUT /contents/{path}` **com** `sha` esperado → 409/422 viram `ConflictError`.
   - Movimentações/renomeações em lote (Fase 2) usarão a Git Data API (blobs → tree → commit →
     atualização de ref **sem force**) para commits atômicos de múltiplos arquivos.
4. **Idempotência:** se um `update` retorna conflito, o serviço relê o arquivo; se o conteúdo remoto
   já é exatamente o enviado (ex.: nova tentativa após timeout), a operação é tratada como sucesso.
5. **Origem identificável:** toda mensagem de commit termina com o trailer
   `Second-Brain-Origin: web` (ou `local`), além de uma linha descritiva (`Atualiza <caminho>`).
6. **Autenticação no GitHub (Fase 1):** token _fine-grained_ restrito **somente** ao repositório do
   vault, com `Contents: Read and write` e `Metadata: Read`. Guardado apenas em variável de ambiente
   do servidor. Evolução prevista: GitHub App (tokens de instalação de curta duração).
7. **Erros** são mapeados para tipos próprios (`NotFoundError`, `ConflictError`, `AlreadyExistsError`,
   `VaultRateLimitedError`, `VaultUnavailableError`, `VaultConfigError`) e **nunca** repassam o corpo
   da resposta do GitHub ao cliente.

## Alternativas consideradas

- **Clonar com `isomorphic-git` em `/tmp`:** cold starts lentos, `/tmp` efêmero, memória limitada.
- **Git Data API para tudo:** atômico, mas 4+ chamadas por gravação (latência 4×). Reservado a lotes.
- **GraphQL `createCommitOnBranch`:** atômico em 1 chamada com `expectedHeadOid`; porém o conflito é
  no nível do branch (qualquer commit em outro arquivo invalida). Pode substituir os lotes no futuro.
- **GitHub App já na Fase 1:** mais seguro (token curto), porém exige criar app, chave privada e
  instalação. Adiado para não bloquear o primeiro uso; a porta permite trocar sem mudar o domínio.

## Consequências

- (+) Nenhuma gravação cega: conflito é detectado pelo próprio GitHub.
- (+) Mesma suíte de contrato roda contra memória, pasta local, GitHub falso e (opcional) GitHub real.
- (−) Latência de rede em toda leitura/gravação; sem cache na Fase 1 (a Fase 2 usa ETag/índice).
- (−) Token pessoal com validade longa precisa de rotação manual (procedimento em SECURITY.md).
