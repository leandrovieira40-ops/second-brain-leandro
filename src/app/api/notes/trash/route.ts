import { route } from '@/lib/http/route';
import { trashNoteSchema } from '@/lib/http/notes-schemas';
import { getNotesService } from '@/lib/services';

export const dynamic = 'force-dynamic';

/** Move a nota para a lixeira (`.trash/`) num único commit. */
export const POST = route(
  { operation: 'notes.trash', mutation: true, schema: trashNoteSchema, source: 'body' },
  (input) => getNotesService().trash(input),
);
