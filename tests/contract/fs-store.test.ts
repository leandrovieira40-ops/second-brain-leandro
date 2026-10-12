import { mkdtemp, mkdir, readFile, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import nodePath from 'node:path';
import { describe, expect, it } from 'vitest';
import { NotFoundError, VaultConfigError } from '@/lib/vault/errors';
import { FsVaultStore } from '@/lib/vault/fs-store';
import { describeVaultStoreContract } from './vault-store.contract';

async function tempVault() {
  return mkdtemp(nodePath.join(tmpdir(), 'sb-fs-'));
}

describeVaultStoreContract('pasta local', async () => {
  const root = await tempVault();
  const store = new FsVaultStore(root, {});
  return {
    store,
    prefix: '',
    writeExternal: async (path, content) => writeFile(nodePath.join(root, path), content, 'utf8'),
  };
});

describe('FsVaultStore — garantias específicas', () => {
  it('recusa rodar na Vercel', () => {
    expect(() => new FsVaultStore('/tmp', { VERCEL: '1' })).toThrow(VaultConfigError);
  });

  it('exige caminho absoluto e raiz existente', async () => {
    expect(() => new FsVaultStore('relativo', {})).toThrow(VaultConfigError);
    const store = new FsVaultStore('/caminho/que/nao/existe', {});
    await expect(store.list()).rejects.toBeInstanceOf(VaultConfigError);
  });

  it('não segue links simbólicos para fora do vault', async () => {
    const root = await tempVault();
    const outside = await tempVault();
    await writeFile(nodePath.join(outside, 'segredo.md'), 'segredo', 'utf8');
    await symlink(outside, nodePath.join(root, 'atalho'));
    await symlink(nodePath.join(outside, 'segredo.md'), nodePath.join(root, 'link.md'));
    const store = new FsVaultStore(root, {});

    await expect(store.read('atalho/segredo.md')).rejects.toBeInstanceOf(NotFoundError);
    await expect(store.create('atalho/novo.md', 'x', { message: 'm' })).rejects.toBeInstanceOf(NotFoundError);
    await expect(store.read('link.md')).rejects.toThrow();
    expect((await store.list()).map((e) => e.path)).toEqual([]);
    expect(await readFile(nodePath.join(outside, 'segredo.md'), 'utf8')).toBe('segredo');
  });

  it('ignora a pasta .git e não deixa arquivos temporários', async () => {
    const root = await tempVault();
    await mkdir(nodePath.join(root, '.git'));
    await writeFile(nodePath.join(root, '.git', 'HEAD'), 'ref', 'utf8');
    const store = new FsVaultStore(root, {});
    const { sha } = await store.create('a.md', '1', { message: 'm' });
    await store.update('a.md', '2', { message: 'm', expectedSha: sha });
    expect((await store.list()).map((e) => e.path)).toEqual(['a.md']);
  });

  it('serializa gravações concorrentes no mesmo arquivo (uma vence, a outra conflita)', async () => {
    const root = await tempVault();
    const store = new FsVaultStore(root, {});
    const { sha } = await store.create('c.md', 'v1', { message: 'm' });
    const results = await Promise.allSettled([
      store.update('c.md', 'aba A', { message: 'm', expectedSha: sha }),
      store.update('c.md', 'aba B', { message: 'm', expectedSha: sha }),
    ]);
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    expect(results.filter((r) => r.status === 'rejected')).toHaveLength(1);
  });
});
