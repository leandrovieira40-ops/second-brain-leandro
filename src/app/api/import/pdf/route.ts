import { readAiConfig, readAppConfig } from '@/lib/config/env';
import {
  PdfReadError,
  pdfImportSchema,
  sourceNoteBody,
  sourceNoteTitle,
  cleanTags,
  safeText,
} from '@/lib/import/pdf-note';
import { ClaudePdfReader } from '@/lib/import/pdf-reader';
import { route } from '@/lib/http/route';
import { formatIsoDate } from '@/lib/notes/property-display';
import { isoDateInTimeZone } from '@/lib/notes/dates';
import { getNotesService } from '@/lib/services';

export const dynamic = 'force-dynamic';
// A leitura pela IA de um PDF com várias páginas pode levar mais de um minuto.
export const maxDuration = 300;

/**
 * Importa um PDF: o navegador envia o texto e as imagens das páginas, a IA (Claude, chave só no
 * servidor) lê o documento e a aplicação cria uma nota de fonte em 02-Sources. O conteúdo do PDF é
 * tratado como não confiável: nada dele é executado, e o log registra só contagens.
 */
export const POST = route(
  { operation: 'import.pdf', mutation: true, schema: pdfImportSchema, source: 'body' },
  async (input) => {
    const ai = readAiConfig();
    if (!ai) {
      throw new PdfReadError(
        503,
        'Importar PDF precisa da chave da IA: cadastre ANTHROPIC_API_KEY nas variáveis da Vercel.',
      );
    }
    const reading = await new ClaudePdfReader(ai.apiKey, ai.model).read(input);
    const today = isoDateInTimeZone(new Date(), readAppConfig().timeZone);
    const result = await getNotesService().importSource({
      title: sourceNoteTitle(reading, input.fileName),
      body: sourceNoteBody(reading, {
        fileName: input.fileName,
        pageCount: input.pageCount,
        date: formatIsoDate(today) ?? today,
      }),
      author: safeText(reading.author).replace(/\s+/g, ' ').slice(0, 200),
      tags: cleanTags(reading.tags),
      sourceType: 'pdf',
    });
    return { path: result.path, sha: result.sha };
  },
  201,
);
