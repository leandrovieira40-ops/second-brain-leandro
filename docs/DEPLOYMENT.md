# Deploy e operação

Guia para rodar localmente e publicar na Vercel. Nada aqui exige colocar segredos no repositório.

## 1. Desenvolvimento local

Requisitos: Node.js 22 (`.nvmrc`) e npm.

```bash
npm ci
cp .env.example .env.local        # .env.local nunca é versionado
openssl rand -base64 48           # → AUTH_SECRET
npm run hash-password             # → AUTH_PASSWORD_HASH
```

Para começar sem GitHub, use uma pasta local (de preferência um clone do vault, para editar também no
Obsidian — ver [VAULT_SYNC.md](./VAULT_SYNC.md)):

```dotenv
VAULT_STORE=fs
VAULT_FS_ROOT=/caminho/absoluto/para/second-brain-leandro-vault
```

```bash
npm run dev                        # http://localhost:3000
```

Verificações completas (as mesmas da CI):

```bash
npm run check                      # formatação, lint, tipos, testes unitários e build
npm run e2e                        # ponta a ponta contra o build, com vault sintético
```

Índice de busca local (opcional — sem ele a aplicação funciona e a busca usa só os nomes):

```bash
# PostgreSQL 16+ com as extensões unaccent e pg_trgm (vêm no pacote "contrib")
createdb second_brain_dev
echo 'DATABASE_URL=postgres://usuario@localhost:5432/second_brain_dev' >> .env.local
DATABASE_URL=postgres://usuario@localhost:5432/second_brain_dev npm run db:migrate
# Depois de abrir a aplicação: Início → "Sincronizar índice".

# Testes com banco: use bancos DESCARTÁVEIS (são esvaziados a cada execução)
createdb second_brain_test
TEST_DATABASE_URL=postgres://usuario@localhost:5432/second_brain_test npm test
E2E_DATABASE_URL=postgres://usuario@localhost:5432/second_brain_test npm run e2e
```

O script de E2E se recusa a esvaziar um banco cujo nome não contenha `test` ou `e2e`.

> Para adicionar/atualizar dependências use `npx npm@11 install --save-exact <pacote>@<versão>`
> (o npm 10 tem um bug de resolução neste projeto; `npm ci` funciona em ambos). Ver ADR-0003.

## 2. Pré-requisitos de produção (ações do dono)

1. **Repositório do vault** privado criado a partir de `vault-template/` ([VAULT_SYNC.md](./VAULT_SYNC.md)).
2. **Token do GitHub** _fine-grained_ (GitHub → Settings → Developer settings → Fine-grained tokens):
   - _Repository access_: **Only select repositories** → somente o vault;
   - _Permissions_: **Contents: Read and write** (Metadata: Read é automático);
   - _Expiration_: uma data definida (ex.: 90 dias) + lembrete de rotação ([SECURITY.md](./SECURITY.md)).
3. **Senha e segredo de sessão** gerados como na seção 1.
4. **Conta na Vercel.** O plano Hobby é para uso pessoal não comercial; se o uso for profissional
   (ex.: base de conhecimento do seu negócio), avalie o plano Pro.
5. **(Opcional, Fase 2B) Banco Neon** para busca, links de entrada, tags e renomear em vaults
   grandes — ver a seção 3.1.

## 3. Projeto na Vercel

1. _Add New → Project_ → importar o repositório `second-brain-leandro`.
2. Framework: **Next.js** (detectado). _Install_: `npm ci` (padrão com lockfile). Node.js: **22.x**.
3. Variáveis de ambiente (_Settings → Environment Variables_):

