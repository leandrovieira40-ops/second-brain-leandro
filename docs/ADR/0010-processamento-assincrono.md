# ADR-0010 — Processamento assíncrono

- **Status:** Proposto (Fase 4)
- **Data:** 2026-10-12

## Contexto

Ingestão de PDFs, transcrições e embeddings não cabe numa requisição HTTP. Limites da Vercel
verificados em 12/10/2026: funções até 300 s no Hobby (800 s no Pro); cron **no máximo 1×/dia** no
Hobby (por minuto no Pro); corpo de requisição até 4,5 MB; _Vercel Queues_ em beta pública desde
27/02/2026.

## Decisão (proposta)

1. **Fila em tabela do Postgres** (`jobs`: tipo, chave de idempotência única, estado, tentativas,
   `run_after`, erro resumido), consumida com `SELECT … FOR UPDATE SKIP LOCKED`.
2. **Disparo:** ao enfileirar, a própria requisição agenda o processamento com `after()` do Next.js
   (executa após a resposta, dentro do limite da função). Trabalhos longos são divididos em passos
   curtos que se reenfileiram (ex.: um PDF processado em lotes de páginas).
3. **Rede de segurança:** cron diário de varredura (Hobby) e botão "processar pendentes"; no Pro, cron
   por minuto. Reavaliar Vercel Queues quando sair do beta.
4. Estados visíveis: pendente · em processamento · concluído · concluído parcialmente · falhou ·
   requer revisão. Falhas nunca alteram o arquivo original.
5. Idempotência por `(tipo, path, blob_sha)`; repetir não duplica notas, anexos ou tarefas.

## Alternativas

Inngest, Trigger.dev, Upstash QStash: robustos, mas mais um fornecedor com acesso a dados. Ficam como
opção se a fila no Postgres se mostrar insuficiente.
