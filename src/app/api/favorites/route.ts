import { route } from '@/lib/http/route';
import { emptyQuerySchema, favoriteSchema } from '@/lib/http/notes-schemas';
import { getFavoritesService } from '@/lib/services';

export const dynamic = 'force-dynamic';

export const GET = route(
  { operation: 'favorites.list', mutation: false, schema: emptyQuerySchema, source: 'query' },
  () => getFavoritesService().list(),
);

export const PUT = route(
  { operation: 'favorites.set', mutation: true, schema: favoriteSchema, source: 'body' },
  async ({ path, favorite }) => ({ notes: await getFavoritesService().set(path, favorite) }),
);