| Variável                 | Production | Preview                      | Observação                                              |
| ------------------------ | ---------- | ---------------------------- | ------------------------------------------------------- |
| `APP_NAME`               | opcional   | opcional                     | Padrão "Second Brain Leandro"                           |
| `APP_TIMEZONE`           | opcional   | opcional                     | Padrão `America/Sao_Paulo`                              |
| `AUTH_SECRET`            | ✅         | ✅ (outro valor)             | ≥ 32 caracteres aleatórios                              |
| `AUTH_PASSWORD_HASH`     | ✅         | ✅                           | Saída de `npm run hash-password`                        |
| `AUTH_SESSION_TTL_HOURS` | opcional   | opcional                     | Padrão 168 (7 dias)                                     |
| `AUTH_SESSION_VERSION`   | opcional   | opcional                     | Incrementar = deslogar todos                            |
| `VAULT_STORE`            | `github`   | `github`                     | `fs` não funciona na Vercel (recusado na inicialização) |
| `GITHUB_VAULT_OWNER`     | ✅         | ✅                           | `leandrovieira40-ops`                                   |
| `GITHUB_VAULT_REPO`      | vault real | **vault de teste**           | Nunca aponte previews para o vault real                 |
| `GITHUB_VAULT_BRANCH`    | `main`     | `main`                       |                                                         |
| `GITHUB_VAULT_TOKEN`     | ✅         | ✅ (token do vault de teste) | Somente servidor; **nunca** `NEXT_PUBLIC_*`             |
| `DATABASE_URL`           | opcional   | opcional (**outro banco**)   | Neon, connection string _pooled_ (seção 3.1)            |
| `GITHUB_WEBHOOK_SECRET`  | opcional   | —                            | Segredo do webhook `push` do vault (seção 3.2)          |

4. _Settings → Deployment Protection_: mantenha **Vercel Authentication** ativa para previews.
5. _Firewall → Rate Limiting_ (disponível no Hobby, 1 regra): limite `POST /api/auth/login`, por
   exemplo 10 requisições por minuto por IP → bloquear. Complementa o limite em memória da aplicação.

Mudanças em variáveis de ambiente só valem após um novo deploy.

### 3.1 Índice de busca (Neon ou Supabase) — opcional

1. Crie um projeto no [Neon](https://neon.tech) (região próxima da função da Vercel, ex.:
   `aws-us-east-1` para `iad1`). Um banco por ambiente: produção e preview **nunca** compartilham
   banco (o índice do preview seria o do vault de teste).
2. Copie a connection string **pooled** (host com `-pooler`, `sslmode=require`) para `DATABASE_URL`
   na Vercel. Ela é um segredo de servidor: nunca `NEXT_PUBLIC_*`.
3. Aplique as migrações a partir da sua máquina — **comando explícito, nunca automático no deploy**:

   ```bash
   DATABASE_URL='postgres://…-pooler…/neondb?sslmode=require' npm run db:migrate
   ```

   As migrações (`drizzle/`) criam as extensões `unaccent` e `pg_trgm`, a configuração de busca
   `sb_pt` e as tabelas do índice. São aditivas; o índice pode ser apagado e reconstruído.

4. Novo deploy → Início → **Sincronizar índice** (a primeira vez lê todas as notas; depois, só o que
   mudou). Cada gravação feita pela aplicação atualiza o índice logo após a resposta.

O banco guarda uma **cópia derivada** do texto das notas (para a busca). Trate-o com o mesmo cuidado

**Alternativa: Supabase** (usado em produção pelo dono — projeto `obsidian-pessoal`, região
`sa-east-1`). Use _Connect → Transaction pooler_ (porta `6543`) e acrescente
`?sslmode=require&uselibpqcompat=true` à URL: a conexão é cifrada, mas o certificado do Supabase não
é de uma autoridade pública, então ele não é verificado (para verificar, baixe o certificado em
_Database → SSL Configuration_ — melhoria futura). A migração `0003` liga RLS sem políticas nas
tabelas, o que bloqueia o acesso pela API REST pública do Supabase; a aplicação conecta como dona das
tabelas e não é afetada.
do vault ([SECURITY.md](./SECURITY.md)); apagá-lo não perde nada.

### 3.2 Webhook do vault (mudanças feitas no Obsidian) — opcional

Sem webhook, mudanças que chegam por `git push` (Obsidian) entram no índice no próximo "Sincronizar
índice" ou na próxima renomeação. Para que entrem sozinhas:

