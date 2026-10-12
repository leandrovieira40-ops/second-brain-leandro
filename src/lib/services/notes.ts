import { encodeText } from '@/lib/vault/blob';
import { AlreadyExistsError, ConflictError, TooLargeError } from '@/lib/vault/errors';
import {
  assertFolderPath,
  assertNotePath,
  basename,
  collisionKey,
  dirname,
  isHiddenPath,
  isMarkdownPath,
} from '@/lib/vault/paths';
import type { VaultStore, WriteResult } from '@/lib/vault/types';
import { isoDateInTimeZone } from '@/lib/notes/dates';
import { conflictCopyPath, noteFilePath } from '@/lib/notes/filename';
import { ulid } from '@/lib/notes/ids';
import { newNoteContent } from '@/lib/notes/template';
import type { NoteType } from '@/lib/notes/types';

/** Tamanho máximo de uma nota editável (ADR-0008). */
export const MAX_NOTE_BYTES = 1024 * 1024;

export interface VaultTree {
  /** Caminhos de notas (`.md`) visíveis. */
  notes: string[];
  /** Pastas visíveis (inclusive vazias, mantidas por `.gitkeep`). */
  folders: string[];
  /** Demais arquivos visíveis (anexos) — usados para resolver `![[embeds]]`. */
  attachments: string[];
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
const commitMessage = (summary: string) => `${summary}\n\n${ORIGIN_TRAILER}`;

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
    for (const { path } of entries) {
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

  async save(input: { path: string; content: string; expectedSha: string }): Promise<SaveResult> {
    const path = assertNotePath(input.path);
    this.assertSize(input.content);
    try {
      const result = await this.store.update(path, input.content, {
        expectedSha: input.expectedSha,
        message: commitMessage(`Atualiza ${path}`),
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
