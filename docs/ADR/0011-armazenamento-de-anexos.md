# ADR-0011 — Armazenamento de anexos

- **Status:** Proposto (decisão final na Fase 4)
- **Data:** 2026-10-12

## Contexto

PDFs, imagens e áudios não devem inchar o repositório Git, mas precisam ser privados, ter backup
independente e referência estável a partir das notas.

## Opções avaliadas (12/10/2026)

| | Vercel Blob (privado) | Cloudflare R2 |
| --- | --- | --- |
| Privacidade | Blobs privados GA desde 30/06/2026; URLs assinadas por operação, até 7 dias | Bucket privado; URLs pré-assinadas (S3) de 1 s a 7 dias |
| Grátis | 1 GB, 10 GB de transferência/mês | 10 GB, 1 M ops classe A, 10 M classe B, egress grátis |
| Portabilidade | API própria | API S3 (rclone, aws-cli, qualquer ferramenta S3) |
| Integração | Nativa na Vercel; upload direto do navegador | Requer conta Cloudflare |

## Decisão (proposta)

- **Upload direto do navegador** para o armazenamento via URL assinada de curta duração emitida pelo
  servidor após autenticação (contorna o limite de 4,5 MB das funções).
- Nota de anexo em Markdown no vault com metadados (`sha256`, tamanho, tipo, chave do objeto); o
  binário fica no armazenamento. Arquivos pequenos (imagens < 1 MB) podem ir para `Attachments/` no Git.
- Inclinação atual: **R2** pela portabilidade (S3) e backup trivial com `rclone`; Vercel Blob privado é
  a alternativa de menor atrito. Decidir na Fase 4 com um teste real de upload, download e restauração.
