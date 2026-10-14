import { encodeText, gitBlobShaOfText } from '@/lib/vault/blob';
import {
  AlreadyExistsError,
  ConflictError,
  NotFoundError,
  TooLargeError,
  UnsupportedOperationError,
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
import type { BatchChange, CommitInfo, VaultStore, WriteResult } from '@/lib/vault/types';
import { captureTitle } from '@/lib/notes/capture';
import { isoDateInTimeZone } from '@/lib/notes/dates';
import { conflictCopyPath, noteFilePath, titleToFileName } from '@/lib/notes/filename';
import { applyChange, parseFrontmatter, scalarFieldChange } from '@/lib/notes/frontmatter';
import { ulid } from '@/lib/notes/ids';
import { parseNote } from '@/lib/notes/parse';
import {
  affectedSources,
  followsFileName,
  renameContext,
  rewriteLinksForRename,
} from '@/lib/notes/rename';
import { newNoteContent } from '@/lib/notes/template';
import { DEFAULT_FOLDER_BY_TYPE, INBOX_FOLDER, type NoteType } from '@/lib/notes/types';
import { FAVORITES_PATH, parseFavoritesFile, serializeFavoritesFile } from './favorites-file';

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
export { FAVORITES_PATH };
export const MAX_CAPTURE_CHARS = 20_000;
/** Limite de notas reescritas numa renomeação (um commit; acima disso, renomeie em etapas). */
export const MAX_RENAME_UPDATES = 200;
/** Sem índice, a renomeação lê o vault inteiro; no GitHub isso só é razoável em vaults pequenos. */
export const MAX_SCAN_NOTES_WITHOUT_INDEX = 400;
const READ_CONCURRENCY = 6;

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

/** Alteração confirmada no vault (conteúdo ausente = arquivo removido). */
export interface WrittenChange {
  path: string;
  content?: string;
  sha?: string;
}

/** Grafo de links do vault: quem aponta para quem (pelo texto do link) e os aliases das notas. */
export interface LinkGraph {
  links: { sourcePath: string; targetRaw: string }[];
  aliases: Map<string, string[]>;
}

export interface RenameResult {
  path: string;
  sha: string;
  /** Notas cujos `[[links]]` foram reescritos no mesmo commit. */
  updatedNotes: string[];
}

export interface NotesServiceOptions {
  timeZone: string;
  now?: () => Date;
  /** Chamado depois de cada gravação CONFIRMADA (ex.: atualizar o índice derivado). */
  onWrite?: (changes: WrittenChange[]) => void;
  /** Grafo de links do índice, sincronizado com o vault. Sem ele, o serviço lê as notas. */
  linkGraph?: () => Promise<LinkGraph>;
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
      this.written([{ path, content: input.content, sha: result.sha }]);
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

  /**
   * Captura rápida: nova nota no Inbox com o texto exato digitado (sem exigir classificação).
   * O título vem de `title`, se informado; senão, da primeira linha do texto.
   */
  async capture(text: string, title?: string): Promise<WriteResult> {
    if (!text.trim() && !title?.trim()) throw new TooLargeError('A captura está vazia.');
    if (text.length > MAX_CAPTURE_CHARS)
      throw new TooLargeError('Captura longa demais: crie uma nota.');
    const now = this.now();
    const noteTitle = captureTitle(title?.trim() ? title : text, this.stamp(now));
    const body = text.replace(/\s+$/, '');
    const content = `${newNoteContent({
      id: ulid(now.getTime()),
      title: noteTitle,
      type: 'inbox',
      today: isoDateInTimeZone(now, this.options.timeZone),
    })}${body ? `${body}\n` : ''}`;
    const taken = new Set((await this.store.list()).map((entry) => collisionKey(entry.path)));
    const name = titleToFileName(noteTitle).replace(/\.md$/, '');
    for (let n = 1; n <= 50; n++) {
      const path = assertNotePath(`${INBOX_FOLDER}/${n === 1 ? name : `${name} ${n}`}.md`);
      if (taken.has(collisionKey(path))) continue;
      try {
        const result = await this.store.create(path, content, {
          message: commitMessage(`Captura rápida: ${path}`),
        });
        this.written([{ path, content, sha: result.sha }]);
        return result;
      } catch (error) {
        if (!(error instanceof AlreadyExistsError)) throw error;
      }
    }
    throw new AlreadyExistsError('Muitas capturas com o mesmo título.');
  }

  /**
   * Nota de fonte criada a partir de um documento importado (ex.: PDF lido pela IA). O nome segue o
   * título; se já existir, ganha um número ("Livro 2.md"). Nunca sobrescreve.
   */
  async importSource(input: {
    title: string;
    body: string;
    author?: string;
    tags?: string[];
    sourceType: string;
  }): Promise<WriteResult> {
    const now = this.now();
    const title = input.title.trim();
    const content = newNoteContent({
      id: ulid(now.getTime()),
      title,
      type: 'source',
      today: isoDateInTimeZone(now, this.options.timeZone),
      tags: input.tags,
      fields: { author: input.author ?? '', source_type: input.sourceType },
      body: input.body,
    });
    this.assertSize(content);
    const folder = DEFAULT_FOLDER_BY_TYPE.source;
    const taken = new Set((await this.store.list()).map((entry) => collisionKey(entry.path)));
    const name = titleToFileName(title).replace(/\.md$/, '');
    for (let n = 1; n <= 50; n++) {
      const path = assertNotePath(`${folder}/${n === 1 ? name : `${name} ${n}`}.md`);
      if (taken.has(collisionKey(path))) continue;
      try {
        const result = await this.store.create(path, content, {
          message: commitMessage(`Importa fonte: ${path}`),
        });
        this.written([{ path, content, sha: result.sha }]);
        return result;
      } catch (error) {
        if (!(error instanceof AlreadyExistsError)) throw error;
      }
    }
    throw new AlreadyExistsError('Muitas notas com o mesmo título.');
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
    this.written([{ path }]);
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
    this.written([{ path: target, content: file.content, sha: gitBlobShaOfText(file.content) }]);
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

  /**
   * Renomeia e/ou move a nota num ÚNICO commit, reescrevendo os `[[links]]` que apontavam para ela
   * (e os que mudariam de destino por causa do nome novo). Exige a versão que o usuário viu; se outra
   * nota envolvida mudar no meio do caminho, o plano é refeito — nada é sobrescrito às cegas.
   */
  async rename(input: {
    path: string;
    expectedSha: string;
    title: string;
    folder: string;
  }): Promise<RenameResult> {
    const oldPath = assertNotePath(input.path);
    const folder = assertFolderPath(input.folder);
    const newPath = assertNotePath(noteFilePath(folder, input.title));
    for (let attempt = 0; ; attempt++) {
      try {
        return await this.renameOnce(oldPath, newPath, input);
      } catch (error) {
        if (!(error instanceof ConflictError) || attempt >= 2) throw error;
        // Conflito na própria nota é do usuário resolver; em outra nota envolvida, refaz o plano.
        const current = await this.store.read(oldPath);
        if (current.sha !== input.expectedSha) throw new ConflictError(current.sha);
      }
    }
  }

  private async renameOnce(
    oldPath: string,
    newPath: string,
    input: { expectedSha: string; title: string },
  ): Promise<RenameResult> {
    const file = await this.store.read(oldPath);
    if (file.sha !== input.expectedSha) throw new ConflictError(file.sha);
    if (newPath === oldPath) return { path: oldPath, sha: file.sha, updatedNotes: [] };

    const entries = await this.store.list();
    const key = collisionKey(newPath);
    if (entries.some((entry) => entry.path !== oldPath && collisionKey(entry.path) === key)) {
      throw new AlreadyExistsError(
        `Já existe uma nota com esse nome nessa pasta (${basename(newPath)}).`,
      );
    }
    const visible = entries
      .map((entry) => entry.path)
      .filter((path) => !isHiddenPath(path) && basename(path) !== '.gitkeep');
    const graph = await this.linkGraphFor(visible);
    const context = renameContext({ oldPath, newPath, paths: visible, aliases: graph.aliases });

    const sources = affectedSources(graph.links, context);
    if (sources.length > MAX_RENAME_UPDATES) {
      throw new TooLargeError(
        `A renomeação mudaria links em ${sources.length} notas (limite ${MAX_RENAME_UPDATES}).`,
      );
    }
    const updates: { path: string; content: string; expectedSha: string }[] = [];
    for (const file of await this.readMany(sources)) {
      const result = rewriteLinksForRename(file.content, file.path, file.path, context);
      if (result.changed > 0) {
        this.assertSize(result.content);
        updates.push({ path: file.path, content: result.content, expectedSha: file.sha });
      }
    }

    let moved = rewriteLinksForRename(file.content, oldPath, newPath, context).content;
    const title = parseFrontmatter(moved).data?.title;
    if (
      basename(oldPath) !== basename(newPath) &&
      followsFileName(title, oldPath, titleToFileName)
    ) {
      moved = applyChange(moved, scalarFieldChange(moved, 'title', input.title.trim(), 'yaml'));
    }

    const changes: BatchChange[] = [
      { kind: 'delete', path: oldPath, expectedSha: file.sha },
      { kind: 'put', path: newPath, content: moved, expectedSha: null },
      ...updates.map((update) => ({ kind: 'put' as const, ...update })),
    ];
    const favorites = await this.renamedFavorites(oldPath, newPath);
    if (favorites) changes.push(favorites);

    const verb = dirname(oldPath) === dirname(newPath) ? 'Renomeia' : 'Move';
    const linksNote = updates.length
      ? ` e atualiza links em ${updates.length} nota${updates.length > 1 ? 's' : ''}`
      : '';
    await this.store.commit(changes, {
      message: commitMessage(`${verb} ${oldPath} para ${newPath}${linksNote}`),
    });
    const sha = gitBlobShaOfText(moved);
    this.written([
      { path: oldPath },
      { path: newPath, content: moved, sha },
      ...updates.map((update) => ({
        path: update.path,
        content: update.content,
        sha: gitBlobShaOfText(update.content),
      })),
    ]);
    return { path: newPath, sha, updatedNotes: updates.map((update) => update.path) };
  }

  /** Grafo do índice; sem índice (ou com ele fora do ar), lê as notas do vault. */
  private async linkGraphFor(visible: string[]): Promise<LinkGraph> {
    if (this.options.linkGraph) {
      try {
        return await this.options.linkGraph();
      } catch {
        // O índice é só um atalho: cai para a leitura direta abaixo.
      }
    }
    const notes = visible.filter(isMarkdownPath);
    if (this.store.kind === 'github' && notes.length > MAX_SCAN_NOTES_WITHOUT_INDEX) {
      throw new UnsupportedOperationError(
        'Para renomear com atualização de links num vault deste tamanho, configure o índice (DATABASE_URL).',
      );
    }
    const graph: LinkGraph = { links: [], aliases: new Map() };
    for (const file of await this.readMany(notes)) {
      const parsed = parseNote(file.path, file.content);
      if (parsed.aliases.length) graph.aliases.set(file.path, parsed.aliases);
      for (const link of parsed.links) {
        graph.links.push({ sourcePath: file.path, targetRaw: link.target });
      }
    }
    return graph;
  }

  private async readMany(paths: readonly string[]) {
    const files = [];
    for (let i = 0; i < paths.length; i += READ_CONCURRENCY) {
      const batch = paths.slice(i, i + READ_CONCURRENCY);
      const read = await Promise.all(
        batch.map((path) =>
          this.store.read(path).catch((error: unknown) => {
            if (error instanceof NotFoundError) return null; // sumiu desde a listagem
            throw error;
          }),
        ),
      );
      for (const file of read) if (file) files.push(file);
    }
    return files;
  }

  /** Favoritos acompanham a nota (só se o arquivo estiver no formato esperado). */
  private async renamedFavorites(oldPath: string, newPath: string): Promise<BatchChange | null> {
    let file;
    try {
      file = await this.store.read(FAVORITES_PATH);
    } catch (error) {
      if (error instanceof NotFoundError) return null;
      throw error;
    }
    const notes = parseFavoritesFile(file.content);
    if (!notes?.includes(oldPath)) return null;
    const next = [...new Set(notes.map((path) => (path === oldPath ? newPath : path)))];
    return {
      kind: 'put',
      path: FAVORITES_PATH,
      content: serializeFavoritesFile(next),
      expectedSha: file.sha,
    };
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
    const result = await this.store.create(path, content, { message: commitMessage(summary) });
    this.written([{ path, content, sha: result.sha }]);
    return result;
  }

  private written(changes: WrittenChange[]): void {
    try {
      this.options.onWrite?.(changes);
    } catch {
      // O índice é derivado: uma falha aqui nunca desfaz nem esconde a gravação confirmada.
    }
  }

  private assertSize(content: string) {
    if (encodeText(content).byteLength > MAX_NOTE_BYTES) {
      throw new TooLargeError('A nota passou de 1 MB. Divida o conteúdo em notas menores.');
    }
  }
}
