import { createHash } from 'node:crypto';
import { assertPrecondition, normalizeBatch } from './batch';
import { decodeText, encodeText, gitBlobSha } from './blob';
import { AlreadyExistsError, ConflictError, NotFoundError } from './errors';
import { normalizeVaultPath } from './paths';
import type {
  BatchChange,
  BatchResult,
  CommitInfo,
  UpdateOptions,
  VaultEntry,
  VaultFile,
  VaultStore,
  WriteOptions,
  WriteResult,
} from './types';

interface Snapshot {
  sha: string;
  message: string;
  date: string;
  files: Map<string, Uint8Array>;
}

/** Adaptador em memória para testes. Mesma semântica de versão (SHA de blob) e histórico. */
export class MemoryVaultStore implements VaultStore {
  readonly kind = 'memory' as const;
  readonly description = 'memory';
  readonly supportsHistory = true;
  private files = new Map<string, Uint8Array>();
  private readonly snapshots: Snapshot[] = [];
  /** Commits feitos pela aplicação (não inclui o estado inicial nem alterações externas). */
  readonly commits: { path: string; message: string }[] = [];

  constructor(
    initial: Record<string, string> = {},
    private readonly now: () => Date = () => new Date(),
  ) {
    for (const [path, content] of Object.entries(initial)) {
      this.files.set(normalizeVaultPath(path), encodeText(content));
    }
    if (this.files.size > 0) this.snapshot('Estado inicial');
  }

  async list(): Promise<VaultEntry[]> {
    return [...this.files.entries()]
      .map(([path, bytes]) => ({ path, sha: gitBlobSha(bytes), size: bytes.byteLength }))
      .sort((a, b) => a.path.localeCompare(b.path));
  }

  async read(path: string): Promise<VaultFile> {
    return toFile(normalizeVaultPath(path), this.files);
  }

  async create(path: string, content: string, { message }: WriteOptions): Promise<WriteResult> {
    const key = normalizeVaultPath(path);
    if (this.files.has(key)) throw new AlreadyExistsError();
    return this.write(key, content, message);
  }

  async update(path: string, content: string, options: UpdateOptions): Promise<WriteResult> {
    const key = normalizeVaultPath(path);
    const current = this.files.get(key);
    if (!current) throw new NotFoundError();
    const currentSha = gitBlobSha(current);
    if (currentSha !== options.expectedSha) throw new ConflictError(currentSha);
    return this.write(key, content, options.message);
  }

  async commit(changes: readonly BatchChange[], { message }: WriteOptions): Promise<BatchResult> {
    const batch = normalizeBatch(changes);
    for (const change of batch) {
      const current = this.files.get(change.path);
      assertPrecondition(change, current ? gitBlobSha(current) : null);
    }
    const next = new Map(this.files);
    for (const change of batch) {
      if (change.kind === 'delete') next.delete(change.path);
      else next.set(change.path, encodeText(change.content));
    }
    this.files = next;
    this.commits.push({ path: batch.map((c) => c.path).join(', '), message });
    return { commitSha: this.snapshot(message) };
  }

  async history(path: string, limit = 30): Promise<CommitInfo[]> {
    const key = normalizeVaultPath(path);
    const result: CommitInfo[] = [];
    for (let i = this.snapshots.length - 1; i >= 0 && result.length < limit; i--) {
      const current = this.snapshots[i]!;
      const before = this.snapshots[i - 1]?.files.get(key);
      const after = current.files.get(key);
      const changed = (before ? gitBlobSha(before) : null) !== (after ? gitBlobSha(after) : null);
      if (changed)
        result.push({
          sha: current.sha,
          message: current.message,
          date: current.date,
          author: null,
        });
    }
    return result;
  }

  async readAt(path: string, commitSha: string): Promise<VaultFile> {
    const snapshot = this.snapshots.find((s) => s.sha === commitSha);
    if (!snapshot) throw new NotFoundError('Versão não encontrada.');
    return toFile(normalizeVaultPath(path), snapshot.files);
  }

  /** Simula uma alteração feita fora da aplicação (ex.: push do Obsidian). */
  writeExternal(path: string, content: string): void {
    this.files = new Map(this.files).set(normalizeVaultPath(path), encodeText(content));
    this.snapshot('Alteração externa');
  }

  private write(path: string, content: string, message: string): WriteResult {
    const bytes = encodeText(content);
    this.files = new Map(this.files).set(path, bytes);
    this.commits.push({ path, message });
    return { path, sha: gitBlobSha(bytes), commitSha: this.snapshot(message) };
  }

  private snapshot(message: string): string {
    const sha = createHash('sha1')
      .update(`memory-commit-${this.snapshots.length}-${message}`)
      .digest('hex');
    this.snapshots.push({ sha, message, date: this.now().toISOString(), files: this.files });
    return sha;
  }
}

function toFile(path: string, files: Map<string, Uint8Array>): VaultFile {
  const bytes = files.get(path);
  if (!bytes) throw new NotFoundError();
  return { path, content: decodeText(bytes), sha: gitBlobSha(bytes), size: bytes.byteLength };
}
