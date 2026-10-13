# Modelo de dados

## 1. Classificação dos dados

Todo dado do sistema pertence a uma de quatro classes. A classe define onde ele vive e como é
recuperado após uma falha.

| Classe                               | Onde vive                         | Exemplos                                                               | Recuperação                                     |
| ------------------------------------ | --------------------------------- | ---------------------------------------------------------------------- | ----------------------------------------------- |
| **Canônico**                         | Vault (Markdown no GitHub)        | Notas, frontmatter, links, notas de fonte, templates                   | Histórico Git + backup do repositório           |
| **Binário canônico**                 | Armazenamento de objetos (Fase 4) | PDFs, áudios, imagens grandes                                          | Backup próprio do bucket (não está no Git)      |
| **Derivado**                         | PostgreSQL (Fase 2+)              | Índice de notas, links resolvidos, backlinks, FTS, trechos, embeddings | **Reconstruível** a partir do vault (`reindex`) |
| **Decisão do usuário não derivável** | Vault (`.second-brain/`) — ver §5 | Sugestões aceitas/rejeitadas, revisões concluídas                      | Histórico Git                                   |
| **Operacional**                      | PostgreSQL                        | Fila de jobs, uso/custo de IA, estado de sincronização, rate limit     | Perda tolerável (backup do banco reduz impacto) |

Regra: se um dado não é derivável e importa para o usuário, ele **não pode existir apenas no banco**.

## 2. Nota (arquivo Markdown)

```markdown
---
id: 01K7DQ2VQ8M6Z4X0R1S2T3V4W5
title: Posicionamento
type: concept
created: 2026-10-12
updated: 2026-10-12
tags: [marketing, estrategia]
aliases: [Positioning]
sources: ['[[Positioning (Al Ries e Jack Trout)]]']
status: active
---

Texto livre em Markdown, com [[Outras Notas]], [[Nota#Seção]], [[Nota|alias]] e #tags.
```

### Campos comuns (todos opcionais, exceto quando a própria aplicação cria a nota)

| Campo                | Tipo               | Notas                                                                                |
| -------------------- | ------------------ | ------------------------------------------------------------------------------------ |
| `id`                 | ULID               | Estável; gerado na criação ([ADR-0012](./ADR/0012-identificadores-datas-e-nomes.md)) |
| `title`              | string             | Se ausente, o título é o nome do arquivo                                             |
| `type`               | enum               | Ver §3. Se ausente: `note`                                                           |
| `created`, `updated` | `AAAA-MM-DD`       | `updated` é ajustado no editor ao salvar, se o campo existir                         |
| `tags`               | lista de strings   | Também reconhecidas `#tags` no corpo                                                 |
| `aliases`            | lista de strings   | Usadas na resolução de `[[links]]`                                                   |
| `sources`            | lista de wikilinks | Fontes que fundamentam a nota                                                        |
| `status`             | string             | `active`, `draft`, `archived`, `reading`, … (varia por tipo)                         |

Campos desconhecidos são preservados intocados. YAML inválido não impede salvar; a interface avisa.

### Proveniência do conteúdo

Para separar **conteúdo original**, **resumo da IA**, **interpretação pessoal**, **inferência da IA**,
**extração automática** e **não verificado**, a convenção é por seção e por bloco de citação do
Obsidian (_callouts_), legível sem a aplicação:

```markdown
> [!source] Trecho original (p. 42)
> "Texto exatamente como na fonte."

> [!ai-summary] Resumo gerado por IA — revisado em 2026-10-12
> …

> [!ai-inference] Inferência da IA — não verificada
> …

## Minha interpretação

…
```

Notas geradas ou alteradas pela IA registram no frontmatter `generated_by` (provedor/modelo) e
`reviewed: true|false` (Fase 5).

## 3. Tipos de nota e campos específicos

| `type`      | Pasta padrão           | Campos adicionais (todos opcionais)                                                                                                                                                  |
| ----------- | ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `inbox`     | `00-Inbox`             | — (captura rápida, sem classificação obrigatória)                                                                                                                                    |
| `fleeting`  | `01-Fleeting-Notes`    | —                                                                                                                                                                                    |
| `source`    | `02-Sources/<subtipo>` | `source_type` (book, article, website, newsletter, paper, video, podcast, course, conversation, document), `author`, `url`, `published`, `captured`, `publisher`                     |
| `book`      | `02-Sources/Books`     | `author`, `publisher`, `year`, `isbn`, `reading_status` (to-read, reading, finished, abandoned), `started`, `finished`, `rating` (1–5), `metadata_origin` (user, external:<serviço>) |
| `permanent` | `03-Permanent-Notes`   | `sources`                                                                                                                                                                            |
| `concept`   | `04-Concepts`          | `aliases`, `sources`                                                                                                                                                                 |
| `project`   | `05-Projects`          | `project_status` (active, paused, done, dropped), `goal`, `started`, `due`                                                                                                           |
| `area`      | `06-Areas`             | —                                                                                                                                                                                    |
| `moc`       | `07-Maps-of-Content`   | —                                                                                                                                                                                    |
| `daily`     | `08-Daily-Notes`       | `date`                                                                                                                                                                               |
| `review`    | `09-Reviews`           | `period`                                                                                                                                                                             |
| `template`  | `10-Templates`         | — (não aparece em buscas por padrão)                                                                                                                                                 |
| `note`      | qualquer               | Tipo padrão quando ausente                                                                                                                                                           |

