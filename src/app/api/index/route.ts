import { emptyQuerySchema } from '@/lib/http/notes-schemas';
import { route } from '@/lib/http/route';
import { getNoteIndex } from '@/lib/services';

export const dynamic = 'force-dynamic';

/** Estado do índice derivado. */
export const GET = route(
  { operation: 'index.status', mutation: false, schema: emptyQuerySchema, source: 'query' },
  async () => {
    const index = getNoteIndex();
    if (!index) return { available: false };
    return { available: true, ...(await index.status()) };
  },
);
