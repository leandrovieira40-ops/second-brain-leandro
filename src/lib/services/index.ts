import 'server-only';
import { after } from 'next/server';
import { readAppConfig } from '@/lib/config/env';
import { getDb } from '@/lib/db';
import { NoteIndex } from '@/lib/index/indexer';
import { log } from '@/lib/log/logger';
import { FavoritesService } from './favorites';
import { NotesService, type WrittenChange } from './notes';
import { getVaultStore } from './vault-store';

/** Índice derivado, ou `null` sem `DATABASE_URL` (busca/backlinks ficam indisponíveis). */
export function getNoteIndex(): NoteIndex | null {
  const db = getDb();
  return db ? new NoteIndex(db, getVaultStore()) : null;
}

/** Atualiza o índice depois da resposta (não atrasa nem arrisca a gravação da nota). */
function scheduleIndexUpdate(changes: WrittenChange[]): void {
  const index = getNoteIndex();
  if (!index) return;
  after(async () => {
    const started = Date.now();
    try {
      await index.apply(changes);
      log('info', 'index.apply', { files: changes.length, ms: Date.now() - started });
    } catch (error) {
      const errorClass = error instanceof Error ? error.name : 'unknown';
      log('error', 'index.apply_failed', { errorClass });
      await index
        .recordError('Falha ao atualizar o índice; rode "Sincronizar índice".')
        .catch(() => undefined);
    }
  });
}

export function getNotesService(): NotesService {
  const index = getNoteIndex();
  return new NotesService(getVaultStore(), {
    timeZone: readAppConfig().timeZone,
    onWrite: scheduleIndexUpdate,
    linkGraph: index ? () => index.linkGraph() : undefined,
  });
}

export function getFavoritesService(): FavoritesService {
  return new FavoritesService(getVaultStore());
}
