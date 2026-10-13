import { route } from '@/lib/http/route';
import { emptyQuerySchema } from '@/lib/http/notes-schemas';
import { getNotesService } from '@/lib/services';

export const dynamic = 'force-dynamic';

export const GET = route(
  { operation: 'trash.list', mutation: false, schema: emptyQuerySchema, source: 'query' },
  async () => ({ items: await getNotesService().listTrash() }),
);
