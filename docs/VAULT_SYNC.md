# Vault: criação, edição local e sincronização

O vault é um repositório Git **privado** com arquivos Markdown. A aplicação web grava no GitHub;
no computador você edita um clone (por exemplo, no Obsidian). O Git é o mecanismo de sincronização
([ADR-0007](./ADR/0007-edicao-local-e-sincronizacao.md)).

## 1. Criar o vault

1. No GitHub, crie um repositório **privado** vazio, por exemplo `second-brain-leandro-vault`.
2. Copie a estrutura inicial deste projeto e publique:

   ```bash
   git clone git@github.com:<voce>/second-brain-leandro-vault.git
   cp -R second-brain-leandro/vault-template/. second-brain-leandro-vault/
   cd second-brain-leandro-vault
   git add . && git commit -m "Estrutura inicial do vault" && git push
   ```

3. Abra a pasta `second-brain-leandro-vault` no Obsidian como um vault.

A estrutura (`00-Inbox`, `02-Sources/…`, `03-Permanent-Notes`, …) é apenas um ponto de partida.
Renomeie ou crie pastas à vontade: a aplicação usa o campo `type` do frontmatter, não o nome das
pastas. Os arquivos `.gitkeep` existem só para o Git manter pastas vazias.

## 2. Rotina de edição local

```bash
git pull --rebase      # antes de começar: traz o que foi escrito na web
# … editar no Obsidian …
git add -A && git commit -m "Notas de leitura"
git push               # depois: a web passa a ver as mudanças
```

Alternativa: plugin comunitário **Obsidian Git** (pull ao abrir, commit/push a cada N minutos).
Ele é independente desta aplicação; configure "pull on startup" para reduzir conflitos.

## 3. O que acontece em cada tipo de conflito

| Situação                                                                                   | Resultado                                                                                                                                                                |
| ------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Você editou na web uma nota que também mudou no GitHub (push do Obsidian)                  | A gravação é **recusada**; a interface mostra "Conflito" e oferece: recarregar a versão remota, salvar sua versão como cópia de conflito ou sobrescrever conscientemente |
| Você editou no Obsidian uma nota que mudou na web                                          | O `git pull` faz merge; se as mesmas linhas mudaram, o Git marca o conflito no arquivo e você resolve no editor                                                          |
| Você usa a interface web **localmente** (`VAULT_STORE=fs`) sobre a mesma pasta do Obsidian | Cada gravação confere o SHA do arquivo em disco; se o Obsidian alterou o arquivo no meio-tempo, a interface mostra "Conflito" em vez de sobrescrever                     |

A aplicação **nunca** usa `force-push` nem reescreve o histórico do vault.

## 4. Portabilidade (cenário H)

O vault funciona sem a aplicação:

```bash
git clone git@github.com:<voce>/second-brain-leandro-vault.git   # cópia completa, com histórico
```

Abra em qualquer editor Markdown (Obsidian, VS Code, Typora). Exportação sem Git: no GitHub,
_Code → Download ZIP_. Verificação manual sugerida após a configuração: clonar, abrir no Obsidian,
conferir que wikilinks, tags e frontmatter de uma nota criada pela web aparecem corretamente.

## 5. Recuperação

- **Versão anterior de uma nota:** `git log -- "caminho/da nota.md"` e `git show <commit>:"caminho/da nota.md"`.
- **Nota apagada:** `git log --diff-filter=D -- "caminho/da nota.md"` e `git checkout <commit>^ -- "caminho/da nota.md"`.
- O GitHub sozinho não é backup completo (conta comprometida, exclusão do repositório). Mantenha ao
  menos um clone atualizado fora do GitHub (o do seu computador conta) e, idealmente, um backup
  periódico (`git bundle create vault-AAAA-MM-DD.bundle --all`) em outro local.
