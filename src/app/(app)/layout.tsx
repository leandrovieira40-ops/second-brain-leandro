import { Suspense } from 'react';
import { AppShell } from '@/components/app-shell';
import { requireSession } from '@/lib/auth/guard';
import { ConfigError, readAppConfig, readDatabaseUrl, readVaultConfig } from '@/lib/config/env';
import { getFavoritesService, getNotesService } from '@/lib/services';
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

function searchAvailable(): boolean {
  try {
    return readDatabaseUrl() !== null;
  } catch {
    return false; // DATABASE_URL inválida: a interface trata como índice indisponível
  }
}

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  await requireSession();
  const { appName, timeZone } = readAppConfig();
  let tree: VaultTree = {
    notes: [],
    folders: [],
    attachments: [],
    trashCount: 0,
    favoritesSha: null,
  };
  let vaultError: string | null = null;
  let storeKind: 'github' | 'fs' | 'memory' = 'github';
  let favorites: string[] = [];
  try {
    storeKind = readVaultConfig().store;
    tree = await getNotesService().tree();
    // Só lê o arquivo de favoritos se ele existir (economiza uma chamada à API do GitHub).
    if (tree.favoritesSha) favorites = (await getFavoritesService().list()).notes;
  } catch (error) {
    if (error instanceof VaultError || error instanceof ConfigError) vaultError = error.message;
    else throw error;
  }
  return (
    <Suspense>
      <AppShell
        appName={appName}
        vault={{ tree, storeKind, timeZone, searchAvailable: searchAvailable(), error: vaultError }}
        vaultLabel={vaultLabel()}
        initialFavorites={favorites}
      >
        {children}
      </AppShell>
    </Suspense>
  );
}
