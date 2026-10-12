# ADR-0009 — Camada de IA independente de provedor

- **Status:** Proposto (implementação na Fase 5; princípios valem desde já)
- **Data:** 2026-10-12

## Contexto

A IA deve participar de captura, busca, síntese e descoberta, sempre fundamentada em fontes
verificáveis, sem amarrar o código a um fornecedor e sem enviar a base inteira a terceiros.

## Decisão (proposta)

1. **Interfaces no domínio** (`src/lib/ai/`), sem tipos de SDK vazando para fora dos adaptadores:
   `TextGenerator` (gerar/streaming), `StructuredExtractor` (saída validada por Zod),
   `EmbeddingProvider` (`embed(texts) → vetores` com `model` e `dimensions`), `Reranker` (opcional).
   Casos de uso (`answerQuestion`, `summarizeSource`, `extractConcepts`, `suggestLinks`,
   `findGaps`, `findContradictions`) dependem só dessas interfaces.
2. **Adaptadores:** Anthropic (SDK oficial `@anthropic-ai/sdk`) e OpenAI; embeddings via OpenAI ou
   Voyage AI (a Anthropic não oferece modelo de embeddings próprio). Modelo, provedor e parâmetros por
   **tarefa**, configurados por variáveis de ambiente do servidor (nunca no navegador).
3. **Referência de preços (12/10/2026, por 1M tokens, entrada/saída):** Claude Haiku 5.5 US$ 0,10/0,50
   (prompts até 100 k), Claude Sonnet 5.5 US$ 2/10, Claude Opus 5.5 US$ 4/20; embeddings
   `text-embedding-3-small` US$ 0,02, `voyage-4-lite` ≈ US$ 0,02 (não confirmado na página oficial).
   A escolha final de embeddings depende de uma avaliação com um conjunto sintético em português.
4. **RAG com citações verificáveis:**
   - Trechos indexados guardam `path`, `blob_sha`, hierarquia de cabeçalhos, offsets e, quando houver,
     página/timestamp.
   - O modelo recebe trechos numerados e só pode citar esses IDs; o servidor **valida** cada citação
     (ID existente no conjunto recuperado; citação literal precisa ser substring do trecho).
   - Resposta sem evidência suficiente → "não encontrei evidência suficiente" + o que foi buscado.
   - A resposta distingue: o que as fontes afirmam · opinião registrada pelo usuário · inferência da IA ·
     não verificado.
5. **Segurança contra prompt injection:** conteúdo recuperado é **dado não confiável**, delimitado e
   rotulado; o modelo de resposta **não tem ferramentas** que escrevam no vault ou chamem a rede;
   qualquer alteração proposta pela IA vira uma proposta revisável, nunca uma escrita automática.
6. **Privacidade:** apenas os trechos necessários vão ao provedor; cada recurso de IA pode ser
   desligado; a interface explica o que é enviado a quem ([SECURITY.md](../SECURITY.md)).
7. **Custos:** limite de contexto por operação, cache (inclusive _prompt caching_), modelos menores
   para tarefas simples, registro de uso e custo estimado por operação, orçamento mensal com corte
   (`AI_MONTHLY_BUDGET_USD`), backoff em rate limits, cancelamento de operações longas, reindexação
   incremental por SHA.

## Consequências

- (+) Trocar de fornecedor é trocar um adaptador.
- (−) Recursos exclusivos de um provedor (ex.: citações nativas) só são usados atrás da interface e
  com fallback.
