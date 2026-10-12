import { route } from '@/lib/http/route';
import { emptyQuerySchema } from '@/lib/http/notes-schemas';
import { getNoteIndex } from '@/lib/services';
import { VaultConfigError } from '@/lib/vault/errors';

export const dynamic = 'force-dynamic';
// A primeira indexação de um vault grande lê todas as notas (limite do Hobby: 300 s).
export const maxDuration = 300;

/** Sincroniza o índice com o vault (lê só o que mudou desde a última vez). */
export const POST = route(
  { operation: 'index.sync', mutation: true, schema: emptyQuerySchema, source: 'body' },
  async () => {
    const index = getNoteIndex();
    if (!index)
      throw new VaultConfigError(
        'Índice não configurado: defina DATABASE_URL (docs/DEPLOYMENT.md).',
      );
    return index.sync();
  },
);
