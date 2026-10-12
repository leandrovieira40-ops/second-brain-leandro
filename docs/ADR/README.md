# Architecture Decision Records

Cada ADR registra **uma** decisão: contexto, decisão, alternativas, consequências e quando revisar.
ADRs aceitos não são reescritos; uma mudança de rumo gera um novo ADR que _substitui_ o anterior.

| #                                                     | Decisão                                                          | Status                           |
| ----------------------------------------------------- | ---------------------------------------------------------------- | -------------------------------- |
| [0001](./0001-markdown-e-git-como-fonte-canonica.md)  | Markdown no Git como fonte canônica; banco e índices derivados   | Aceito                           |
| [0002](./0002-repositorios-e-hospedagem-do-codigo.md) | Repositórios separados para código e conhecimento                | Aceito                           |
| [0003](./0003-stack-web-e-politica-de-versoes.md)     | Stack web e política de versões                                  | Aceito                           |
| [0004](./0004-acesso-ao-vault-via-api-do-github.md)   | Acesso ao vault via API REST do GitHub com concorrência otimista | Aceito                           |
| [0005](./0005-autenticacao-usuario-unico.md)          | Autenticação de usuário único                                    | Aceito                           |
| [0006](./0006-banco-de-dados-e-indices.md)            | PostgreSQL gerenciado (Neon) para dados derivados e operacionais | Aceito (implementado na Fase 2B) |
| [0007](./0007-edicao-local-e-sincronizacao.md)        | Edição local e sincronização via Git                             | Aceito                           |
| [0008](./0008-salvamento-confiavel.md)                | Salvamento confiável: autosave, rascunho local e conflitos       | Aceito                           |
| [0009](./0009-camada-de-ia.md)                        | Camada de IA independente de provedor                            | Proposto (Fase 5)                |
| [0010](./0010-processamento-assincrono.md)            | Processamento assíncrono                                         | Proposto (Fase 4)                |
| [0011](./0011-armazenamento-de-anexos.md)             | Armazenamento de anexos                                          | Proposto (Fase 4)                |
| [0012](./0012-identificadores-datas-e-nomes.md)       | Identificadores, datas e nomes de arquivo                        | Aceito                           |
| [0013](./0013-indice-derivado-e-sincronizacao.md)     | Índice derivado e sincronização com o vault                      | Aceito (Fase 2B)                 |
