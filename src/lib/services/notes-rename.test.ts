import { describe, expect, it } from 'vitest';
import { gitBlobShaOfText } from '@/lib/vault/blob';
import {
  AlreadyExistsError,
  ConflictError,
  TooLargeError,
  UnsupportedOperationError,
} from '@/lib/vault/errors';
import { MemoryVaultStore } from '@/lib/vault/memory-store';
import type { BatchChange, WriteOptions } from '@/lib/vault/types';
import { FAVORITES_PATH, MAX_RENAME_UPDATES, NotesService, type WrittenChange } from './notes';

const NOTE = (title: string, body: string) =>
  `---\nid: 01J00000000000000000000000\ntitle: ${title}\ntype: permanent\n---\n${body}`;

const VAULT = {
  '03-Permanent-Notes/Foco.md': NOTE('Foco', 'Ideia central. Ver [[Plano]].\n'),
  '10-Projects/Plano.md': NOTE('Plano', 'Depende de [[Foco]] e [[Foco#Ideia|foco]].\n'),
  '20-Areas/Diário.md': 'Hoje pensei em ![[Foco]] e em [[03-Permanent-Notes/Foco.md]].\n',
  '20-Areas/Outra.md': 'Nada a ver: [[Plano]].\n',
  '.trash/Velha.md': 'Lixo com [[Foco]].\n',
  [FAVORITES_PATH]: JSON.stringify({ version: 1, notes: ['03-Permanent-Notes/Foco.md'] }),
};

function setup(files: Record<string, string> = VAULT) {
  const store = new MemoryVaultStore(files);
  const writes: WrittenChange[][] = [];
  const service = new NotesService(store, {
    timeZone: 'America/Sao_Paulo',
    onWrite: (changes) => writes.push(changes),
  });
  return { store, service, writes };
}

const sha = async (store: MemoryVaultStore, path: string) => (await store.read(path)).sha;

