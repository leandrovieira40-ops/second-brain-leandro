# ADR-0013 — Índice derivado e sincronização com o vault

- **Status:** Aceito (implementação na Fase 2B)
- **Data:** 2026-10-12
- **Complementa:** [ADR-0006](./0006-banco-de-dados-e-indices.md), [ADR-0007](./0007-edicao-local-e-sincronizacao.md)

## Contexto

Busca global, backlinks, página de tags e renomear/mover com atualização de links precisam saber o
que existe em **todas** as notas. Ler o vault inteiro do GitHub a cada consulta é inviável (uma
chamada por nota; limite de 5.000/h). O índice precisa ser derivado, reconstruível e nunca a única
cópia de nada.

## Decisão

1. **Driver e ORM:** `pg` 8 (padrão, funciona com Neon e com PostgreSQL local) + Drizzle ORM 0.45
   (consultas tipadas) + drizzle-kit (migrações SQL versionadas em `drizzle/`, aplicadas por comando
   explícito — nunca automaticamente em produção).
2. **Tabelas** (ver DATA_MODEL.md §6): `notes` (caminho, SHA do blob, título, tipo, tags, aliases,
   frontmatter, texto para busca, `tsvector`), `links` (origem, alvo bruto, alvo resolvido, linha,
   contexto), `sync_state` (impressão digital da árvore indexada, contagem e último erro).
3. **Incremental e idempotente:** a reindexação compara `(path, blob_sha)` da árvore do vault com o
   índice: só lê e reprocessa o que mudou, remove o que sumiu. Repetir não duplica nada.
4. **Quando reindexar:**
   - logo após cada gravação feita pela aplicação (o caminho e o conteúdo já estão em mãos);
   - webhook `push` do GitHub (assinatura HMAC `X-Hub-Signature-256` verificada) para mudanças
     externas (Obsidian);
   - botão "Sincronizar índice" e verificação ao abrir a busca quando o índice está atrás do head.
5. **Falhas de indexação nunca afetam o vault:** a gravação da nota é confirmada antes; o índice
   fica marcado como atrasado e a interface informa.
6. **Opcional:** sem `DATABASE_URL`, a aplicação continua funcionando como na Fase 2A (busca e
   backlinks ficam indisponíveis, com aviso). Nada da Fase 1/2A passa a depender do banco.
7. **Busca:** `tsvector` com configuração `portuguese` + `unaccent` (título com peso A, aliases/tags
   peso B, corpo peso C) e `pg_trgm` para títulos com erro de digitação; trechos com `ts_headline`.

## Consequências

- (+) Buscas e backlinks em milissegundos, sem chamadas ao GitHub.
- (+) Apagar o banco não perde nada: "Sincronizar índice" (botão ou `POST /api/index/sync`)
  reconstrói tudo a partir do vault.
- (−) Mais um serviço (Neon) e a janela de atraso entre um push externo e o webhook.
