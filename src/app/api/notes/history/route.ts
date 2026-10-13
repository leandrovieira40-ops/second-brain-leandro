import { route } from '@/lib/http/route';
import { pathQuerySchema } from '@/lib/http/notes-schemas';
import { getNotesService } from '@/lib/services';

export const dynamic = 'force-dynamic';

/** Versões da nota (commits que a alteraram), quando o vault guarda histórico. */
export const GET = route(
  { operation: 'notes.history', mutation: false, schema: pathQuerySchema, source: 'query' },
  ({ path }) => getNotesService().history(path),
);
