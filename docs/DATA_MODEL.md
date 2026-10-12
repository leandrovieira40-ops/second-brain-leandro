# Modelo de dados

## 1. Classificação dos dados

Todo dado do sistema pertence a uma de quatro classes. A classe define onde ele vive e como é
recuperado após uma falha.

| Classe | Onde vive | Exemplos | Recuperação |
| --- | --- | --- | --- |
| **Canônico** | Vault (Markdown no GitHub) | Notas, frontmatter, links, notas de fonte, templates | Histórico Git + backup do repositório |
| **Binário canônico** | Armazenamento de objetos (Fase 4) | PDFs, áudios, imagens grandes | Backup próprio do bucket (não está no Git) |
| **Derivado** | PostgreSQL (Fase 2+) | Índice de notas, links resolvidos, backlinks, FTS, trechos, embeddings | **Reconstruível** a partir do vault (`reindex`) |
| **Decisão do usuário não derivável** | Vault (`.second-brain/`) — ver §5 | Sugestões aceitas/rejeitadas, revisões concluídas | Histórico Git |
| **Operacional** | PostgreSQL | Fila de jobs, uso/custo de IA, estado de sincronização, rate limit | Perda tolerável (backup do banco reduz impacto) |

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
sources: ["[[Positioning (Al Ries e Jack Trout)]]"]
status: active
---

Texto livre em Markdown, com [[Outras Notas]], [[Nota#Seção]], [[Nota|alias]] e #tags.
```

### Campos comuns (todos opcionais, exceto quando a própria aplicação cria a nota)

| Campo | Tipo | Notas |
| --- | --- | --- |
| `id` | ULID | Estável; gerado na criação ([ADR-0012](./ADR/0012-identificadores-datas-e-nomes.md)) |
| `title` | string | Se ausente, o título é o nome do arquivo |
| `type` | enum | Ver §3. Se ausente: `note` |
| `created`, `updated` | `AAAA-MM-DD` | `updated` é ajustado no editor ao salvar, se o campo existir |
| `tags` | lista de strings | Também reconhecidas `#tags` no corpo |
| `aliases` | lista de strings | Usadas na resolução de `[[links]]` |
| `sources` | lista de wikilinks | Fontes que fundamentam a nota |
| `status` | string | `active`, `draft`, `archived`, `reading`, … (varia por tipo) |

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

| `type` | Pasta padrão | Campos adicionais (todos opcionais) |
| --- | --- | --- |
| `inbox` | `00-Inbox` | — (captura rápida, sem classificação obrigatória) |
| `fleeting` | `01-Fleeting-Notes` | — |
| `source` | `02-Sources/<subtipo>` | `source_type` (book, article, website, newsletter, paper, video, podcast, course, conversation, document), `author`, `url`, `published`, `captured`, `publisher` |
| `book` | `02-Sources/Books` | `author`, `publisher`, `year`, `isbn`, `reading_status` (to-read, reading, finished, abandoned), `started`, `finished`, `rating` (1–5), `metadata_origin` (user, external:<serviço>) |
| `permanent` | `03-Permanent-Notes` | `sources` |
| `concept` | `04-Concepts` | `aliases`, `sources` |
| `project` | `05-Projects` | `project_status` (active, paused, done, dropped), `goal`, `started`, `due` |
| `area` | `06-Areas` | — |
| `moc` | `07-Maps-of-Content` | — |
| `daily` | `08-Daily-Notes` | `date` |
| `review` | `09-Reviews` | `period` |
| `template` | `10-Templates` | — (não aparece em buscas por padrão) |
| `note` | qualquer | Tipo padrão quando ausente |

Citações em notas de livro usam o callout `[!quote]` com `p.` quando a página for conhecida — páginas
nunca são inventadas. Dados bibliográficos obtidos de integrações externas levam `metadata_origin`.

## 4. Links

- `[[Destino]]`, `[[Destino|texto]]`, `[[Destino#Cabeçalho]]`, `[[Destino#^bloco]]`, `![[Embed]]`.
- Ignorados dentro de blocos de código e código inline.
- **Resolução** (compatível com o Obsidian): caminho exato (com ou sem `.md`) → sufixo de caminho →
  nome do arquivo (sem diferenciar maiúsculas) → alias do frontmatter. Em caso de ambiguidade, vence a
  nota na mesma pasta da origem, depois o caminho mais curto; a ambiguidade é sinalizada.
- Link sem destino = **link quebrado** (listado no painel da nota; na Fase 2, também no dashboard).

## 5. Pasta de dados da aplicação dentro do vault (`.second-brain/`)

Reservada para decisões do usuário que não são deriváveis, em formatos abertos (JSONL/YAML), por
exemplo `.second-brain/suggestions.jsonl` (sugestões aceitas/rejeitadas, Fase 3). Ela é versionada no
vault, então sobrevive à perda do banco. Arquivos dessa pasta não são notas e não aparecem na árvore.

## 6. Esquema do banco (planejado — Fase 2+)

```text
notes            (id ULID?, path PK, title, type, blob_sha, commit_sha, frontmatter JSONB,
                  tags TEXT[], aliases TEXT[], word_count, created, updated, indexed_at,
                  search_vector TSVECTOR)
links            (source_path, target_raw, target_path NULL, kind [wikilink|embed|markdown],
                  heading, block, line, context TEXT, resolved BOOL)
sync_state       (branch, last_indexed_commit_sha, last_webhook_at, last_full_reindex_at)
chunks           (id, path, blob_sha, ord, heading_path TEXT[], start_offset, end_offset,
                  page NULL, timestamp_s NULL, text, token_count)
embeddings       (chunk_id, model, dimensions, vector VECTOR(n), created_at)
jobs             (id, kind, idempotency_key UNIQUE, status, attempts, run_after, payload JSONB,
                  last_error_code, created_at, updated_at)
ai_usage         (id, operation, provider, model, input_tokens, output_tokens,
                  estimated_cost_usd, created_at)
auth_rate_limit  (key, window_start, count)
```

Toda tabela derivada pode ser apagada e reconstruída com `reindex` a partir do vault.
