import { createHash } from 'node:crypto';
import { eq, inArray, sql } from 'drizzle-orm';
import type { Database } from '@/lib/db/connect';
import { attachments, links, notes, syncState } from '@/lib/db/schema';
import { LinkResolver } from '@/lib/notes/resolve';
import { basename, isHiddenPath, isMarkdownPath } from '@/lib/vault/paths';
import type { VaultStore } from '@/lib/vault/types';
import { toNoteRecord, type NoteRecord } from './record';

/** Chave do advisory lock: serializa sincronizações e atualizações do índice. */
const LOCK_KEY = 0x5b_1e_ad;
const READ_CONCURRENCY = 6;

type Tx = Parameters<Parameters<Database['transaction']>[0]>[0];

export interface SyncResult {
  added: number;
  updated: number;
  removed: number;
  total: number;
}

export interface KnownChange {
  path: string;
  /** Conteúdo e SHA gravados (ausentes = arquivo removido). */
  content?: string;
  sha?: string;
}

export interface IndexStatus {
  noteCount: number;
  indexedAt: string | null;
  lastError: string | null;
}

/**
 * Índice derivado (ADR-0013). `sync()` compara o vault com o índice por SHA e lê só o que mudou;
 * `apply()` registra o que a própria aplicação acabou de gravar, sem reler o vault.
 */
export class NoteIndex {
  constructor(
    private readonly db: Database,
    private readonly store: VaultStore,
  ) {}

  async sync(): Promise<SyncResult> {
    return this.db.transaction(async (tx) => {
      await tx.execute(sql`select pg_advisory_xact_lock(${LOCK_KEY})`);
      const entries = (await this.store.list()).filter(
        (entry) => !isHiddenPath(entry.path) && basename(entry.path) !== '.gitkeep',
      );
      const noteEntries = entries.filter((entry) => isMarkdownPath(entry.path));
      const assetEntries = entries.filter((entry) => !isMarkdownPath(entry.path));

      const indexed = new Map(
        (await tx.select({ path: notes.path, sha: notes.blobSha }).from(notes)).map((row) => [
          row.path,
          row.sha,
        ]),
      );
      const changed = noteEntries.filter((entry) => indexed.get(entry.path) !== entry.sha);
      const present = new Set(noteEntries.map((entry) => entry.path));
      const removed = [...indexed.keys()].filter((path) => !present.has(path));

      // Lê só o que mudou, com concorrência limitada (limites da API do GitHub).
      const records: NoteRecord[] = [];
      for (let i = 0; i < changed.length; i += READ_CONCURRENCY) {
        const batch = changed.slice(i, i + READ_CONCURRENCY);
        const files = await Promise.all(batch.map((entry) => this.store.read(entry.path)));
        for (const file of files) records.push(toNoteRecord(file.path, file.sha, file.content));
      }

      if (removed.length) await tx.delete(notes).where(inArray(notes.path, removed));
      await this.writeRecords(tx, records);
      await tx.delete(attachments);
      if (assetEntries.length) {
        await tx
          .insert(attachments)
          .values(assetEntries.map((entry) => ({ path: entry.path, blobSha: entry.sha })));
      }
      if (records.length || removed.length) await this.resolveLinks(tx, null);
      await this.writeState(tx, fingerprint(entries));

      const added = changed.filter((entry) => !indexed.has(entry.path)).length;
      return {
        added,
        updated: changed.length - added,
        removed: removed.length,
        total: noteEntries.length,
      };
    });
  }

  /** Atualiza o índice com gravações feitas pela aplicação (conteúdo já conhecido). */
  async apply(changes: readonly KnownChange[]): Promise<void> {
    // `.trash/`, `.second-brain/` e anexos não entram no índice de notas.
    const markdown = changes.filter(
      (change) => isMarkdownPath(change.path) && !isHiddenPath(change.path),
    );
    if (markdown.length === 0) return;
    await this.db.transaction(async (tx) => {
      await tx.execute(sql`select pg_advisory_xact_lock(${LOCK_KEY})`);
      const removed = markdown
        .filter((change) => change.content === undefined)
        .map((change) => change.path);
      const records = markdown
        .filter((change) => change.content !== undefined && change.sha)
        .map((change) => toNoteRecord(change.path, change.sha!, change.content!));
      const before = await this.pathSetSignature(tx);
      if (removed.length) await tx.delete(notes).where(inArray(notes.path, removed));
      await this.writeRecords(tx, records);
      // Se o conjunto de nomes/aliases mudou, links de OUTRAS notas podem ter passado a resolver (ou quebrar).
      const after = await this.pathSetSignature(tx);
      await this.resolveLinks(tx, before === after ? records.map((record) => record.path) : null);
      await tx
        .insert(syncState)
        .values({ id: 1, indexedAt: new Date() })
        .onConflictDoUpdate({
          target: syncState.id,
          set: { indexedAt: new Date(), lastError: null },
        });
    });
  }