1. `openssl rand -hex 32` → `GITHUB_WEBHOOK_SECRET` na Vercel (Production) e novo deploy.
2. No repositório **do vault**: _Settings → Webhooks → Add webhook_:
   - _Payload URL_: `https://<seu-projeto>.vercel.app/api/webhooks/github`
   - _Content type_: `application/json`; _Secret_: o mesmo valor;
   - _Events_: **Just the push event**.
3. O GitHub envia um `ping`; a entrega deve aparecer com resposta **200**. Pushes no branch do vault
   respondem **202** e sincronizam o índice em segundo plano.

A rota só aceita requisições com assinatura `X-Hub-Signature-256` válida (HMAC-SHA256 verificado em
tempo constante); sem `GITHUB_WEBHOOK_SECRET` ela responde 404. Se a _Deployment Protection_ estiver
ativa para produção, libere o caminho do webhook (ou use o domínio de produção, que não é protegido
por padrão).

## 4. Verificação pós-deploy (obrigatória)

Um deploy só é considerado bem-sucedido depois deste roteiro no **ambiente publicado**:

```bash
URL=https://<seu-projeto>.vercel.app
curl -s $URL/api/health                       # {"status":"ok"}
curl -sI $URL/login | grep -iE 'content-security-policy|x-frame-options|strict-transport|x-robots'
curl -s -o /dev/null -w '%{http_code}\n' $URL/api/notes   # 401 sem sessão
```

No navegador:

1. `/` redireciona para `/login`; senha errada mostra "Senha incorreta."; a correta entra.
2. A barra lateral mostra a árvore do vault e, no rodapé, `GitHub · dono/repo@main`.
3. Criar a nota "Teste de deploy" → no GitHub, o vault tem um commit `Cria …` com o trailer
   `Second-Brain-Origin: web`.
4. Escrever, `Ctrl+S`, ver "Salvo às …"; fechar a aba, reabrir: conteúdo intacto.
5. Editar a mesma nota pela interface web do GitHub; voltar à aplicação, digitar e salvar → aparece
   "Conflito" e nada é sobrescrito. Testar "Salvar minha versão como cópia".
6. Sair → `/` volta a exigir login.
7. Mover a nota de teste para a lixeira e excluí-la de vez em `/trash`.
8. Com o índice configurado: Início → "Sincronizar índice" mostra a contagem de notas; `Ctrl+K`
   encontra uma palavra do corpo de uma nota; renomear uma nota atualiza os `[[links]]` para ela.

Registre a data e o resultado na descrição do deploy ou numa nota do próprio vault.

## 5. Rollback e recuperação

- **Código:** Vercel → _Deployments_ → deploy anterior → _Instant Rollback_. O vault não é afetado
  por deploys. As migrações do banco são aditivas: um deploy anterior continua funcionando com o
  esquema mais novo.
- **Índice:** se ficar inconsistente, "Sincronizar índice" corrige; em último caso, apague as tabelas
  (ou o banco), rode `npm run db:migrate` e sincronize de novo — tudo vem do vault.
- **Notas:** histórico Git do vault ([VAULT_SYNC.md](./VAULT_SYNC.md#5-recuperação)).
- **Credenciais:** procedimentos de rotação e incidente em [SECURITY.md](./SECURITY.md#6-procedimentos).

## 6. Limitações conhecidas

- O limite de tentativas de login é por instância serverless; a regra do Firewall é a proteção global.
- Árvore e notas são lidas do GitHub a cada navegação (1 chamada para a árvore, 1 por nota); o índice
  não substitui o vault como fonte. Limite da API: 5.000 requisições/hora por token.
- Autosave faz commits no vault (no máximo 1 a cada 30 s por nota, além dos `Ctrl+S`).
- Na visualização, aliases de **outras** notas ainda não resolvem links (o índice já os considera
  para links de entrada e renomear).
- Renomear sem índice no GitHub lê todas as notas e é recusado acima de 400 notas; com índice, o
  limite é 200 notas reescritas por renomeação. Links dentro do frontmatter (ex.: `sources:`) ainda
  não são indexados nem reescritos.
- Notas acima de 1 MB não são editáveis; imagens e anexos não são exibidos na visualização.
