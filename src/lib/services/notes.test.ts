import { describe, expect, it } from 'vitest';
import { gitBlobShaOfText } from '@/lib/vault/blob';
import { AlreadyExistsError, ConflictError, TooLargeError } from '@/lib/vault/errors';
import { InvalidPathError } from '@/lib/vault/paths';
import { MemoryVaultStore } from '@/lib/vault/memory-store';
import { parseNote } from '@/lib/notes/parse';
import { MAX_NOTE_BYTES, NotesService } from './notes';

const now = () => new Date('2026-10-12T21:30:00Z'); // 18:30 em São Paulo

function setup(files: Record<string, string> = {}) {
  const store = new MemoryVaultStore(files);
  return { store, service: new NotesService(store, { timeZone: 'America/Sao_Paulo', now }) };
}

describe('NotesService.tree', () => {
  it('separa notas, pastas (inclusive vazias) e anexos, ocultando pastas de sistema', async () => {
    const { service } = setup({
      '00-Inbox/.gitkeep': '',
      '03-Permanent-Notes/Ideia.md': 'x',
      'Attachments/foto.png': 'png',
      '.obsidian/app.json': '{}',
      '.trash/velha.md': 'x',
      'README.md': '# vault',
    });
    expect(await service.tree()).toEqual({
      notes: ['03-Permanent-Notes/Ideia.md', 'README.md'],
      folders: ['00-Inbox', '03-Permanent-Notes', 'Attachments'],
      attachments: ['Attachments/foto.png'],
      trashCount: 1,
      favoritesSha: null,
    });
  });
});

describe('NotesService.create', () => {
  it('cria a nota com template, ULID, datas no fuso e trailer de origem', async () => {
    const { service, store } = setup();
    const result = await service.create({
      title: 'Livro: Subtítulo',
      folder: '02-Sources/Books',
      type: 'book',
    });
    expect(result.path).toBe('02-Sources/Books/Livro - Subtítulo.md');
    const note = parseNote(result.path, (await store.read(result.path)).content);
    expect(note.frontmatter).toMatchObject({
      title: 'Livro: Subtítulo',
      type: 'book',
      created: '2026-10-12',
    });
    expect(note.id).toMatch(/^[0-9A-Z]{26}$/);
    expect(store.commits.at(-1)?.message).toBe(`Cria ${result.path}\n\nSecond-Brain-Origin: web`);
  });

  it('recusa nome duplicado mesmo com caixa diferente, sem alterar nada', async () => {
    const { service, store } = setup({ '00-Inbox/ideia.md': 'original' });
    await expect(
      service.create({ title: 'Ideia', folder: '00-Inbox', type: 'inbox' }),
    ).rejects.toBeInstanceOf(AlreadyExistsError);
    expect((await store.read('00-Inbox/ideia.md')).content).toBe('original');
    expect(store.commits).toHaveLength(0);
  });

  it('recusa pastas ocultas ou com travessia', async () => {
    const { service } = setup();
    await expect(
      service.create({ title: 'x', folder: '.obsidian', type: 'note' }),
    ).rejects.toBeInstanceOf(InvalidPathError);
    await expect(
      service.create({ title: 'x', folder: '../fora', type: 'note' }),
    ).rejects.toBeInstanceOf(InvalidPathError);
  });
});

