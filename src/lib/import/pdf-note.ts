import { z } from 'zod';

/** Limites do que o navegador envia (o corpo de uma requisição na Vercel vai até ~4,5 MB). */
export const PDF_IMPORT_LIMITS = {
  maxPages: 40,
  maxPageTextChars: 12_000,
  /** Imagem de página em JPEG, em base64. */
  maxImageChars: 1_500_000,
  maxRequestBytes: 4_200_000,
} as const;

/** A IA recusou, falhou ou não devolveu um resultado utilizável (nada é criado). */
export class PdfReadError extends Error {
  override readonly name = 'PdfReadError';
  constructor(
    /** Status HTTP da resposta da aplicação. */
    readonly status: 422 | 500 | 503,
    message: string,
  ) {
    super(message);
  }
}

export const pdfImportSchema = z.object({
  fileName: z.string().trim().min(1).max(200),
  pageCount: z.number().int().min(1).max(10_000),
  pages: z
    .array(
      z.object({
        number: z.number().int().min(1),
        text: z.string().max(PDF_IMPORT_LIMITS.maxPageTextChars),
        /** JPEG em base64 (sem o prefixo `data:`), quando a página tem pouco texto. */
        image: z
          .string()
          .max(PDF_IMPORT_LIMITS.maxImageChars)
          .regex(/^[A-Za-z0-9+/]+=*$/)
          .optional(),
      }),
    )
    .min(1)
    .max(PDF_IMPORT_LIMITS.maxPages),
});

export type PdfImportInput = z.infer<typeof pdfImportSchema>;

/** O que a IA devolve (saída estruturada, validada pelo SDK). */
export const pdfReadingSchema = z.object({
  title: z.string().describe('Título do documento ou da obra, como aparece nele.'),
  author: z.string().describe('Autor(es), ou texto vazio se não aparecer no documento.'),
  summary: z
    .string()
    .describe(
      'Resumo fiel em português do Brasil, de 2 a 4 parágrafos separados por linha em branco.',
    ),
  key_ideas: z.array(z.string()).describe('Ideias centrais, uma frase cada (3 a 8).'),
  quotes: z
    .array(z.object({ text: z.string(), page: z.number().int() }))
    .describe('Trechos copiados EXATAMENTE do documento (até 6), com o número da página.'),
  applications: z.array(z.string()).describe('Como aplicar as ideias na prática (2 a 5).'),
  tags: z.array(z.string()).describe('De 1 a 5 temas curtos, minúsculos, sem # e sem espaços.'),
});

export type PdfReading = z.infer<typeof pdfReadingSchema>;

const oneLine = (value: string, max: number) => value.replace(/\s+/g, ' ').trim().slice(0, max);

/** Tags seguras para o YAML e para o Obsidian: letras, números, `-`, `_` e `/`. */
export function cleanTags(tags: readonly string[]): string[] {
  const result = new Set<string>();
  for (const tag of tags) {
    const clean = tag
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .toLowerCase()
      .replace(/^#/, '')
      .replace(/\s+/g, '-')
      .replace(/[^a-z0-9/_-]/g, '')
      .replace(/^[-/]+|[-/]+$/g, '');
    if (clean && /[a-z]/.test(clean)) result.add(clean.slice(0, 40));
    if (result.size === 5) break;
  }
  return [...result];
}

/**
 * Texto vindo da IA (lido de um documento NÃO confiável) entra na nota como texto: sem HTML, sem
 * linhas que imitem frontmatter, e `[[` neutralizado para não criar links por conta própria.
 */
export function safeText(value: string): string {
  return value
    .replace(/\r\n?/g, '\n')
    .replace(/<[^>]*>/g, '')
    .replace(/\[\[/g, '[ [')
    .replace(/^---\s*$/gm, '—')
    .trim();
}

const bullets = (items: readonly string[]) =>
  items
    .map((item) => oneLine(safeText(item), 600))
    .filter(Boolean)
    .map((item) => `- ${item}`)
    .join('\n');

/** Corpo da nota de fonte a partir da leitura da IA (seções do modelo "Fonte"). */
export function sourceNoteBody(
  reading: PdfReading,
  meta: { fileName: string; pageCount: number; date: string },
): string {
  const quotes = reading.quotes
    .map((quote) => ({ text: oneLine(safeText(quote.text), 800), page: quote.page }))
    .filter((quote) => quote.text)
    .map((quote) => `> "${quote.text}"${quote.page > 0 ? ` (p. ${quote.page})` : ''}`)
    .join('\n\n');
  const summary = safeText(reading.summary)
    .split(/\n{2,}/)
    .map((paragraph) => paragraph.replace(/\s+/g, ' ').trim())
    .filter(Boolean)
    .join('\n\n');
  return [
    `> 📄 Importado de **${oneLine(meta.fileName, 200).replace(/[*_`[\]]/g, '')}** (${meta.pageCount} ${meta.pageCount === 1 ? 'página' : 'páginas'}) em ${meta.date}. Resumo feito por IA: confira com o original.`,
    '',
    '## Resumo (IA)',
    '',
    summary || '_A IA não encontrou texto para resumir._',
    '',
    '## Ideias centrais',
    '',
    bullets(reading.key_ideas) || '- ',
    '',
    '## Citações',
    '',
    quotes || '_Nenhuma citação._',
    '',
    '## Aplicações práticas',
    '',
    bullets(reading.applications) || '- ',
    '',
    '## Resumo (meu)',
    '',
    '',
  ].join('\n');
}

/** Título da nota: o da IA, ou o nome do arquivo sem `.pdf`. */
export function sourceNoteTitle(reading: PdfReading, fileName: string): string {
  const fromAi = oneLine(safeText(reading.title), 120)
    .replace(/[\\/:*?"<>|#^[\]]/g, ' ')
    .trim();
  if (/[\p{L}\p{N}]/u.test(fromAi)) return fromAi.replace(/\s+/g, ' ');
  const fromFile = fileName
    .replace(/\.pdf$/i, '')
    .replace(/[_]+/g, ' ')
    .replace(/[\\/:*?"<>|#^[\]]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return fromFile || 'PDF importado';
}
