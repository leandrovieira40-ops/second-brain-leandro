# Segurança e privacidade

O sistema guarda conhecimento pessoal e profissional. Segurança é requisito, não funcionalidade.
Este documento descreve o modelo de ameaças, os controles **implementados** (✅), os **planejados**
(⏳) e os procedimentos operacionais.

## 1. Ativos

1. Conteúdo do vault (notas, fontes, anexos) — confidencial.
2. Credenciais: token do GitHub, `AUTH_SECRET`, hash da senha, chaves de IA, URL do banco.
3. Dados derivados (índices, embeddings, trechos) — tão sensíveis quanto o vault.
4. Integridade do histórico (o Git é o histórico de versões).

## 2. Modelo de ameaças

| Ameaça                                   | Vetor                                  | Controles                                                                                                                                                                              |
| ---------------------------------------- | -------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Acesso não autenticado                   | Internet pública (domínio de produção) | ✅ Sessão obrigatória no `proxy.ts` **e** em cada página/API; ✅ `/api/health` público não revela nada                                                                                 |
| Força bruta de senha                     | `POST /api/auth/login`                 | ✅ scrypt (N=2¹⁵); ✅ rate limit por IP e global; ✅ atraso fixo; ⏳ regra no Firewall da Vercel; ⏳ GitHub OAuth (2FA)                                                                |
| Roubo de sessão                          | XSS, rede                              | ✅ Cookie `__Host-`, `HttpOnly`, `Secure`, `SameSite=Lax`; ✅ CSP com nonce e `strict-dynamic`; ✅ HSTS                                                                                |
| XSS por conteúdo de nota/fonte importada | Markdown malicioso                     | ✅ Renderização sem HTML bruto; ✅ links `javascript:` neutralizados; ✅ CSP                                                                                                           |
| CSRF                                     | Site de terceiros                      | ✅ `SameSite=Lax`; ✅ mutações exigem JSON + `Origin`/`Sec-Fetch-Site` do próprio host                                                                                                 |
| Clickjacking                             | iframe                                 | ✅ `frame-ancestors 'none'` + `X-Frame-Options: DENY`                                                                                                                                  |
| Path traversal / escrita fora do vault   | Caminho manipulado na API              | ✅ Validação estrita de caminhos; ✅ adaptador local resolve e confina ao diretório raiz (inclusive symlinks)                                                                          |
| Vazamento de token do GitHub             | Bundle JS, logs, erros, commits        | ✅ `server-only`; ✅ sem `NEXT_PUBLIC_*` sensível; ✅ erros do GitHub nunca repassados; ✅ logs sem cabeçalhos; ✅ `.gitignore` de `.env*`                                             |
| Token com permissões excessivas          | Configuração                           | ✅ Documentado: _fine-grained_, 1 repositório, `Contents: RW` + `Metadata: R`                                                                                                          |
| Sobrescrita silenciosa / perda de dados  | Concorrência, falhas                   | ✅ SHA esperado em toda gravação; ✅ status honesto; ✅ rascunho local; ✅ sem _force-push_; ✅ renomear/lixeira num único commit com pré-condições em todas as notas envolvidas       |
| Webhook forjado                          | `POST /api/webhooks/github`            | ✅ HMAC-SHA256 (`X-Hub-Signature-256`) verificado em tempo constante antes de ler o corpo como JSON; ✅ 404 sem segredo configurado; ✅ só dispara sincronização (não recebe conteúdo) |
| Injeção de SQL / tsquery                 | Busca                                  | ✅ Consultas parametrizadas (Drizzle `sql`); ✅ termos reduzidos a letras e dígitos antes de virar `tsquery`                                                                           |
| XSS por trechos da busca                 | Conteúdo indexado                      | ✅ Destaques com caracteres de controle, renderizados como texto pelo React (sem HTML); ✅ testado (E2E)                                                                               |
| SSRF na captura de URLs                  | Fase 4                                 | ⏳ Allowlist de esquemas (http/https), bloqueio de IPs privados/link-local/metadados após resolução DNS, limite de tamanho e tempo, sem seguir redirecionamentos para redes internas   |
| Upload malicioso                         | Fase 4                                 | ⏳ Limite de tamanho, verificação de tipo por assinatura (magic bytes), armazenamento privado, nunca servido inline como HTML                                                          |
| Prompt injection / exfiltração via IA    | Fase 5                                 | ⏳ Conteúdo recuperado tratado como dado; IA sem ferramentas de escrita/rede; propostas revisáveis; contexto mínimo                                                                    |
| Abuso de custo (IA)                      | Fase 5                                 | ⏳ Orçamento mensal com corte; rate limit por operação                                                                                                                                 |
| Dependência vulnerável                   | Supply chain                           | ✅ Versões exatas + lockfile; ✅ `npm audit` no CI; ✅ atualização deliberada                                                                                                          |
| Indexação pública                        | Buscadores                             | ✅ `X-Robots-Tag: noindex` + `robots.txt` bloqueando tudo                                                                                                                              |

