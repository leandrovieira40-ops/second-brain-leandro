# ADR-0008 — Salvamento confiável: autosave, rascunho local e conflitos

- **Status:** Aceito
- **Data:** 2026-10-12

## Contexto

Cada gravação no GitHub é um commit (latência de rede, limites secundários de criação de conteúdo).
Gravar a cada tecla é inviável; gravar raramente arrisca perder texto se a aba fechar ou a rede cair.
Requisito central: **nenhuma indicação falsa de que os dados foram salvos** (cenário F).

## Decisão

1. **Rascunho local** a cada alteração (`localStorage`, chave por caminho, com o SHA-base). Ele só é
   apagado quando o servidor confirma a gravação daquele conteúdo. Ao reabrir uma nota com rascunho
   pendente, o editor oferece restaurar ou descartar.
2. **Autosave** quando o usuário para de digitar por 4 s, com **intervalo mínimo de 30 s** entre
   commits automáticos (≤ 120 commits/hora no pior caso). `Ctrl/Cmd+S` grava imediatamente.
   Ao ocultar a aba, tenta gravar o que estiver pendente (`fetch` com `keepalive`).
3. **Uma gravação por vez por nota.** O cliente envia `{content, expectedSha}`; a resposta traz o novo
   SHA, que vira a base da próxima gravação. Alterações feitas durante uma gravação disparam outra.
4. **Status visível e honesto:** `Salvo` (confirmado pelo servidor) · `Alterações não salvas`
   (rascunho local guardado) · `Salvando…` · `Erro — não salvo` (com nova tentativa e backoff) ·
   `Conflito` (autosave pausado). `beforeunload` avisa se houver algo não confirmado.
5. **Servidor não transforma conteúdo.** Ele grava exatamente os bytes recebidos (após validar tipo e
   tamanho, máx. 1 MB por nota na Fase 1). O campo `updated` do frontmatter, se existir, é atualizado
   **no editor** (edição mínima de uma linha, visível) antes do envio.
6. **Conflito** (SHA divergente): o usuário escolhe
   - **Recarregar a versão remota** (descarta as alterações locais após confirmação);
   - **Salvar minha versão como cópia** — cria `<nome> (conflito AAAA-MM-DD HHmm).md` sem tocar na
     versão remota;
   - **Sobrescrever com a minha versão** — confirmação explícita; a versão remota continua no histórico Git.
7. **Idempotência:** se uma nova tentativa encontra o conteúdo remoto já igual ao enviado, é sucesso.
8. **YAML inválido não bloqueia o salvamento** (o conteúdo é do usuário); a interface apenas avisa.

## Alternativas consideradas

- **Salvar só manualmente:** risco alto de perda. Rejeitado.
- **Debounce curto sem limite de frequência:** histórico ruidoso e risco de limite secundário.
- **Fila de gravação no servidor (agrupar commits):** exigiria estado persistente (banco) e criaria a
  janela "aceito mas não gravado no Git" — viola a regra de não indicar falso salvamento.

## Consequências

- (+) Perda máxima em caso de falha total do navegador: nenhuma (rascunho local); em caso de troca de
  dispositivo antes da sincronização: até ~30 s de digitação, sempre sinalizado como não salvo.
- (−) Histórico Git com vários commits por sessão de escrita (aceitável; mensagens padronizadas).
- (−) Rascunhos ficam no navegador; em dispositivo compartilhado, sair da conta apaga os rascunhos
  (com aviso se houver algo não sincronizado).
