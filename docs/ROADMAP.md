# Roadmap

Construção incremental: cada fase entrega software funcional, testado e documentado. Uma fase só é
marcada como concluída quando seu critério foi **demonstrado** (teste automatizado ou verificação
manual registrada), nunca por aparência da interface.

Prioridade: integridade e segurança → captura/edição → busca → links → importação → IA fundamentada →
descoberta → produtividade avançada.

## Fase 0 — Descoberta e arquitetura ✅

Inspeção do ambiente, arquitetura, ADRs, modelo de segurança e de dados, riscos, custos, critérios.

## Fase 1 — Fundação funcional ✅ (falta só a verificação em produção)

- [x] Estrutura da aplicação e tooling estrito (formatação, lint, tipos, testes, build)
- [x] CI no GitHub Actions (`.github/workflows/ci.yml`) — primeira execução verde em 12/10/2026
- [x] Autenticação (senha + sessão), proteção de todas as rotas, cabeçalhos de segurança
- [x] Porta `VaultStore` com adaptadores GitHub, pasta local e memória; suíte de contrato
- [x] Leitura, criação e edição de notas Markdown com frontmatter
- [x] Editor (CodeMirror 6) e visualização (Markdown + wikilinks resolvidos)
- [x] Pastas e navegação (árvore, filtro por nome/caminho)
- [x] Salvamento confiável: SHA esperado, rascunho local, autosave limitado, conflitos, status honesto
- [x] Painel de metadados, links de saída (com links quebrados) e tags da nota
- [x] Testes unitários, de contrato e ponta a ponta
- [ ] Verificação no ambiente publicado (Vercel + repositório real do vault) — **depende de
      configuração pelo dono** ([DEPLOYMENT.md](./DEPLOYMENT.md))

**Critério:** criar uma nota, salvá-la, fechar a aplicação, reabri-la e encontrar o conteúdo intacto.
Demonstrado por `e2e/notes.spec.ts` ("criar, salvar, fechar, reabrir…") contra o build de produção
com o adaptador de pasta local. Falta repetir no ambiente publicado com o GitHub real
([DEPLOYMENT.md §4](./DEPLOYMENT.md#4-verificação-pós-deploy-obrigatória)).

## Fase 2 — Experiência de conhecimento 🚧

### 2A — sem banco de dados ✅

- [x] Commit atômico de vários arquivos no `VaultStore` (Git Data API no GitHub), histórico e leitura de versões
- [x] Captura rápida (Alt+C) direto para o Inbox, sem classificar
- [x] Autocompletar de `[[wikilinks]]` (sem acentos/maiúsculas; nomes repetidos sugerem o caminho)
- [x] Criar nota a partir de link inexistente (na visualização e no painel de links)
- [x] Lixeira lógica em `.trash/` (mesma pasta do Obsidian): mover num único commit, restaurar sem
      sobrescrever, excluir de vez
- [x] Histórico de versões da nota e restauração como nova versão (com o vault no GitHub)
- [x] Favoritos guardados no vault (`.second-brain/favorites.json`) e notas recentes por navegador

### 2B — com índice derivado (PostgreSQL)

Postgres (Neon) + Drizzle; índice derivado com webhook `push` e reconciliação; backlinks com
contexto; busca textual global (Ctrl+K) com filtros e trechos; página de tags; renomear/mover com
atualização atômica dos links que apontam para a nota; exportação (zip) e importação de vault; rate
limit de login no banco; GitHub OAuth.

**Critério:** registrar, organizar, encontrar e relacionar conhecimento sem IA. Cenários A, G, H, I.

## Fase 3 — Grafo e navegação semântica

Grafo global e local (com filtros e limites de renderização), links quebrados e notas órfãs no
dashboard, mapas de conteúdo, sugestões de relação (hipóteses explicadas, com aceitar/rejeitar/ignorar
persistidos em `.second-brain/`).

**Critério:** navegar por relações explícitas e revisar sugestões com explicações. Cenário E.

## Fase 4 — Ingestão de fontes

Fila assíncrona (ADR-0010), armazenamento de anexos (ADR-0011). Ordem: texto colado e Markdown →
artigos por URL (com proteção SSRF e respeito a paywalls) → livros e notas de leitura → PDFs (texto,
detecção de digitalizado, OCR opcional, páginas) → conversas exportadas do Claude/ChatGPT (JSON/MD,
revisão antes de incorporar, detecção de duplicatas) → vídeos e podcasts (transcrições legítimas,
timestamps) → cursos → documentos profissionais.

**Critério:** incorporar fontes, preservar o original e localizar o conteúdo extraído. Cenário B.

## Fase 5 — IA e RAG

Abstração de provedores (ADR-0009), embeddings incrementais, busca híbrida (FTS + vetorial + RRF),
chat com a base, citações validadas, sínteses multi-fonte, comparação de ideias, extração de
conceitos, sugestões de notas permanentes, controle de custos, conjunto de avaliação sintético.

**Critério:** perguntas com fontes verificáveis e indicação clara de evidência insuficiente.
Cenários C, D.

## Fase 6 — Inteligência avançada

Lacunas de conhecimento (com evidências), contradições potenciais, conexões projeto × leituras,
revisões periódicas, perguntas de pesquisa, aplicação prática, assistente contextual na nota, painel
de pendências intelectuais. Nada altera notas sem consentimento.

## Fase 7 — Robustez e otimização

Recuperação de falhas, conflitos de sincronização, reindexação completa, **backup e restauração
testados em ambiente isolado**, performance, acessibilidade (auditoria), revisão de segurança, custos,
E2E completos, observabilidade, documentação final. Cenários F–J consolidados.

## Mapa dos cenários de aceitação

| Cenário | Descrição                                              | Fase | Situação                                                                         |
| ------- | ------------------------------------------------------ | ---- | -------------------------------------------------------------------------------- |
| A       | Captura, tags, relação, busca                          | 2    | Parcial: criação, tags e links na Fase 1; busca na 2                             |
| B       | Importar artigo com resumo revisável                   | 4–5  | Planejado                                                                        |
| C       | Nota permanente com fontes visíveis                    | 5    | Planejado                                                                        |
| D       | Pergunta à IA com referências clicáveis                | 5    | Planejado                                                                        |
| E       | Sugestão de relação explicada                          | 3    | Planejado                                                                        |
| F       | Falha de rede não indica salvamento falso              | 1    | ✅ Testado (E2E)                                                                 |
| G       | Alteração externa detectada sem perda                  | 1–2  | ✅ Detecção de conflito testada (E2E); índice na Fase 2                          |
| H       | Vault portável fora da aplicação                       | 1    | Por construção (Markdown no Git); verificação manual em VAULT_SYNC.md            |
| I       | Restaurar nota excluída                                | 2    | ✅ Lixeira + restauração testadas (E2E); histórico no GitHub testado no contrato |
| J       | Não autenticado não acessa; nenhuma chave no navegador | 1    | ✅ Testado (E2E + varredura do bundle na CI)                                     |
