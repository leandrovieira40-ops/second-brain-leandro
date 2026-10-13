import { getDb } from '@/lib/db';
import { emptyQuerySchema } from '@/lib/http/notes-schemas';
import { route } from '@/lib/http/route';
import { noteGraph } from '@/lib/index/queries';

export const dynamic = 'force-dynamic';

/** Notas e ligações para a visão em grafo (do índice derivado). */
export const GET = route(
  { operation: 'graph', mutation: false, schema: emptyQuerySchema, source: 'query' },
  async () => {
    const db = getDb();
    if (!db) return { available: false, nodes: [], edges: [] };
    return { available: true, ...(await noteGraph(db)) };
  },
);
