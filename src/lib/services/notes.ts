import { encodeText } from '@/lib/vault/blob';
import {
  AlreadyExistsError,
  ConflictError,
  NotFoundError,
  TooLargeError,
} from '@/lib/vault/errors';
import {
  assertFolderPath,
  assertNotePath,
  basename,
  collisionKey,
  dirname,
  isHiddenPath,
  isMarkdownPath,
} from '@/lib/vault/paths';
import type { CommitInfo, VaultStore, WriteResult } from '@/lib/vault/types';
import { captureTitle } from '@/lib/notes/capture';
import { isoDateInTimeZone } from '@/lib/notes/dates';
import { conflictCopyPath, noteFilePath, titleToFileName } from '@/lib/notes/filename';
import { ulid } from '@/lib/notes/ids';
import { newNoteContent } from '@/lib/notes/template';
import { INBOX_FOLDER, type NoteType } from '@/lib/notes/types';

/** Tamanho máximo de uma nota editável (ADR-0008). */
export const MAX_NOTE_BYTES = 1024 * 1024;

export interface VaultTree {
  /** Caminhos de notas (`.md`) visíveis. */
  notes: string[];
  /** Pastas visíveis (inclusive vazias, mantidas por `.gitkeep`). */
  folders: string[];
  /** Demais arquivos visíveis (anexos) — usados para resolver `![[embeds]]`. */
  attachments: string[];
  /** Notas na lixeira (`.trash/`). */
  trashCount: number;
  /** SHA do arquivo de favoritos, se existir (evita uma leitura quando não há favoritos). */
  favoritesSha: string | null;
}

export const TRASH_FOLDER = '.trash';
export const FAVORITES_PATH = '.second-brain/favorites.json';
export const MAX_CAPTURE_CHARS = 20_000;

export interface TrashItem {
  /** Caminho dentro de `.trash/`. */
  path: string;
  /** Para onde a nota volta ao ser restaurada. */
  originalPath: string;
  sha: string;
  size: number;
}

export interface NoteHistory {
  supported: boolean;
  commits: CommitInfo[];
}

export interface NoteDocument {
  path: string;
  content: string;
  sha: string;
}

export interface SaveResult extends WriteResult {
  /** A mesma gravação já tinha sido aplicada (nova tentativa após timeout, clique duplo). */
  alreadyApplied: boolean;
}

export interface NotesServiceOptions {
  timeZone: string;
  now?: () => Date;
}

const ORIGIN_TRAILER = 'Second-Brain-Origin: web';
export const commitMessage = (summary: string) => `${summary}\n\n${ORIGIN_TRAILER}`;
const TRASH_SUFFIX = / \(excluída \d{4}-\d{2}-\d{2} \d{4}(?: \d+)?\)(?=\.md$)/i;

/** Casos de uso de notas sobre qualquer `VaultStore`. Nunca transforma o conteúdo enviado. */
export class NotesService {
  private readonly now: () => Date;

  constructor(
    private readonly store: VaultStore,
    private readonly options: NotesServiceOptions,
  ) {
    this.now = options.now ?? (() => new Date());
  }

  async tree(): Promise<VaultTree> {
    const entries = await this.store.list();
    const notes: string[] = [];
    const attachments: string[] = [];
    const folders = new Set<string>();
    let trashCount = 0;
    let favoritesSha: string | null = null;
    for (const { path, sha } of entries) {
      if (path.startsWith(`${TRASH_FOLDER}/`) && isMarkdownPath(path)) trashCount++;
      if (path === FAVORITES_PATH) favoritesSha = sha;
      // `.gitkeep` só existe para o Git manter pastas vazias: conta a pasta, não o arquivo.
      const keep = basename(path) === '.gitkeep';
      if (isHiddenPath(keep ? dirname(path) : path)) continue;
      for (let folder = dirname(path); folder; folder = dirname(folder)) folders.add(folder);
      if (!keep) (isMarkdownPath(path) ? notes : attachments).push(path);
    }
    const byName = (a: string, b: string) => a.localeCompare(b, 'pt-BR', { numeric: true });
    return {
      notes: notes.sort(byName),
      folders: [...folders].sort(byName),
      attachments: attachments.sort(byName),
      trashCount,
      favoritesSha,
    };
  }

  async read(path: string): Promise<NoteDocument> {
    const file = await this.store.read(assertNotePath(path));
    return { path: file.path, content: file.content, sha: file.sha };
  }

