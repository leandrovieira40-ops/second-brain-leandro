import 'server-only';
import { readAppConfig } from '@/lib/config/env';
import { NotesService } from './notes';
import { getVaultStore } from './vault-store';

export function getNotesService(): NotesService {
  return new NotesService(getVaultStore(), { timeZone: readAppConfig().timeZone });
}
