import { getDb } from '@/lib/db';
import { emptyQuerySchema } from '@/lib/http/notes-schemas';
import { route } from '@/lib/http/route';
import { listTags } from '@/lib/index/queries';

export const dynamic = 'force-dynamic';

export const GET = route(
  { operation: 'tags.list', mutation: false, schema: emptyQuerySchema, source: 'query' },
  async () => {
    const db = getDb();
    if (!db) return { available: false, tags: [] };
    return { available: true, tags: await listTags(db) };
  },
);
