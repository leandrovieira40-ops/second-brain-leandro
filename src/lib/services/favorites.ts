import {
  AlreadyExistsError,
  ConflictError,
  NotFoundError,
  UnsupportedContentError,
} from '@/lib/vault/errors';
import { assertNotePath } from '@/lib/vault/paths';
import type { VaultStore } from '@/lib/vault/types';
import { FAVORITES_PATH, parseFavoritesFile, serializeFavoritesFile } from './favorites-file';
import { commitMessage } from './notes';

/**
 * Favoritos são uma decisão do usuário (não derivável): ficam no próprio vault, em JSON legível,
 * versionados pelo Git (DATA_MODEL.md §5).
 */
export interface Favorites {
  notes: string[];
  /** O arquivo existe mas não está no formato esperado (nunca é sobrescrito nesse caso). */
  invalid: boolean;
}

export class FavoritesService {
  constructor(private readonly store: VaultStore) {}

  async list(): Promise<Favorites> {
    const raw = await this.readRaw();
    if (!raw) return { notes: [], invalid: false };
    return raw.parsed ? { notes: raw.parsed.notes, invalid: false } : { notes: [], invalid: true };
  }

  async set(path: string, favorite: boolean): Promise<string[]> {
    const note = assertNotePath(path);
    for (let attempt = 0; attempt < 3; attempt++) {
      const current = await this.readRaw();
      if (current && !current.parsed) {
        throw new UnsupportedContentError(
          `${FAVORITES_PATH} não está no formato esperado. Corrija-o no vault; nada foi alterado.`,
        );
      }
      const notes = new Set(current?.parsed?.notes ?? []);
      if (favorite) notes.add(note);
      else notes.delete(note);
      const next = [...notes];
      const content = serializeFavoritesFile(next);
      const message = {
        message: commitMessage(`${favorite ? 'Adiciona' : 'Remove'} favorito ${note}`),
      };
      try {
        await this.store.commit(
          [{ kind: 'put', path: FAVORITES_PATH, content, expectedSha: current?.sha ?? null }],
          message,
        );
        return next;
      } catch (error) {
        // Outra aba/dispositivo alterou os favoritos: relê e reaplica a mesma operação.
        if (!(error instanceof ConflictError) && !(error instanceof AlreadyExistsError))
          throw error;
      }
    }
    throw new ConflictError(null, 'Os favoritos mudaram várias vezes seguidas. Tente de novo.');
  }

  private async readRaw(): Promise<{ sha: string; parsed: { notes: string[] } | null } | null> {
    try {
      const file = await this.store.read(FAVORITES_PATH);
      const notes = parseFavoritesFile(file.content);
      return { sha: file.sha, parsed: notes ? { notes } : null };
    } catch (error) {
      if (error instanceof NotFoundError) return null;
      throw error;
    }
  }
}
