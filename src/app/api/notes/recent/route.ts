import { getDb } from '@/lib/db';
import { emptyQuerySchema } from '@/lib/http/notes-schemas';
import { route } from '@/lib/http/route';
import { recentNotes } from '@/lib/index/queries';

export const dynamic = 'force-dynamic';

/** Notas mais recentes, com um trecho do texto (cartões do Início). Precisa do índice. */
export const GET = route(
  { operation: 'notes.recent', mutation: false, schema: emptyQuerySchema, source: 'query' },
  async () => {
    const db = getDb();
    if (!db) return { available: false, notes: [] };
    return { available: true, notes: await recentNotes(db) };
  },
);
