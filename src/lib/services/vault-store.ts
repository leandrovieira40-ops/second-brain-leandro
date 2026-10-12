import 'server-only';
import { createHash } from 'node:crypto';
import { readVaultConfig, type VaultConfig } from '@/lib/config/env';
import { FsVaultStore } from '@/lib/vault/fs-store';
import { GitHubVaultStore } from '@/lib/vault/github-store';
import type { VaultStore } from '@/lib/vault/types';

let cached: { key: string; store: VaultStore } | null = null;

function configKey(config: VaultConfig): string {
  return config.store === 'fs'
    ? `fs:${config.root}`
    : `github:${config.owner}/${config.repo}@${config.branch}:${createHash('sha256').update(config.token).digest('hex')}`;
}

/** Adaptador configurado por variáveis de ambiente (reutilizado entre requisições da instância). */
export function getVaultStore(): VaultStore {
  const config = readVaultConfig();
  const key = configKey(config);
  if (cached?.key === key) return cached.store;
  const store =
    config.store === 'fs'
      ? new FsVaultStore(config.root)
      : new GitHubVaultStore({
          owner: config.owner,
          repo: config.repo,
          branch: config.branch,
          token: config.token,
        });
  cached = { key, store };
  return store;
}
