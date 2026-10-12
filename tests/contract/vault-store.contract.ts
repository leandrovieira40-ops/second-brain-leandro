import { describe, expect, it } from 'vitest';
import { gitBlobShaOfText } from '@/lib/vault/blob';
import { AlreadyExistsError, ConflictError, NotFoundError } from '@/lib/vault/errors';
import { InvalidPathError } from '@/lib/vault/paths';
import type { VaultStore } from '@/lib/vault/types';

export interface ContractHarness {
  store: VaultStore;
  /** Prefixo isolado para os arquivos do teste (o GitHub real é compartilhado entre execuções). */
  prefix: string;
  /** Altera um arquivo "por fora" da aplicação (Obsidian, outro dispositivo). */
  writeExternal(path: string, content: string): Promise<void>;
}

const message = { message: 'teste de contrato\n\nSecond-Brain-Origin: test' };

/** Comportamento que todo adaptador de `VaultStore` precisa garantir (ADR-0004). */
export function describeVaultStoreContract(name: string, setup: () => Promise<ContractHarness>) {
  describe(`VaultStore contrato: ${name}`, () => {
    it('cria e lê o mesmo conteúdo, com SHA de blob Git', async () => {
      const { store, prefix } = await setup();
      const path = `${prefix}Notas/Primeira nota.md`;
      const content = '---\ntitle: Primeira\n---\nOlá, [[mundo]]! Ação, emoção 🧠\r\nfim\n';
      const created = await store.create(path, content, message);
      expect(created.sha).toBe(gitBlobShaOfText(content));
      const read = await store.read(path);
      expect(read.content).toBe(content);
      expect(read.sha).toBe(created.sha);
    });

    it('preserva BOM e bytes exatos', async () => {
      const { store, prefix } = await setup();
      const path = `${prefix}bom.md`;
      const content = '﻿# Com BOM\n';
      await store.create(path, content, message);
      expect((await store.read(path)).content).toBe(content);
    });

    it('nunca sobrescreve na criação', async () => {
      const { store, prefix } = await setup();
      const path = `${prefix}existe.md`;
      await store.create(path, 'original', message);
      await expect(store.create(path, 'outra coisa', message)).rejects.toBeInstanceOf(AlreadyExistsError);
      expect((await store.read(path)).content).toBe('original');
    });

    it('atualiza com o SHA esperado e devolve o novo SHA', async () => {
      const { store, prefix } = await setup();
      const path = `${prefix}editar.md`;
      const { sha } = await store.create(path, 'v1', message);
      const updated = await store.update(path, 'v2', { ...message, expectedSha: sha });
      expect(updated.sha).toBe(gitBlobShaOfText('v2'));
      expect((await store.read(path)).content).toBe('v2');
    });

    it('recusa atualização com SHA desatualizado sem alterar o arquivo', async () => {
      const { store, prefix } = await setup();
      const path = `${prefix}concorrente.md`;
      const { sha: v1 } = await store.create(path, 'v1', message);
      await store.update(path, 'v2 (outra aba)', { ...message, expectedSha: v1 });
      const error = await store.update(path, 'v2 (esta aba)', { ...message, expectedSha: v1 }).catch((e) => e);
      expect(error).toBeInstanceOf(ConflictError);
      expect((error as ConflictError).currentSha).toBe(gitBlobShaOfText('v2 (outra aba)'));
      expect((await store.read(path)).content).toBe('v2 (outra aba)');
    });

    it('detecta alteração externa (cenário G)', async () => {
      const harness = await setup();
      const path = `${harness.prefix}externa.md`;
      const { sha } = await harness.store.create(path, 'web', message);
      await harness.writeExternal(path, 'editado no Obsidian');
      await expect(
        harness.store.update(path, 'web v2', { ...message, expectedSha: sha }),
      ).rejects.toBeInstanceOf(ConflictError);
      expect((await harness.store.read(path)).content).toBe('editado no Obsidian');
    });

    it('sinaliza arquivo inexistente', async () => {
      const { store, prefix } = await setup();
      await expect(store.read(`${prefix}nao-existe.md`)).rejects.toBeInstanceOf(NotFoundError);
      await expect(
        store.update(`${prefix}nao-existe.md`, 'x', { ...message, expectedSha: gitBlobShaOfText('x') }),
      ).rejects.toBeInstanceOf(NotFoundError);
    });

    it('lista arquivos com SHA e tamanho', async () => {
      const { store, prefix } = await setup();
      await store.create(`${prefix}lista/a.md`, 'a', message);
      await store.create(`${prefix}lista/sub/b.md`, 'bb', message);
      const entries = (await store.list()).filter((e) => e.path.startsWith(`${prefix}lista/`));
      expect(entries).toEqual([
        { path: `${prefix}lista/a.md`, sha: gitBlobShaOfText('a'), size: 1 },
        { path: `${prefix}lista/sub/b.md`, sha: gitBlobShaOfText('bb'), size: 2 },
      ]);
    });

    it('rejeita caminhos perigosos', async () => {
      const { store } = await setup();
      await expect(store.read('../fora.md')).rejects.toBeInstanceOf(InvalidPathError);
      await expect(store.create('/abs.md', 'x', message)).rejects.toBeInstanceOf(InvalidPathError);
    });
  });
}
