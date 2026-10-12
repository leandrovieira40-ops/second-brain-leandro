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
