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

4. _Settings → Deployment Protection_: mantenha **Vercel Authentication** ativa para previews.
5. _Firewall → Rate Limiting_ (disponível no Hobby, 1 regra): limite `POST /api/auth/login`, por
   exemplo 10 requisições por minuto por IP → bloquear. Complementa o limite em memória da aplicação.

Mudanças em variáveis de ambiente só valem após um novo deploy.

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
7. Apagar a nota de teste diretamente no vault (a lixeira pela interface chega na Fase 2).

Registre a data e o resultado na descrição do deploy ou numa nota do próprio vault.

## 5. Rollback e recuperação

- **Código:** Vercel → _Deployments_ → deploy anterior → _Instant Rollback_. O vault não é afetado
  por deploys (a aplicação não guarda estado próprio na Fase 1).
- **Notas:** histórico Git do vault ([VAULT_SYNC.md](./VAULT_SYNC.md#5-recuperação)).
- **Credenciais:** procedimentos de rotação e incidente em [SECURITY.md](./SECURITY.md#6-procedimentos).

## 6. Limitações conhecidas (Fase 1)

- O limite de tentativas de login é por instância serverless; a regra do Firewall é a proteção global.
- Sem banco de dados: árvore e notas são lidas do GitHub a cada navegação (1 chamada para a árvore,
  1 por nota). Limite da API: 5.000 requisições/hora por token.
- Autosave faz commits no vault (no máximo 1 a cada 30 s por nota, além dos `Ctrl+S`).
- Aliases de **outras** notas ainda não são usados para resolver links (precisa do índice da Fase 2).
- Notas acima de 1 MB não são editáveis; imagens e anexos não são exibidos na visualização.
