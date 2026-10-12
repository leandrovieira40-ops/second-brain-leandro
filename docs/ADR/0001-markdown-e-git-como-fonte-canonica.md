# ADR-0001 — Markdown no Git como fonte canônica

- **Status:** Aceito
- **Data:** 2026-10-12

## Contexto

O sistema deve guardar conhecimento por muitos anos, sobreviver à própria aplicação e ser editável
no Obsidian. Interface, banco e índices de IA não podem ser a única cópia de nada importante.

## Decisão

1. Cada nota é um arquivo `.md` UTF-8 com frontmatter YAML opcional, em um repositório Git privado
   (o _vault_), seguindo as convenções do Obsidian: `[[wikilinks]]`, `[[nota|alias]]`,
   `[[nota#cabeçalho]]`, `![[embed]]`, `#tags`, `aliases`, `tags` no frontmatter.
2. O **GitHub é o repositório canônico remoto** do vault. O histórico Git é o histórico de versões.
3. Banco de dados e índices (textual, vetorial, grafo) são **derivados e reconstruíveis**. Cada linha
   derivada aponta para `path` + SHA do blob de origem.
4. Dados não deriváveis (ex.: decisões sobre sugestões de IA, uso/custos) são classificados em
   [DATA_MODEL.md](../DATA_MODEL.md) com destino e política de backup explícitos.
5. A lógica da aplicação depende do campo `type` do frontmatter — **não** do nome das pastas. As
   pastas sugeridas são apenas destinos padrão para novas notas; o usuário pode reorganizá-las.

## Alternativas consideradas

- **Banco como fonte principal (estilo Notion):** consultas mais fáceis, mas viola a portabilidade e
  cria formato proprietário. Rejeitado.
- **Arquivos em armazenamento de objetos (S3/Blob):** sem histórico nem fluxo de edição local.
  Rejeitado.
- **Sincronização própria (CRDT/servidor de arquivos):** complexidade alta e frágil para um projeto
  pessoal. Rejeitado na v1.

## Consequências

- (+) Portabilidade total: `git clone` dá uma cópia completa e utilizável (cenário H).
- (+) Histórico e recuperação de versões vêm do Git.
- (−) Cada gravação é um commit via API (latência de centenas de ms, limites de taxa).
- (−) Consultas complexas exigem índice derivado (Fase 2).
- (−) O histórico Git preserva conteúdo apagado; remover dados sensíveis de verdade exige reescrita de
  histórico (operação destrutiva, só com autorização explícita). Ver [SECURITY.md](../SECURITY.md).
