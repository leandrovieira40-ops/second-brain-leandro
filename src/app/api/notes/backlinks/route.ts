import { getDb } from '@/lib/db';
import { pathQuerySchema } from '@/lib/http/notes-schemas';
import { route } from '@/lib/http/route';
import { backlinksTo } from '@/lib/index/queries';
import { assertNotePath } from '@/lib/vault/paths';

export const dynamic = 'force-dynamic';

export const GET = route(
  { operation: 'notes.backlinks', mutation: false, schema: pathQuerySchema, source: 'query' },
  async ({ path }) => {
    const db = getDb();
    if (!db) return { available: false, backlinks: [] };
    return { available: true, backlinks: await backlinksTo(db, assertNotePath(path)) };
  },
);
