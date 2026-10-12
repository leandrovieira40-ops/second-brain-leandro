# ADR-0005 — Autenticação de usuário único

- **Status:** Aceito
- **Data:** 2026-10-12

## Contexto

Há um único usuário legítimo (o dono). Toda rota, exceto login e verificação de saúde mínima, é
privada. A Fase 1 não tem banco de dados; a solução precisa funcionar sem estado no servidor, ser
testável ponta a ponta (sem depender de provedores externos) e não expor segredos ao navegador.

## Decisão

1. **Senha forte (frase-senha) com hash scrypt** (`node:crypto`, N=2¹⁵, r=8, p=1, sal de 16 bytes),
   guardada em `AUTH_PASSWORD_HASH` no formato `scrypt:N:r:p:<sal>:<hash>` (base64url, **sem `$`**,
   porque o Next.js expande `$VAR` em arquivos `.env`). Gerada por `npm run hash-password`, que exige
   no mínimo 12 caracteres. Comparação em tempo constante.
2. **Sessão sem estado:** JWT HS256 assinado com `AUTH_SECRET` (≥ 32 bytes aleatórios), validade
   padrão de 7 dias (`AUTH_SESSION_TTL_HOURS`), claim `ver` = `AUTH_SESSION_VERSION`. Revogar todas
   as sessões = incrementar `AUTH_SESSION_VERSION` (ou trocar `AUTH_SECRET`) e reimplantar.
3. **Cookie:** `__Host-sb_session` em produção (`Secure`, `HttpOnly`, `SameSite=Lax`, `Path=/`, sem
   `Domain`). Em desenvolvimento HTTP o nome perde o prefixo `__Host-` e `Secure` vira opcional.
4. **Defesa em profundidade:** `proxy.ts` bloqueia páginas e APIs sem sessão válida **e** cada página,
   layout e Route Handler chama `requireSession()` de novo (o proxy pode ser contornado por mudanças
   de matcher; ver CVE-2025-29927 para a classe de problema).
5. **CSRF:** cookie `SameSite=Lax`; mutações exigem `Content-Type: application/json` e cabeçalho
   `Origin` (ou `Sec-Fetch-Site: same-origin`) igual ao host da aplicação.
6. **Força bruta:** limite em memória por instância (5 falhas por IP a cada 15 min; 30 falhas globais
   a cada 15 min) + atraso fixo em falhas. Como a memória é por instância serverless, **recomenda-se
   também** uma regra de rate limit no Firewall da Vercel para `POST /api/auth/login` (disponível no
   Hobby: 1 regra por projeto). Na Fase 2 o contador passa para o Postgres.
7. **Próximo passo (planejado):** login com GitHub OAuth (fluxo _authorization code_ + PKCE S256 +
   `state`), aceitando apenas o **ID numérico** do usuário dono (`AUTH_GITHUB_USER_ID`), herdando o
   2FA do GitHub. A senha continua como alternativa de recuperação.

## Alternativas consideradas

- **Somente GitHub OAuth já na Fase 1:** mais forte (2FA), mas impossível de testar E2E sem o GitHub e
  exige registrar um OAuth App antes do primeiro uso. Mantido como próximo passo.
- **Passkeys/WebAuthn:** excelente, mas exige armazenar credenciais (banco) — reavaliar na Fase 2+.
- **Vercel Deployment Protection como única barreira:** no Hobby não protege o domínio de produção.
- **Sessões no banco:** permitem revogação individual; desnecessário para um único usuário agora.

## Consequências

- (+) Zero dependência externa para entrar; testável ponta a ponta com a mesma rota de produção.
- (−) Sem revogação de sessão individual (somente global).
- (−) Um único fator até a adoção do GitHub OAuth — mitigado por frase-senha longa e rate limit.