  async create(input: { title: string; folder: string; type: NoteType }): Promise<WriteResult> {
    const folder = assertFolderPath(input.folder);
    const path = assertNotePath(noteFilePath(folder, input.title));
    const now = this.now();
    const content = newNoteContent({
      id: ulid(now.getTime()),
      title: input.title.trim(),
      type: input.type,
      today: isoDateInTimeZone(now, this.options.timeZone),
    });
    return this.createUnique(path, content, `Cria ${path}`);
  }

  /** Salva a versão local como nova nota ao lado da original, sem tocar nela (ADR-0008). */
  async createConflictCopy(input: { sourcePath: string; content: string }): Promise<WriteResult> {
    const source = assertNotePath(input.sourcePath);
    this.assertSize(input.content);
    const path = assertNotePath(conflictCopyPath(source, this.now(), this.options.timeZone));
    return this.createUnique(path, input.content, `Cria cópia de conflito de ${source}`);
  }

  async save(input: {
    path: string;
    content: string;
    expectedSha: string;
    summary?: string;
  }): Promise<SaveResult> {
    const path = assertNotePath(input.path);
    this.assertSize(input.content);
    try {
      const result = await this.store.update(path, input.content, {
        expectedSha: input.expectedSha,
        message: commitMessage(input.summary ?? `Atualiza ${path}`),
      });
      return { ...result, alreadyApplied: false };
    } catch (error) {
      if (!(error instanceof ConflictError)) throw error;
      // Idempotência: se o remoto já tem exatamente este conteúdo, a gravação anterior foi aplicada.
      const current = await this.store.read(path);
      if (current.content === input.content) {
        return { path, sha: current.sha, commitSha: null, alreadyApplied: true };
      }
      throw new ConflictError(current.sha);
    }
  }

  /** Captura rápida: nova nota no Inbox com o texto exato digitado (sem exigir classificação). */
  async capture(text: string): Promise<WriteResult> {
    if (!text.trim()) throw new TooLargeError('A captura está vazia.');
    if (text.length > MAX_CAPTURE_CHARS)
      throw new TooLargeError('Captura longa demais: crie uma nota.');
    const now = this.now();
    const title = captureTitle(text, this.stamp(now));
    const content = `${newNoteContent({
      id: ulid(now.getTime()),
      title,
      type: 'inbox',
      today: isoDateInTimeZone(now, this.options.timeZone),
    })}${text.replace(/\s+$/, '')}\n`;
    const taken = new Set((await this.store.list()).map((entry) => collisionKey(entry.path)));
    const name = titleToFileName(title).replace(/\.md$/, '');
    for (let n = 1; n <= 50; n++) {
      const path = assertNotePath(`${INBOX_FOLDER}/${n === 1 ? name : `${name} ${n}`}.md`);
      if (taken.has(collisionKey(path))) continue;
      try {
        return await this.store.create(path, content, {
          message: commitMessage(`Captura rápida: ${path}`),
        });
      } catch (error) {
        if (!(error instanceof AlreadyExistsError)) throw error;
      }
    }
    throw new AlreadyExistsError('Muitas capturas com o mesmo título.');
  }

  /** Move a nota para `.trash/` num único commit (ADR-0007). Exige a versão que o usuário viu. */
  async trash(input: { path: string; expectedSha: string }): Promise<{ trashPath: string }> {
    const path = assertNotePath(input.path);
    const file = await this.store.read(path);
    if (file.sha !== input.expectedSha) throw new ConflictError(file.sha);
    const taken = new Set((await this.store.list()).map((entry) => collisionKey(entry.path)));
    let trashPath = `${TRASH_FOLDER}/${path}`;
    if (taken.has(collisionKey(trashPath))) {
      const stamp = this.stamp(this.now());
      for (let n = 1; ; n++) {
        trashPath = `${TRASH_FOLDER}/${path.replace(/\.md$/i, ` (excluída ${stamp}${n > 1 ? ` ${n}` : ''}).md`)}`;
        if (!taken.has(collisionKey(trashPath))) break;
      }
    }
    await this.store.commit(
      [
        { kind: 'delete', path, expectedSha: file.sha },
        { kind: 'put', path: trashPath, content: file.content, expectedSha: null },
      ],
      { message: commitMessage(`Move ${path} para a lixeira`) },
    );
    return { trashPath };
  }

