import { route } from '@/lib/http/route';
import { purgeSchema } from '@/lib/http/notes-schemas';
import { getNotesService } from '@/lib/services';

export const dynamic = 'force-dynamic';

export const POST = route(
  { operation: 'trash.purge', mutation: true, schema: purgeSchema, source: 'body' },
  (input) => getNotesService().purge(input),
);
