import { route } from '@/lib/http/route';
import { trashItemSchema } from '@/lib/http/notes-schemas';
import { getNotesService } from '@/lib/services';

export const dynamic = 'force-dynamic';

export const POST = route(
  { operation: 'trash.restore', mutation: true, schema: trashItemSchema, source: 'body' },
  ({ trashPath }) => getNotesService().restore(trashPath),
);
