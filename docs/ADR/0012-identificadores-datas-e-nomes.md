# ADR-0012 — Identificadores, datas e nomes de arquivo

- **Status:** Aceito
- **Data:** 2026-10-12

## Decisão

1. **`id`: ULID** (26 caracteres, base32 de Crockford, ordenável por tempo, sem coordenação), ex.:
   `01K7DQ2VQ8M6Z4X0R1S2T3V4W5`. Gerado na criação pela aplicação; notas criadas fora dela podem não
   ter `id` — a aplicação **não** adiciona `id` silenciosamente a notas existentes.
   O `id` é a referência estável entre entidades no banco (o caminho pode mudar).
2. **Datas no frontmatter: `AAAA-MM-DD`** (`created`, `updated`, datas de leitura etc.), no fuso
   `APP_TIMEZONE` (padrão `America/Sao_Paulo`). Compatível com o tipo "Data" das Propriedades do
   Obsidian e com Dataview. O instante preciso de criação está no ULID; o de cada alteração, no Git.
3. **YAML 1.2 (schema core):** datas permanecem strings — nenhuma conversão para objeto `Date` que
   pudesse reformatar o valor ao regravar. Alterações programáticas no frontmatter são **mínimas**
   (troca de uma linha), preservando comentários, ordem e formatação do usuário.
4. **Nome do arquivo = título**, com saneamento para funcionar em Windows/macOS/Linux e em links do
   Obsidian: normalização Unicode NFC; `:` → ` -`; `\ / * ? " < > | # ^ [ ]` e caracteres de controle
   → espaço; espaços repetidos colapsados; sem ponto/espaço no início ou fim; nomes reservados do
   Windows (`CON`, `NUL`, `COM1`…) recebem sufixo `_`; máximo de 120 caracteres. Acentos e
   maiúsculas são preservados.
5. **Unicidade sem diferenciar maiúsculas/minúsculas:** `Nota.md` e `nota.md` colidem em macOS e
   Windows; a criação compara caminhos em NFC e minúsculas e recusa duplicatas (nada é sobrescrito).
6. **Caminhos válidos:** relativos, separador `/`, sem `..`, sem segmentos ocultos (`.git`, `.obsidian`
   etc. não são acessíveis pela API de notas), sem `\`, sem caracteres nulos, até 400 caracteres.
