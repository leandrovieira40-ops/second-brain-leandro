# Second Brain Leandro

Sistema pessoal de conhecimento inspirado no Obsidian: notas em **Markdown no Git** como fonte
canônica, links bidirecionais, busca e — nas próximas fases — IA que responde com **fontes
verificáveis**. O nome exibido é configurável (`APP_NAME`, padrão "Second Brain Leandro").

> **Status:** Fase 0 ✅ · Fase 1 ✅ · Fase 2A ✅ (sem banco) · Fase 2B (índice, busca, backlinks) em seguida.
> Falta a verificação no ambiente publicado. Ver [docs/ROADMAP.md](docs/ROADMAP.md).

## O que já funciona (Fase 1)

- Login privado (frase-senha com scrypt, sessão em cookie `__Host-` httpOnly) e todas as rotas protegidas.
- Árvore de pastas do vault, filtro por nome/pasta, criação de notas por tipo com template e `id` ULID.
- Editor Markdown (CodeMirror 6) do texto exato do arquivo, visualização com `[[wikilinks]]` resolvidos
  e links quebrados marcados, painel de propriedades, tags e links de saída; tema claro/escuro.
- Salvamento confiável: autosave limitado, `Ctrl+S`, rascunho local, status honesto ("Salvo" só após
  confirmação), detecção de conflito com edições externas (Obsidian) e cópia de conflito.
- Vault no GitHub (API REST, sem clonar) ou numa pasta local (desenvolvimento/uso com o Obsidian).

**Fase 2A:** captura rápida (Alt+C), autocompletar de `[[links]]`, criar nota a partir de link
quebrado, lixeira com restauração (`.trash/`), histórico de versões com restauração, favoritos (no
próprio vault) e notas recentes.

## Começar

```bash
npm ci
cp .env.example .env.local     # preencha AUTH_SECRET, AUTH_PASSWORD_HASH e o vault
npm run hash-password          # gera AUTH_PASSWORD_HASH
npm run dev
```

Passo a passo completo (local, Vercel, verificação pós-deploy, rollback): [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md).

| Comando                 | O que faz                                                              |
| ----------------------- | ---------------------------------------------------------------------- |
| `npm run check`         | Formatação, lint, tipos, testes unitários/contrato e build de produção |
| `npm run e2e`           | Testes ponta a ponta contra o build, com vault sintético               |
| `npm run hash-password` | Gera o hash da frase-senha                                             |

## Princípios

1. **Seus dados são arquivos abertos.** Cada nota é um `.md` num repositório Git privado (o _vault_),
   legível sem esta aplicação e editável no Obsidian.
2. **Banco e índices são derivados** e reconstruíveis.
3. **Nada é sobrescrito em silêncio.** Toda gravação confere a versão atual; conflitos são mostrados.
4. **Privado por padrão.** Nenhuma rota sem autenticação; nenhum segredo no navegador.
5. **IA só com evidência.** Respostas citam trechos recuperados; sem evidência, a resposta diz isso.

## Documentação

| Documento                                    | Conteúdo                                                      |
| -------------------------------------------- | ------------------------------------------------------------- |
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | Componentes, fluxos de dados, riscos, custos                  |
| [docs/ADR/](docs/ADR/README.md)              | Decisões de arquitetura e trade-offs                          |
| [docs/DATA_MODEL.md](docs/DATA_MODEL.md)     | Classes de dados, frontmatter por tipo, links, esquema futuro |
| [docs/SECURITY.md](docs/SECURITY.md)         | Modelo de ameaças, controles, procedimentos                   |
| [docs/VAULT_SYNC.md](docs/VAULT_SYNC.md)     | Criar o vault, editar no Obsidian, conflitos, recuperação     |
| [docs/ROADMAP.md](docs/ROADMAP.md)           | Fases, critérios de conclusão, cenários de aceitação          |

## Estrutura do repositório

```
second-brain-leandro/
├── src/                # aplicação Next.js (ver docs/ARCHITECTURE.md §3)
├── tests/              # contrato dos adaptadores, GitHub simulado, fixtures sintéticas
├── e2e/                # testes ponta a ponta (Playwright)
├── scripts/            # hash de senha, vault de teste, varredura de segredos no bundle
├── docs/               # arquitetura, ADRs, segurança, dados, deploy, roadmap
└── vault-template/     # estrutura inicial do repositório de vault (sem dados pessoais)
```

Repositório do aplicativo: `second-brain-leandro`. As notas ficam num repositório **privado e
separado** (sugestão: `second-brain-leandro-vault`) — ver
[ADR-0002](docs/ADR/0002-repositorios-e-hospedagem-do-codigo.md).