  async listTrash(): Promise<TrashItem[]> {
    return (await this.store.list())
      .filter((entry) => entry.path.startsWith(`${TRASH_FOLDER}/`) && isMarkdownPath(entry.path))
      .map((entry) => ({
        path: entry.path,
        originalPath: entry.path.slice(TRASH_FOLDER.length + 1).replace(TRASH_SUFFIX, ''),
        sha: entry.sha,
        size: entry.size,
      }))
      .sort((a, b) => a.originalPath.localeCompare(b.originalPath, 'pt-BR'));
  }

  /** Devolve a nota ao lugar de origem; se o lugar estiver ocupado, restaura ao lado, sem sobrescrever. */
  async restore(trashPath: string): Promise<{ path: string }> {
    const item = (await this.listTrash()).find((entry) => entry.path === trashPath);
    if (!item) throw new NotFoundError('Esta nota não está mais na lixeira.');
    const file = await this.store.read(item.path);
    const taken = new Set((await this.store.list()).map((entry) => collisionKey(entry.path)));
    let target = assertNotePath(item.originalPath);
    if (taken.has(collisionKey(target))) {
      const stamp = this.stamp(this.now());
      for (let n = 1; ; n++) {
        target = target.replace(
          /( \(restaurada [^)]*\))?\.md$/i,
          ` (restaurada ${stamp}${n > 1 ? ` ${n}` : ''}).md`,
        );
        if (!taken.has(collisionKey(target))) break;
      }
    }
    await this.store.commit(
      [
        { kind: 'delete', path: item.path, expectedSha: file.sha },
        { kind: 'put', path: target, content: file.content, expectedSha: null },
      ],
      { message: commitMessage(`Restaura ${target} da lixeira`) },
    );
    return { path: target };
  }

  /** Remove da lixeira. No GitHub o conteúdo continua recuperável pelo histórico do Git. */
  async purge(input: { trashPath: string; expectedSha: string }): Promise<void> {
    if (!input.trashPath.startsWith(`${TRASH_FOLDER}/`) || !isMarkdownPath(input.trashPath)) {
      throw new NotFoundError('Só é possível excluir definitivamente itens da lixeira.');
    }
    await this.store.commit(
      [{ kind: 'delete', path: input.trashPath, expectedSha: input.expectedSha }],
      {
        message: commitMessage(`Exclui definitivamente ${input.trashPath}`),
      },
    );
  }

  async history(path: string): Promise<NoteHistory> {
    const key = assertNotePath(path);
    if (!this.store.supportsHistory) return { supported: false, commits: [] };
    const commits = await this.store.history(key, 30);
    return {
      supported: true,
      commits: commits.map((commit) => ({
        ...commit,
        message: commit.message.split('\n')[0] ?? '',
      })),
    };
  }

  async readVersion(path: string, commitSha: string): Promise<NoteDocument> {
    const file = await this.store.readAt(assertNotePath(path), commitSha);
    return { path: file.path, content: file.content, sha: file.sha };
  }

  /** Grava uma versão antiga como versão atual (novo commit — nada do histórico é apagado). */
  async restoreVersion(input: {
    path: string;
    commitSha: string;
    expectedSha: string;
  }): Promise<NoteDocument> {
    const old = await this.readVersion(input.path, input.commitSha);
    const result = await this.save({
      path: input.path,
      content: old.content,
      expectedSha: input.expectedSha,
      summary: `Restaura ${old.path} para a versão ${input.commitSha.slice(0, 7)}`,
    });
    return { path: result.path, content: old.content, sha: result.sha };
  }

  private stamp(date: Date): string {
    return conflictCopyPath('x.md', date, this.options.timeZone).replace(
      /^x \(conflito (.*)\)\.md$/,
      '$1',
    );
  }

  private async createUnique(path: string, content: string, summary: string): Promise<WriteResult> {
    // `Nota.md` e `nota.md` colidem em macOS/Windows: comparação sem caixa e em NFC.
    const key = collisionKey(path);
    const entries = await this.store.list();
    if (entries.some((entry) => collisionKey(entry.path) === key)) {
      throw new AlreadyExistsError(
        `Já existe uma nota com esse nome nesta pasta (${basename(path)}).`,
      );
    }
    return this.store.create(path, content, { message: commitMessage(summary) });
  }

  private assertSize(content: string) {
    if (encodeText(content).byteLength > MAX_NOTE_BYTES) {
      throw new TooLargeError('A nota passou de 1 MB. Divida o conteúdo em notas menores.');
    }
  }
}
