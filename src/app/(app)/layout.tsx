import { Suspense } from 'react';
import { AppShell } from '@/components/app-shell';
import { requireSession } from '@/lib/auth/guard';
import { ConfigError, readAppConfig, readVaultConfig } from '@/lib/config/env';
import { getNotesService } from '@/lib/services';
import type { VaultTree } from '@/lib/services/notes';
import { VaultError } from '@/lib/vault/errors';

function vaultLabel(): string {
  try {
    const config = readVaultConfig();
    return config.store === 'github'
      ? `GitHub · ${config.owner}/${config.repo}@${config.branch}`
      : 'Pasta local';
  } catch {
    return 'Vault não configurado';
  }
}

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  await requireSession();
  const { appName, timeZone } = readAppConfig();
  let tree: VaultTree = { notes: [], folders: [], attachments: [] };
  let vaultError: string | null = null;
  let storeKind: 'github' | 'fs' | 'memory' = 'github';
  try {
    storeKind = readVaultConfig().store;
    tree = await getNotesService().tree();
  } catch (error) {
    if (error instanceof VaultError || error instanceof ConfigError) vaultError = error.message;
    else throw error;
  }
  return (
    <Suspense>
      <AppShell
        appName={appName}
        vault={{ tree, storeKind, timeZone, error: vaultError }}
        vaultLabel={vaultLabel()}
      >
        {children}
      </AppShell>
    </Suspense>
  );
}
