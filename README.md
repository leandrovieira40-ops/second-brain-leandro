# Second Brain

Sistema pessoal de conhecimento inspirado no Obsidian: notas em **Markdown no Git** como fonte
canônica, links bidirecionais, busca e — nas próximas fases — IA que responde com **fontes
verificáveis**. O nome é configurável (`APP_NAME`).

> **Status:** Fase 0 (arquitetura) concluída · Fase 1 (fundação funcional) em andamento.
> Ver [docs/ROADMAP.md](docs/ROADMAP.md).

## Princípios

1. **Seus dados são arquivos abertos.** Cada nota é um `.md` num repositório Git privado (o _vault_),
   legível sem esta aplicação e editável no Obsidian.
2. **Banco e índices são derivados** e reconstruíveis.
3. **Nada é sobrescrito em silêncio.** Toda gravação confere a versão atual; conflitos são mostrados.
4. **Privado por padrão.** Nenhuma rota sem autenticação; nenhum segredo no navegador.
5. **IA só com evidência.** Respostas citam trechos recuperados; sem evidência, a resposta diz isso.

## Documentação

| Documento | Conteúdo |
| --- | --- |
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | Componentes, fluxos de dados, riscos, custos |
| [docs/ADR/](docs/ADR/README.md) | Decisões de arquitetura e trade-offs |
| [docs/DATA_MODEL.md](docs/DATA_MODEL.md) | Classes de dados, frontmatter por tipo, links, esquema futuro |
| [docs/SECURITY.md](docs/SECURITY.md) | Modelo de ameaças, controles, procedimentos |
| [docs/VAULT_SYNC.md](docs/VAULT_SYNC.md) | Criar o vault, editar no Obsidian, conflitos, recuperação |
| [docs/ROADMAP.md](docs/ROADMAP.md) | Fases, critérios de conclusão, cenários de aceitação |

## Estrutura do repositório

```
second-brain/
├── docs/               # arquitetura, ADRs, segurança, dados, roadmap
├── vault-template/     # estrutura inicial para criar o seu repositório de vault (sem dados pessoais)
└── tests/fixtures/     # vault sintético usado nos testes
```

Este diretório vive provisoriamente dentro do repositório `quiz-aiprospect` e será extraído com
histórico para um repositório próprio ([ADR-0002](docs/ADR/0002-repositorios-e-hospedagem-do-codigo.md)).
