# ADR-0007 — Edição local e sincronização via Git

- **Status:** Aceito
- **Data:** 2026-10-12

## Contexto

O dono quer editar o vault tanto na web quanto no Obsidian. Uma aplicação web não acessa pastas do
computador, e prometer sincronização bidirecional automática sem regras de conflito, detecção de
exclusões e recuperação é prometer perda de dados.

## Decisão

1. **O Git é o mecanismo de sincronização.** O computador local tem um clone do vault; a web grava
   diretamente no GitHub. Não há sincronização automática bidirecional implementada pela aplicação.
2. Fluxo local recomendado (detalhado em [VAULT_SYNC.md](../VAULT_SYNC.md)):
   `git pull --rebase` antes de editar → editar no Obsidian → `git commit` → `git push`.
   O plugin comunitário _Obsidian Git_ pode automatizar pull/commit/push em intervalos; ele é
   opcional e não faz parte desta aplicação.
3. **Regras de conflito:**
   - Web × GitHub: toda gravação envia o SHA esperado; se o arquivo mudou (por um push do Obsidian),
     a gravação é recusada e o usuário escolhe recarregar, salvar cópia de conflito ou sobrescrever
     conscientemente ([ADR-0008](./0008-salvamento-confiavel.md)).
   - Local × GitHub: resolvido pelo próprio Git no `pull` (merge/rebase com marcadores de conflito
     no arquivo). A aplicação nunca faz _force-push_ e nunca reescreve histórico.
   - Exclusões: na web, exclusão é lógica (move para `.trash/`, compatível com a lixeira do Obsidian)
     a partir da Fase 2; no Git, exclusões ficam no histórico e são recuperáveis.
4. **Modo local opcional:** `VAULT_STORE=fs` com `VAULT_FS_ROOT` apontando para o clone permite usar a
   interface web localmente sobre a mesma pasta do Obsidian. As gravações também verificam o SHA (uma
   edição do Obsidian no meio do caminho gera conflito, não sobrescrita). Commits continuam sendo
   feitos pelo usuário (ou pelo Obsidian Git).
5. **Fase 2:** índice derivado atualizado por webhook `push` + reconciliação; a interface indicará
   quando o índice está atrás do GitHub.
6. Um aplicativo desktop/servidor local com sincronização transparente fica **fora do escopo** até
   haver necessidade comprovada; se adotado, terá ADR próprio com regras de conflito testadas.

## Consequências

- (+) Nenhuma lógica de sincronização própria para falhar silenciosamente; o Git é auditável.
- (−) O usuário precisa lembrar de `pull`/`push` no computador (ou usar Obsidian Git).
- (−) Conflitos locais aparecem como conflitos Git, resolvidos no editor local.
