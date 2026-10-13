import { describe, expect, it } from 'vitest';
import { UnsupportedContentError } from '@/lib/vault/errors';
import { MemoryVaultStore } from '@/lib/vault/memory-store';
import { FavoritesService } from './favorites';
import { FAVORITES_PATH } from './notes';

describe('FavoritesService', () => {
  it('cria, adiciona e remove favoritos num JSON legível dentro do vault', async () => {
    const store = new MemoryVaultStore({ 'a.md': 'x', 'b.md': 'y' });
    const service = new FavoritesService(store);
    expect(await service.list()).toEqual({ notes: [], invalid: false });
    expect(await service.set('a.md', true)).toEqual(['a.md']);
    expect(await service.set('b.md', true)).toEqual(['a.md', 'b.md']);
    expect(await service.set('a.md', false)).toEqual(['b.md']);
    expect(JSON.parse((await store.read(FAVORITES_PATH)).content)).toEqual({
      version: 1,
      notes: ['b.md'],
    });
  });

  it('reaplica a operação quando outro dispositivo alterou o arquivo', async () => {
    const store = new MemoryVaultStore({ [FAVORITES_PATH]: '{"version":1,"notes":["a.md"]}' });
    const service = new FavoritesService(store);
    const original = store.read.bind(store);
    let first = true;
    // Simula uma escrita concorrente entre a leitura e a gravação.
    store.read = async (path: string) => {
      const file = await original(path);
      if (first && path === FAVORITES_PATH) {
        first = false;
        store.writeExternal(FAVORITES_PATH, '{"version":1,"notes":["a.md","c.md"]}');
      }
      return file;
    };
    expect(await service.set('b.md', true)).toEqual(['a.md', 'c.md', 'b.md']);
  });

  it('nunca sobrescreve um arquivo de favoritos inválido', async () => {
    const store = new MemoryVaultStore({ [FAVORITES_PATH]: 'isto não é json' });
    const service = new FavoritesService(store);
    expect(await service.list()).toEqual({ notes: [], invalid: true });
    await expect(service.set('a.md', true)).rejects.toBeInstanceOf(UnsupportedContentError);
    expect((await store.read(FAVORITES_PATH)).content).toBe('isto não é json');
  });
});