  /** Grafo de links para renomear: sincroniza antes, para não perder links feitos fora da aplicação. */
  async linkGraph(): Promise<{
    links: { sourcePath: string; targetRaw: string }[];
    aliases: Map<string, string[]>;
  }> {
    await this.sync();
    const linkRows = await this.db
      .select({ sourcePath: links.sourcePath, targetRaw: links.targetRaw })
      .from(links);
    const noteRows = await this.db.select({ path: notes.path, aliases: notes.aliases }).from(notes);
    return {
      links: linkRows,
      aliases: new Map(
        noteRows.filter((row) => row.aliases.length).map((row) => [row.path, row.aliases]),
      ),
    };
  }

  async status(): Promise<IndexStatus> {
    const [state] = await this.db.select().from(syncState).where(eq(syncState.id, 1));
    const [count] = await this.db.select({ value: sql<number>`count(*)::int` }).from(notes);
    return {
      noteCount: count?.value ?? 0,
      indexedAt: state?.indexedAt ? state.indexedAt.toISOString() : null,
      lastError: state?.lastError ?? null,
    };
  }

  async recordError(message: string): Promise<void> {
    await this.db
      .insert(syncState)
      .values({ id: 1, lastError: message })
      .onConflictDoUpdate({ target: syncState.id, set: { lastError: message } });
  }

  private async writeRecords(tx: Tx, records: NoteRecord[]): Promise<void> {
    if (records.length === 0) return;
    const paths = records.map((record) => record.path);
    await tx.delete(links).where(inArray(links.sourcePath, paths));
    for (const record of records) {
      const values = {
        path: record.path,
        blobSha: record.blobSha,
        title: record.title,
        type: record.type,
        noteId: record.noteId,
        tags: record.tags,
        aliases: record.aliases,
        keywords: record.keywords,
        frontmatter: record.frontmatter,
        body: record.body,
        indexedAt: new Date(),
      };
      await tx.insert(notes).values(values).onConflictDoUpdate({ target: notes.path, set: values });
    }
    const rows = records.flatMap((record) =>
      record.links.map((link) => ({ ...link, sourcePath: record.path, targetPath: null })),
    );
    for (let i = 0; i < rows.length; i += 500)
      await tx.insert(links).values(rows.slice(i, i + 500));
  }

  /** Resolve links com as mesmas regras da interface (`null` = todos os links do índice). */
  private async resolveLinks(tx: Tx, onlySources: string[] | null): Promise<void> {
    const noteRows = await tx.select({ path: notes.path, aliases: notes.aliases }).from(notes);
    const assetRows = await tx.select({ path: attachments.path }).from(attachments);
    const resolver = new LinkResolver(
      [...noteRows.map((row) => row.path), ...assetRows.map((row) => row.path)],
      new Map(noteRows.map((row) => [row.path, row.aliases])),
    );
    const query = tx
      .select({
        id: links.id,
        sourcePath: links.sourcePath,
        targetRaw: links.targetRaw,
        targetPath: links.targetPath,
      })
      .from(links);
    const rows = onlySources
      ? onlySources.length
        ? await query.where(inArray(links.sourcePath, onlySources))
        : []
      : await query;
    for (const row of rows) {
      const target = resolver.resolve(row.targetRaw, row.sourcePath).path;
      if (target !== row.targetPath)
        await tx.update(links).set({ targetPath: target }).where(eq(links.id, row.id));
    }
  }

  private async pathSetSignature(tx: Tx): Promise<string> {
    const rows = await tx
      .select({ path: notes.path, aliases: notes.aliases })
      .from(notes)
      .orderBy(notes.path);
    return createHash('sha1')
      .update(rows.map((row) => `${row.path}|${row.aliases.join('\u0001')}`).join('\n'))
      .digest('hex');
  }

  private async writeState(tx: Tx, print: string): Promise<void> {
    const [count] = await tx.select({ value: sql<number>`count(*)::int` }).from(notes);
    const values = {
      fingerprint: print,
      noteCount: count?.value ?? 0,
      indexedAt: new Date(),
      lastError: null,
    };
    await tx
      .insert(syncState)
      .values({ id: 1, ...values })
      .onConflictDoUpdate({ target: syncState.id, set: values });
  }
}

function fingerprint(entries: { path: string; sha: string }[]): string {
  return createHash('sha1')
    .update(
      entries
        .map((entry) => `${entry.path}:${entry.sha}`)
        .sort()
        .join('\n'),
    )
    .digest('hex');
}
