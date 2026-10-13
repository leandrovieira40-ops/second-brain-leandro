import type { Metadata } from 'next';
import { TrashView } from '@/components/trash-view';
import { requireSession } from '@/lib/auth/guard';
import { readVaultConfig } from '@/lib/config/env';
import { getNotesService } from '@/lib/services';
import type { TrashItem } from '@/lib/services/notes';
import { VaultError } from '@/lib/vault/errors';

export const metadata: Metadata = { title: 'Lixeira' };

export default async function TrashPage() {
  await requireSession();
  let items: TrashItem[] = [];
  let error: string | null = null;
  try {
    items = await getNotesService().listTrash();
  } catch (e) {
    if (!(e instanceof VaultError)) throw e;
    error = e.message;
  }
  return (
    <TrashView
      initialItems={items}
      error={error}
      hasHistory={readVaultConfig().store === 'github'}
    />
  );
}