Citações em notas de livro usam o callout `[!quote]` com `p.` quando a página for conhecida — páginas
nunca são inventadas. Dados bibliográficos obtidos de integrações externas levam `metadata_origin`.

## 4. Links

- `[[Destino]]`, `[[Destino|texto]]`, `[[Destino#Cabeçalho]]`, `[[Destino#^bloco]]`, `![[Embed]]`.
- Ignorados dentro de blocos de código e código inline.
- **Resolução** (compatível com o Obsidian): caminho exato (com ou sem `.md`) → sufixo de caminho →
  nome do arquivo (sem diferenciar maiúsculas) → alias do frontmatter. Em caso de ambiguidade, vence a
  nota na mesma pasta da origem, depois o caminho mais curto; a ambiguidade é sinalizada.
- Link sem destino = **link quebrado** (listado no painel da nota e, com o índice, no Início).
- **Renomear/mover** (Fase 2B) reescreve, no mesmo commit, só o destino dos links que apontavam para a
  nota — ou que passariam a apontar para outra por causa do nome novo —, preservando `#seção`,
  `|apelido` e `!embed`. O texto novo é o mais curto que resolve sem ambiguidade (nome; depois
  `pasta/nome`; por fim o caminho completo). Links em código, comentários `%% %%` e no frontmatter
  não são tocados. O `title:` do frontmatter acompanha o nome só quando foi ele que gerou o nome do
  arquivo.

## 5. Pasta de dados da aplicação dentro do vault (`.second-brain/`)

Reservada para decisões do usuário que não são deriváveis, em formatos abertos (JSONL/YAML), por
exemplo `.second-brain/suggestions.jsonl` (sugestões aceitas/rejeitadas, Fase 3). Ela é versionada no
vault, então sobrevive à perda do banco. Arquivos dessa pasta não são notas e não aparecem na árvore.

### Arquivos usados hoje

- **`.second-brain/favorites.json`** — favoritos, em ordem de inclusão:

  ```json
  { "version": 1, "notes": ["04-Concepts/Posicionamento.md"] }
  ```

  A aplicação nunca sobrescreve um arquivo inválido (avisa e pede correção manual).

### Lixeira (`.trash/`)

Mover para a lixeira grava `.trash/<caminho original>` e remove o original **no mesmo commit**.
Se já existir algo com esse nome na lixeira, o arquivo recebe o sufixo ` (excluída AAAA-MM-DD HHmm)`,
removido na restauração. Restaurar devolve ao caminho original; se ele estiver ocupado, cria
` (restaurada AAAA-MM-DD HHmm)` ao lado. É a mesma pasta usada pela lixeira do Obsidian.

## 6. Esquema do banco (derivado — ver ADR-0006 e ADR-0013)

O banco é **opcional** e **reconstruível**: apagar qualquer tabela abaixo não perde nada; "Sincronizar
índice" (ou `POST /api/index/sync`) recria tudo a partir do vault. Migrações SQL versionadas em
`drizzle/`, aplicadas só por `npm run db:migrate`.

### Implementado (Fase 2B)

```text
notes        path PK, blob_sha, title, type, note_id NULL, tags TEXT[], aliases TEXT[],
             keywords (aliases + tags), frontmatter JSONB, body (sem frontmatter), indexed_at,
             search TSVECTOR GERADO = título (peso A) + keywords (B) + corpo (C), configuração sb_pt
             (português + unaccent). Índices GIN: search, título (pg_trgm), tags.
links        id, source_path → notes ON DELETE CASCADE, target_raw, target_path NULL (= quebrado),
             subpath NULL, embed, line (no corpo), context (linha, até 300 caracteres)
attachments  path PK, blob_sha                      -- para resolver ![[embeds]] e links a anexos
sync_state   id = 1, fingerprint (da árvore indexada), note_count, indexed_at, last_error
```

- A atualização é incremental por `(path, blob_sha)` e serializada por `pg_advisory_xact_lock`.
- Arquivos em pastas ocultas (`.trash/`, `.second-brain/`, `.obsidian/`) não entram no índice.
- Links no frontmatter ainda não são indexados.

### Planejado

```text
chunks           (id, path, blob_sha, ord, heading_path TEXT[], start_offset, end_offset,
                  page NULL, timestamp_s NULL, text, token_count)            -- Fase 5
embeddings       (chunk_id, model, dimensions, vector VECTOR(n), created_at)  -- Fase 5 (pgvector)
jobs             (id, kind, idempotency_key UNIQUE, status, attempts, run_after, payload JSONB,
                  last_error_code, created_at, updated_at)                    -- Fase 4
ai_usage         (id, operation, provider, model, input_tokens, output_tokens,
                  estimated_cost_usd, created_at)                             -- Fase 5
auth_rate_limit  (key, window_start, count)
```
