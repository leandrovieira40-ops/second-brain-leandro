import { getDb } from '@/lib/db';
import { emptyQuerySchema } from '@/lib/http/notes-schemas';
import { route } from '@/lib/http/route';
import { brokenLinks, orphanNotes } from '@/lib/index/queries';
import { getNoteIndex } from '@/lib/services';

export const dynamic = 'force-dynamic';

/** Estado do índice derivado e a saúde do vault (links quebrados, notas órfãs) para o Início. */
export const GET = route(
  { operation: 'index.status', mutation: false, schema: emptyQuerySchema, source: 'query' },
  async () => {
    const db = getDb();
    const index = getNoteIndex();
    if (!db || !index) return { available: false };
    const [status, broken, orphans] = await Promise.all([
      index.status(),
      brokenLinks(db, 20),
      orphanNotes(db, 20),
    ]);
    return { available: true, ...status, brokenLinks: broken, orphans };
  },
);
