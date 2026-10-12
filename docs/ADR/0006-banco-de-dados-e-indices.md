# ADR-0006 — PostgreSQL gerenciado para dados derivados e operacionais

- **Status:** Aceito (implementação na Fase 2)
- **Data:** 2026-10-12

## Contexto

A Fase 2 precisa de busca textual, backlinks, notas recentes e estado de sincronização sem ler todas
as notas do GitHub a cada consulta. A Fase 5 precisa de busca vetorial. Os dados no banco são
derivados do vault (reconstruíveis), mais alguns dados operacionais.

Comparação feita em 12/10/2026 (páginas oficiais; reconfirmar antes de contratar):

| | Neon Free | Supabase Free |
| --- | --- | --- |
| Armazenamento | 1 GB por projeto (alterado em 02/10/2026) | 500 MB |
| Computação | 100 CU-h/mês, escala a zero após 5 min | CPU compartilhada |
| Inatividade | Escala a zero, **não pausa o projeto** | **Pausa após 7 dias** sem uso (restauração manual) |
| pgvector | Sim (HNSW até 2.000 dimensões em `vector`) | Sim |
| Branches | 10 por projeto (útil para previews) | Não no Free |
| Integração Vercel | Marketplace nativo (antigo Vercel Postgres migrou para Neon) | Integração disponível |
| Plano pago | Por uso, sem mínimo mensal | US$ 25/mês |

## Decisão

1. **PostgreSQL padrão, hospedado no Neon**, conectado via driver serverless e ORM/migrações com
   **Drizzle** (SQL explícito, migrações versionadas). Nenhum recurso proprietário do provedor é usado
   — trocar para Supabase, RDS ou Postgres próprio é um `pg_dump`/`pg_restore`.
2. **pgvector condicionado a avaliação** na Fase 5: com um vault pessoal (dezenas de milhares de
   trechos), HNSW no próprio Postgres deve bastar. Se a avaliação mostrar o contrário, reavaliar.
3. Busca textual com `tsvector` (configuração `portuguese` + `unaccent`) e `pg_trgm` para títulos;
   fusão híbrida por _Reciprocal Rank Fusion_ na Fase 5.
4. Toda linha derivada guarda `path`, `blob_sha` e `indexed_commit_sha`; reindexar é idempotente.
5. Migrações: somente aditivas por padrão; migração destrutiva exige plano de rollback escrito,
   backup verificado e execução manual (nunca automática em produção).
6. Previews usam **branch de banco** própria; nunca o banco de produção.

## Alternativas consideradas

- **Supabase:** bom produto e já usado pelo dono em outro projeto, mas a pausa após 7 dias de
  inatividade é arriscada para um sistema pessoal que pode ficar dias sem uso.
- **SQLite/Turso:** simples, mas pgvector + FTS em português são mais maduros no Postgres.
- **Índice em memória/arquivo (MiniSearch, Orama):** não persiste entre invocações serverless.
- **Banco vetorial dedicado (Pinecone etc.):** mais um fornecedor e mais um lugar com dados pessoais.

## Consequências

- (+) Um único banco para metadados, filas, FTS e vetores; portável.
- (−) Escala a zero implica latência de "acordar" (geralmente sub-segundo) na primeira consulta.
- (−) Mais um serviço com dados derivados sensíveis → criptografia em trânsito, acesso só pelo servidor.
