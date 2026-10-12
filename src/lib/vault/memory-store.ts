import { decodeText, encodeText, gitBlobSha } from './blob';
import { AlreadyExistsError, ConflictError, NotFoundError } from './errors';
import { normalizeVaultPath } from './paths';
import type { UpdateOptions, VaultEntry, VaultFile, VaultStore, WriteOptions, WriteResult } from './types';

/** Adaptador em memória para testes. Mesma semântica de versão (SHA de blob) dos demais. */
export class MemoryVaultStore implements VaultStore {
  readonly kind = 'memory' as const;
  readonly description = 'memory';
  private readonly files = new Map<string, Uint8Array>();
  readonly commits: { path: string; message: string }[] = [];

  constructor(initial: Record<string, string> = {}) {
    for (const [path, content] of Object.entries(initial)) {
      this.files.set(normalizeVaultPath(path), encodeText(content));
    }
  }

  async list(): Promise<VaultEntry[]> {
    return [...this.files.entries()]
      .map(([path, bytes]) => ({ path, sha: gitBlobSha(bytes), size: bytes.byteLength }))
      .sort((a, b) => a.path.localeCompare(b.path));
  }

  async read(path: string): Promise<VaultFile> {
    const key = normalizeVaultPath(path);
    const bytes = this.files.get(key);
    if (!bytes) throw new NotFoundError();
    return { path: key, content: decodeText(bytes), sha: gitBlobSha(bytes), size: bytes.byteLength };
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

  /** Simula uma alteração feita fora da aplicação (ex.: push do Obsidian). */
  writeExternal(path: string, content: string): void {
    this.files.set(normalizeVaultPath(path), encodeText(content));
  }

  private write(path: string, content: string, message: string): WriteResult {
    const bytes = encodeText(content);
    this.files.set(path, bytes);
    this.commits.push({ path, message });
    return { path, sha: gitBlobSha(bytes), commitSha: `memory-${this.commits.length}` };
  }
}
