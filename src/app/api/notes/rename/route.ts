import { route } from '@/lib/http/route';
import { renameNoteSchema } from '@/lib/http/notes-schemas';
import { getNotesService } from '@/lib/services';

export const dynamic = 'force-dynamic';
// Pode sincronizar o índice e reescrever várias notas num commit.
export const maxDuration = 120;

/** Renomeia e/ou move a nota, atualizando os `[[links]]` para ela num único commit. */
export const POST = route(
  { operation: 'notes.rename', mutation: true, schema: renameNoteSchema, source: 'body' },
  (input) => getNotesService().rename(input),
);