describe('NotesService.rename', () => {
  it('renomeia e atualiza links, título e favoritos num único commit', async () => {
    const { store, service, writes } = setup();
    const before = store.commits.length;
    const result = await service.rename({
      path: '03-Permanent-Notes/Foco.md',
      expectedSha: await sha(store, '03-Permanent-Notes/Foco.md'),
      title: 'Atenção: o recurso escasso',
      folder: '03-Permanent-Notes',
    });

    const newPath = '03-Permanent-Notes/Atenção - o recurso escasso.md';
    expect(result).toEqual({
      path: newPath,
      sha: await sha(store, newPath),
      updatedNotes: ['10-Projects/Plano.md', '20-Areas/Diário.md'],
    });
    expect(store.commits.length - before).toBe(1);
    expect(store.commits.at(-1)!.message).toBe(
      `Renomeia 03-Permanent-Notes/Foco.md para ${newPath} e atualiza links em 2 notas\n\nSecond-Brain-Origin: web`,
    );
    await expect(store.read('03-Permanent-Notes/Foco.md')).rejects.toThrow();

    // O título acompanha o nome (com aspas, porque tem ":"); o corpo fica igual.
    expect((await store.read(newPath)).content).toBe(
      NOTE('"Atenção: o recurso escasso"', 'Ideia central. Ver [[Plano]].\n'),
    );
    expect((await store.read('10-Projects/Plano.md')).content).toBe(
      NOTE(
        'Plano',
        'Depende de [[Atenção - o recurso escasso]] e [[Atenção - o recurso escasso#Ideia|foco]].\n',
      ),
    );
    expect((await store.read('20-Areas/Diário.md')).content).toBe(
      `Hoje pensei em ![[Atenção - o recurso escasso]] e em [[03-Permanent-Notes/Atenção - o recurso escasso.md]].\n`,
    );
    // Notas sem link para ela e a lixeira não são tocadas.
    expect((await store.read('20-Areas/Outra.md')).content).toBe(VAULT['20-Areas/Outra.md']);
    expect((await store.read('.trash/Velha.md')).content).toBe(VAULT['.trash/Velha.md']);
    expect(JSON.parse((await store.read(FAVORITES_PATH)).content)).toEqual({
      version: 1,
      notes: [newPath],
    });

    // O índice recebe exatamente o que foi gravado.
    expect(writes.at(-1)!.map((change) => change.path)).toEqual([
      '03-Permanent-Notes/Foco.md',
      newPath,
      '10-Projects/Plano.md',
      '20-Areas/Diário.md',
    ]);
    const written = writes.at(-1)!.find((change) => change.path === newPath)!;
    expect(written.sha).toBe(gitBlobShaOfText(written.content!));
  });

  it('move para outra pasta mantendo o nome e o título', async () => {
    const { store, service } = setup();
    const content = (await store.read('10-Projects/Plano.md')).content;
    const result = await service.rename({
      path: '10-Projects/Plano.md',
      expectedSha: await sha(store, '10-Projects/Plano.md'),
      title: 'Plano',
      folder: '40-Archive',
    });
    expect(result.path).toBe('40-Archive/Plano.md');
    // [[Plano]] continua resolvendo para a nota movida: nada a reescrever.
    expect(result.updatedNotes).toEqual([]);
    expect((await store.read('40-Archive/Plano.md')).content).toBe(content);
    expect(store.commits.at(-1)!.message).toMatch(/^Move 10-Projects\/Plano.md para 40-Archive/);
  });

  it('não mexe no título quando ele não gerou o nome do arquivo', async () => {
    const { store, service } = setup({ 'a/Nome curto.md': NOTE('Um título bem diferente', 'x\n') });
    await service.rename({
      path: 'a/Nome curto.md',
      expectedSha: await sha(store, 'a/Nome curto.md'),
      title: 'Outro nome',
      folder: 'a',
    });
    expect((await store.read('a/Outro nome.md')).content).toBe(
      NOTE('Um título bem diferente', 'x\n'),
    );
  });

  it('recusa destino ocupado (sem diferenciar maiúsculas) sem gravar nada', async () => {
    const { store, service } = setup();
    const before = store.commits.length;
    await expect(
      service.rename({
        path: '03-Permanent-Notes/Foco.md',
        expectedSha: await sha(store, '03-Permanent-Notes/Foco.md'),
        title: 'plano',
        folder: '10-Projects',
      }),
    ).rejects.toBeInstanceOf(AlreadyExistsError);
    expect(store.commits.length).toBe(before);
  });

  it('permite trocar só maiúsculas/minúsculas do nome', async () => {
    const { store, service } = setup();
    const result = await service.rename({
      path: '10-Projects/Plano.md',
      expectedSha: await sha(store, '10-Projects/Plano.md'),
      title: 'plano',
      folder: '10-Projects',
    });
    expect(result.path).toBe('10-Projects/plano.md');
    expect((await store.list()).map((entry) => entry.path)).not.toContain('10-Projects/Plano.md');
  });

  it('exige a versão que o usuário viu', async () => {
    const { store, service } = setup();
    const before = store.commits.length;
    await expect(
      service.rename({
        path: '03-Permanent-Notes/Foco.md',
        expectedSha: gitBlobShaOfText('versão antiga'),
        title: 'Novo',
        folder: '03-Permanent-Notes',
      }),
    ).rejects.toBeInstanceOf(ConflictError);
    expect(store.commits.length).toBe(before);
  });

  it('se outra nota envolvida mudar no meio, refaz o plano e preserva a edição externa', async () => {
    const { store, service } = setup();
    const commit = store.commit.bind(store);
    let interfered = false;
    store.commit = async (changes: readonly BatchChange[], options: WriteOptions) => {
      if (!interfered) {
        interfered = true;
        store.writeExternal(
          '10-Projects/Plano.md',
          NOTE('Plano', 'Editado no Obsidian: [[Foco]].\n'),
        );
      }
      return commit(changes, options);
    };
    await service.rename({
      path: '03-Permanent-Notes/Foco.md',
      expectedSha: await sha(store, '03-Permanent-Notes/Foco.md'),
      title: 'Atenção',
      folder: '03-Permanent-Notes',
    });
    expect((await store.read('10-Projects/Plano.md')).content).toBe(
      NOTE('Plano', 'Editado no Obsidian: [[Atenção]].\n'),
    );
  });

  it('usa o grafo do índice quando disponível e cai para a leitura direta se ele falhar', async () => {
    const store = new MemoryVaultStore(VAULT);
    let calls = 0;
    const service = new NotesService(store, {
      timeZone: 'America/Sao_Paulo',
      linkGraph: async () => {
        calls++;
        // Índice desatualizado: só conhece o link do Diário.
        return {
          links: [{ sourcePath: '20-Areas/Diário.md', targetRaw: 'Foco' }],
          aliases: new Map(),
        };
      },
    });
    const result = await service.rename({
      path: '03-Permanent-Notes/Foco.md',
      expectedSha: await sha(store, '03-Permanent-Notes/Foco.md'),
      title: 'Atenção',
      folder: '03-Permanent-Notes',
    });
    expect(calls).toBe(1);
    expect(result.updatedNotes).toEqual(['20-Areas/Diário.md']);

    const store2 = new MemoryVaultStore(VAULT);
    const fallback = new NotesService(store2, {
      timeZone: 'America/Sao_Paulo',
      linkGraph: async () => {
        throw new Error('banco fora do ar');
      },
    });
    const result2 = await fallback.rename({
      path: '03-Permanent-Notes/Foco.md',
      expectedSha: await sha(store2, '03-Permanent-Notes/Foco.md'),
      title: 'Atenção',
      folder: '03-Permanent-Notes',
    });
    expect(result2.updatedNotes).toEqual(['10-Projects/Plano.md', '20-Areas/Diário.md']);
  });

  it('não reescreve favoritos em formato inesperado', async () => {
    const { store, service } = setup({ ...VAULT, [FAVORITES_PATH]: '{"notes": "quebrado"' });
    await service.rename({
      path: '03-Permanent-Notes/Foco.md',
      expectedSha: await sha(store, '03-Permanent-Notes/Foco.md'),
      title: 'Atenção',
      folder: '03-Permanent-Notes',
    });
    expect((await store.read(FAVORITES_PATH)).content).toBe('{"notes": "quebrado"');
  });

  it('recusa renomeações que reescreveriam notas demais', async () => {
    const files: Record<string, string> = { 'Alvo.md': 'x' };
    for (let i = 0; i <= MAX_RENAME_UPDATES; i++) files[`n/${i}.md`] = '[[Alvo]]';
    const { store, service } = setup(files);
    await expect(
      service.rename({
        path: 'Alvo.md',
        expectedSha: await sha(store, 'Alvo.md'),
        title: 'Novo alvo',
        folder: '',
      }),
    ).rejects.toBeInstanceOf(TooLargeError);
  });

  it('no GitHub sem índice, recusa vaults grandes em vez de ler tudo', async () => {
    const files: Record<string, string> = { 'Alvo.md': 'x' };
    for (let i = 0; i < 401; i++) files[`n/${i}.md`] = 'y';
    const store = new MemoryVaultStore(files);
    Object.defineProperty(store, 'kind', { value: 'github' });
    const service = new NotesService(store, { timeZone: 'America/Sao_Paulo' });
    await expect(
      service.rename({
        path: 'Alvo.md',
        expectedSha: await sha(store, 'Alvo.md'),
        title: 'Novo',
        folder: '',
      }),
    ).rejects.toBeInstanceOf(UnsupportedOperationError);
  });

  it('mesmo caminho: não faz commit', async () => {
    const { store, service } = setup();
    const before = store.commits.length;
    const result = await service.rename({
      path: '10-Projects/Plano.md',
      expectedSha: await sha(store, '10-Projects/Plano.md'),
      title: 'Plano',
      folder: '10-Projects',
    });
    expect(result.updatedNotes).toEqual([]);
    expect(store.commits.length).toBe(before);
  });
});
