# ADR-0003 — Stack web e política de versões

- **Status:** Aceito
- **Data:** 2026-10-12

## Contexto

Precisamos de uma stack estável, tipada, hospedável na Vercel e boa para longas sessões de escrita.
O ecossistema JavaScript muda rápido; atualizações automáticas já quebraram projetos em produção.

## Decisão

| Componente | Versão fixada | Motivo |
| --- | --- | --- |
| Node.js | 22.x (`engines`, `.nvmrc`) | LTS suportado na Vercel; mesmo runtime local e CI |
| Next.js (App Router) | 16.3.6 | Server Components, Route Handlers, `proxy.ts` em runtime Node |
| React / React DOM | 19.3.0 | Exigido pelo Next 16 |
| TypeScript | 6.0.3 (estrito + `noUncheckedIndexedAccess`) | TS 7 (nativo) ainda não é suportado pelo `typescript-eslint` (`<6.1`) |
| Tailwind CSS | 4.3.3 | Tokens via CSS; tema claro/escuro |
| Componentes | padrão shadcn/ui (código próprio em `src/components/ui`) sobre `radix-ui` 1.6.7 | Acessibilidade dos primitivos Radix, sem dependência de runtime da shadcn |
| Editor | CodeMirror 6 (`@uiw/react-codemirror` 4.25.12) | Mesmo motor do Obsidian; autocompletar de wikilinks na Fase 2 |
| Renderização Markdown | `react-markdown` 10 + `remark-gfm` 4 + plugin próprio de wikilinks | Sem HTML bruto por padrão (seguro contra XSS) |
| YAML | `yaml` 2.9.1 (YAML 1.2, schema core) | Não converte datas em objetos; permite edições mínimas |
| Validação | Zod 4.6.5 | Entradas da API e variáveis de ambiente |
| Sessão | `jose` 6.2.12 (JWT HS256) | Padrão auditado, funciona em qualquer runtime |
| Testes | Vitest 4.1.11, Playwright 1.56.1 | Vitest 5 tem < 3 semanas; Playwright alinhado ao Chromium do ambiente |
| Lint/format | ESLint 9.39.5 + `eslint-config-next` 16.3.6, Prettier 3.9.9 | Plugins React/import/a11y ainda não suportam ESLint 10 |

React Hook Form não foi adotado: os formulários atuais (login, nova nota) são simples. Entra quando
houver formulário complexo (ex.: nota de livro com muitos campos, Fase 4).

### Política de versões

1. Versões **exatas** (`save-exact=true`) e `package-lock.json` versionado; CI usa `npm ci`.
2. Ao adotar ou atualizar, escolher a versão estável mais recente publicada há **pelo menos 14 dias**;
   para uma _major_ recém-lançada (< 30 dias), preferir a última _minor_ da major anterior.
3. Nenhuma atualização automática. Atualizações são PRs próprios, com `npm run check` + E2E verdes.
4. `npm audit` roda no CI; vulnerabilidades altas/críticas em dependências de produção bloqueiam.

### Gerenciador de pacotes

npm. O npm 10.9 (padrão do Node 22) falha ao **resolver** a árvore deste projeto do zero (erro
interno `Cannot read properties of null (reading 'edgesOut')` ao avaliar peers opcionais do Vitest).
O lockfile foi gerado com npm 11.21 e **`npm ci` com npm 10 funciona** (verificado), que é o que a
Vercel e o CI executam. Para adicionar/atualizar dependências localmente use `npx npm@11 install`.

## Alternativas consideradas

- **Remix/React Router, SvelteKit:** viáveis, mas o Next.js tem a integração mais direta com a Vercel.
- **Milkdown/TipTap (WYSIWYG):** edição rica, porém tendem a reformatar o Markdown (viola a regra de
  não reescrever silenciosamente). CodeMirror edita o texto exato.
- **Auth.js/Better Auth:** frameworks completos para multiusuário; para um único usuário o código
  próprio (≈150 linhas, testado) tem superfície menor. Reavaliar se houver compartilhamento.

## Consequências

- (+) Builds reproduzíveis e mudanças de dependência auditáveis.
- (−) ESLint 9 está fora do ciclo de suporte (ferramenta de desenvolvimento, sem impacto em runtime);
  migrar quando `eslint-config-next` suportar o 10.
