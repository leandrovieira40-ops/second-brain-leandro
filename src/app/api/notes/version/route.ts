import { route } from '@/lib/http/route';
import { restoreVersionSchema, versionQuerySchema } from '@/lib/http/notes-schemas';
import { getNotesService } from '@/lib/services';

export const dynamic = 'force-dynamic';

/** Conteúdo da nota numa versão anterior (somente leitura). */
export const GET = route(
  { operation: 'notes.version', mutation: false, schema: versionQuerySchema, source: 'query' },
  ({ path, commit }) => getNotesService().readVersion(path, commit),
);

/** Restaura uma versão anterior como nova versão (SHA atual exigido). */
export const POST = route(
  {
    operation: 'notes.restore_version',
    mutation: true,
    schema: restoreVersionSchema,
    source: 'body',
  },
  (input) => getNotesService().restoreVersion(input),
);