describe('NotesService.save', () => {
  it('grava exatamente o conteúdo enviado', async () => {
    const { service, store } = setup({ 'a.md': 'v1' });
    const content = '---\nupdated: 2026-10-12\n---\n  espaços e\r\nCRLF preservados  ';
    const result = await service.save({
      path: 'a.md',
      content,
      expectedSha: gitBlobShaOfText('v1'),
    });
    expect(result).toMatchObject({ sha: gitBlobShaOfText(content), alreadyApplied: false });
    expect((await store.read('a.md')).content).toBe(content);
  });

  it('é idempotente quando a gravação anterior já foi aplicada', async () => {
    const { service } = setup({ 'a.md': 'v1' });
    const first = await service.save({
      path: 'a.md',
      content: 'v2',
      expectedSha: gitBlobShaOfText('v1'),
    });
    const retry = await service.save({
      path: 'a.md',
      content: 'v2',
      expectedSha: gitBlobShaOfText('v1'),
    });
    expect(retry).toMatchObject({ sha: first.sha, alreadyApplied: true });
  });

  it('reporta conflito real com o SHA atual e não sobrescreve', async () => {
    const { service, store } = setup({ 'a.md': 'v1' });
    store.writeExternal('a.md', 'editado no Obsidian');
    const error = await service
      .save({ path: 'a.md', content: 'minha versão', expectedSha: gitBlobShaOfText('v1') })
      .catch((e) => e);
    expect(error).toBeInstanceOf(ConflictError);
    expect(error.currentSha).toBe(gitBlobShaOfText('editado no Obsidian'));
    expect((await store.read('a.md')).content).toBe('editado no Obsidian');
  });

  it('limita o tamanho da nota', async () => {
    const { service } = setup({ 'a.md': 'v1' });
    await expect(
      service.save({
        path: 'a.md',
        content: 'x'.repeat(MAX_NOTE_BYTES + 1),
        expectedSha: gitBlobShaOfText('v1'),
      }),
    ).rejects.toBeInstanceOf(TooLargeError);
  });
});

describe('NotesService.createConflictCopy', () => {
  it('cria a cópia ao lado da original sem tocar nela', async () => {
    const { service, store } = setup({ 'Pasta/Nota.md': 'remoto' });
    const result = await service.createConflictCopy({
      sourcePath: 'Pasta/Nota.md',
      content: 'local',
    });
    expect(result.path).toBe('Pasta/Nota (conflito 2026-10-12 1830).md');
    expect((await store.read(result.path)).content).toBe('local');
    expect((await store.read('Pasta/Nota.md')).content).toBe('remoto');
  });
});

describe('NotesService.capture', () => {
  it('cria a captura no Inbox com o texto exato e título da primeira linha', async () => {
    const { service, store } = setup({ '00-Inbox/.gitkeep': '' });
    const text = '# Ligar para o cliente\nsobre a proposta de **assinatura**';
    const result = await service.capture(text);
    expect(result.path).toBe('00-Inbox/Ligar para o cliente.md');
    const content = (await store.read(result.path)).content;
    expect(content.endsWith(`${text}\n`)).toBe(true);
    expect(parseNote(result.path, content).frontmatter).toMatchObject({
      type: 'inbox',
      title: 'Ligar para o cliente',
    });
  });

  it('não sobrescreve capturas com o mesmo título', async () => {
    const { service, store } = setup({ '00-Inbox/Ideia.md': 'original' });
    expect((await service.capture('Ideia')).path).toBe('00-Inbox/Ideia 2.md');
    expect((await service.capture('ideia')).path).toBe('00-Inbox/ideia 3.md');
    expect((await store.read('00-Inbox/Ideia.md')).content).toBe('original');
  });

  it('recusa captura vazia', async () => {
    const { service } = setup();
    await expect(service.capture('   ')).rejects.toBeInstanceOf(TooLargeError);
  });
});