## 3. Cabeçalhos de segurança

Definidos em `next.config.ts` (estáticos) e `src/proxy.ts` (CSP por requisição):

- `Content-Security-Policy`: `default-src 'self'; script-src 'self' 'nonce-…' 'strict-dynamic'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self'; connect-src 'self'; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'` (+ `upgrade-insecure-requests` em produção). `'unsafe-inline'` em estilos é necessário porque o CodeMirror injeta estilos dinamicamente; scripts não têm essa exceção.
- `Strict-Transport-Security`, `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`,
  `Referrer-Policy: no-referrer`, `Permissions-Policy` restritiva, `Cross-Origin-Opener-Policy` e
  `Cross-Origin-Resource-Policy: same-origin`, `X-Robots-Tag: noindex, nofollow, noarchive`.

## 4. Política de logs

- Nunca registrar: conteúdo de notas, títulos, frontmatter, corpo de requisições, cookies, cabeçalhos
  `Authorization`, tokens, respostas de provedores.
- Caminhos de notas são registrados apenas como **hash curto** (SHA-256, 12 hex) para correlação.
- Registrar: operação, duração, status, classe do erro, adaptador, ID de correlação.
- Respostas de erro ao cliente: mensagem genérica acionável + ID de correlação (sem stack trace).

## 5. Dados enviados a terceiros

| Destino                 | O quê                                                               | Quando                                          |
| ----------------------- | ------------------------------------------------------------------- | ----------------------------------------------- |
| GitHub                  | Conteúdo completo das notas                                         | Sempre (é o armazenamento canônico)             |
| Vercel                  | Tráfego HTTP (TLS terminado na Vercel), logs de função sem conteúdo | Sempre                                          |
| Neon (Fase 2B)          | Caminhos, títulos, tags, frontmatter e corpo das notas (índice)     | Só com `DATABASE_URL` definida                  |
| Provedor de IA (Fase 5) | Somente os trechos recuperados para a operação + a pergunta         | Apenas em ações de IA, que podem ser desligadas |

## 6. Procedimentos

### Gerar a senha e o segredo de sessão

```bash
npm run hash-password            # pede a frase-senha (≥ 12 caracteres; recomendado ≥ 5 palavras)
openssl rand -base64 48          # valor para AUTH_SECRET
```

### Criar o token do GitHub (vault)

GitHub → Settings → Developer settings → Fine-grained tokens → _Generate new token_:

- Resource owner: sua conta · Repository access: **Only select repositories** → apenas o vault.
- Repository permissions: **Contents: Read and write** (Metadata: Read é automático).
- Expiração: defina uma data (ex.: 90 dias) e um lembrete de rotação.

### Rotação / incidente

1. Suspeita de vazamento do token do GitHub → revogar no GitHub imediatamente, gerar novo, atualizar
   `GITHUB_VAULT_TOKEN` na Vercel, reimplantar. Revisar commits recentes do vault.
2. Suspeita de sessão comprometida → incrementar `AUTH_SESSION_VERSION` (invalida todas as sessões) e
   reimplantar; trocar a senha (`AUTH_PASSWORD_HASH`).
3. Vazamento de `AUTH_SECRET` → gerar novo segredo (invalida todas as sessões).

### Dados sensíveis no histórico Git

Apagar uma nota não remove seu conteúdo do histórico. Para remover de fato (ex.: um dado que nunca
deveria ter sido gravado) é preciso reescrever o histórico do vault (`git filter-repo`) e forçar o
push — operação **destrutiva** que invalida clones existentes. Só com autorização explícita, backup
prévio e seguindo a documentação do GitHub sobre remoção de dados sensíveis (inclui pedir limpeza de
caches ao suporte).

### Rascunhos no navegador

Rascunhos não sincronizados ficam no `localStorage` do navegador. Ao sair da conta eles são apagados
(com aviso se algo ainda não foi salvo). Não use a aplicação em dispositivos compartilhados sem sair.

## 7. Reportar problemas

Projeto pessoal: problemas de segurança devem ser registrados em issue **privada** (ou contato direto
com o dono), nunca em issue pública com detalhes exploráveis.
