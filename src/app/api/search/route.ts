import { getDb } from '@/lib/db';
import { searchQuerySchema } from '@/lib/http/notes-schemas';
import { route } from '@/lib/http/route';
import { searchNotes } from '@/lib/index/queries';

export const dynamic = 'force-dynamic';

/** Busca global no índice derivado. Sem banco: `available: false` (a interface explica). */
export const GET = route(
  { operation: 'search', mutation: false, schema: searchQuerySchema, source: 'query' },
  async (input) => {
    const db = getDb();
    if (!db) return { available: false, hits: [] };
    return { available: true, hits: await searchNotes(db, input) };
  },
);