describe('NotesService lixeira', () => {
  it('move para .trash/ num único commit e restaura no lugar de origem', async () => {
    const { service, store } = setup({ 'Projetos/Plano.md': 'conteúdo' });
    const { sha } = await store.read('Projetos/Plano.md');
    const commitsBefore = store.commits.length;
    const { trashPath } = await service.trash({ path: 'Projetos/Plano.md', expectedSha: sha });
    expect(trashPath).toBe('.trash/Projetos/Plano.md');
    expect(store.commits.length).toBe(commitsBefore + 1);
    expect((await service.tree()).notes).toEqual([]);
    expect(await service.listTrash()).toMatchObject([
      { path: trashPath, originalPath: 'Projetos/Plano.md' },
    ]);

    const restored = await service.restore(trashPath);
    expect(restored.path).toBe('Projetos/Plano.md');
    expect((await store.read('Projetos/Plano.md')).content).toBe('conteúdo');
    expect(await service.listTrash()).toEqual([]);
  });

  it('exige a versão vista pelo usuário para excluir', async () => {
    const { service, store } = setup({ 'a.md': 'v1' });
    const { sha } = await store.read('a.md');
    store.writeExternal('a.md', 'editado no Obsidian');
    await expect(service.trash({ path: 'a.md', expectedSha: sha })).rejects.toBeInstanceOf(
      ConflictError,
    );
    expect((await store.read('a.md')).content).toBe('editado no Obsidian');
  });

  it('nomes repetidos na lixeira e no destino nunca se sobrescrevem', async () => {
    const { service, store } = setup({ 'a.md': 'primeira', '.trash/a.md': 'antiga na lixeira' });
    const { trashPath } = await service.trash({
      path: 'a.md',
      expectedSha: (await store.read('a.md')).sha,
    });
    expect(trashPath).toBe('.trash/a (excluída 2026-10-12 1830).md');
    expect((await store.read('.trash/a.md')).content).toBe('antiga na lixeira');
    expect((await service.listTrash()).map((i) => i.originalPath)).toEqual(['a.md', 'a.md']);

    await store.create('a.md', 'nova nota no mesmo lugar', { message: 'm' });
    const restored = await service.restore(trashPath);
    expect(restored.path).toBe('a (restaurada 2026-10-12 1830).md');
    expect((await store.read('a.md')).content).toBe('nova nota no mesmo lugar');
    expect((await store.read(restored.path)).content).toBe('primeira');
  });

  it('exclusão definitiva só vale para itens da lixeira', async () => {
    const { service, store } = setup({ 'a.md': 'x', '.trash/b.md': 'y' });
    await expect(
      service.purge({ trashPath: 'a.md', expectedSha: (await store.read('a.md')).sha }),
    ).rejects.toThrow(/lixeira/);
    await service.purge({
      trashPath: '.trash/b.md',
      expectedSha: (await store.read('.trash/b.md')).sha,
    });
    expect(await service.listTrash()).toEqual([]);
    expect((await store.read('a.md')).content).toBe('x');
  });
});

describe('NotesService histórico', () => {
  it('lista versões e restaura uma antiga como nova versão', async () => {
    const { service, store } = setup({ 'a.md': 'v1' });
    const v1 = await store.read('a.md');
    const saved = await service.save({ path: 'a.md', content: 'v2', expectedSha: v1.sha });
    const history = await service.history('a.md');
    expect(history.supported).toBe(true);
    expect(history.commits.map((c) => c.message)).toEqual(['Atualiza a.md', 'Estado inicial']);

    const restored = await service.restoreVersion({
      path: 'a.md',
      commitSha: history.commits[1]!.sha,
      expectedSha: saved.sha,
    });
    expect(restored.content).toBe('v1');
    expect((await store.read('a.md')).content).toBe('v1');
    expect((await service.history('a.md')).commits).toHaveLength(3);
  });
});

describe('NotesService.onWrite (índice derivado)', () => {
  it('avisa só depois de gravações confirmadas, com conteúdo e SHA', async () => {
    const store = new MemoryVaultStore({ 'a.md': 'v1' });
    const changes: { path: string; content?: string; sha?: string }[][] = [];
    const service = new NotesService(store, {
      timeZone: 'America/Sao_Paulo',
      now,
      onWrite: (c) => changes.push(c),
    });
    const v1 = await store.read('a.md');

    await service.save({ path: 'a.md', content: 'v2', expectedSha: v1.sha });
    await expect(
      service.save({ path: 'a.md', content: 'v3', expectedSha: v1.sha }),
    ).rejects.toBeInstanceOf(ConflictError);
    const created = await service.create({ title: 'Nova', folder: 'x', type: 'note' });
    const { trashPath } = await service.trash({
      path: 'a.md',
      expectedSha: (await store.read('a.md')).sha,
    });
    await service.restore(trashPath);

    expect(changes.map((batch) => batch.map((c) => [c.path, c.content !== undefined]))).toEqual([
      [['a.md', true]],
      [[created.path, true]],
      [['a.md', false]],
      [['a.md', true]],
    ]);
    expect(changes[0]![0]).toEqual({ path: 'a.md', content: 'v2', sha: gitBlobShaOfText('v2') });
  });

  it('uma falha no callback não desfaz a gravação', async () => {
    const store = new MemoryVaultStore({ 'a.md': 'v1' });
    const service = new NotesService(store, {
      timeZone: 'America/Sao_Paulo',
      onWrite: () => {
        throw new Error('índice fora do ar');
      },
    });
    await service.save({
      path: 'a.md',
      content: 'v2',
      expectedSha: (await store.read('a.md')).sha,
    });
    expect((await store.read('a.md')).content).toBe('v2');
  });
});
