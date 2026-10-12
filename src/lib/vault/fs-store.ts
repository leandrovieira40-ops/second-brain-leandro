import { randomBytes } from 'node:crypto';
import { constants, promises as fs } from 'node:fs';
import nodePath from 'node:path';
import { decodeText, encodeText, gitBlobSha } from './blob';
import {
  AlreadyExistsError,
  ConflictError,
  NotFoundError,
  TooLargeError,
  UnsupportedContentError,
  VaultConfigError,
} from './errors';
import { normalizeVaultPath } from './paths';
import type { UpdateOptions, VaultEntry, VaultFile, VaultStore, WriteOptions, WriteResult } from './types';

const MAX_READ_BYTES = 5 * 1024 * 1024;

/**
 * Adaptador para uma pasta local (desenvolvimento, testes E2E, uso local junto do Obsidian).
 * Não faz commits: o versionamento continua sendo responsabilidade do Git do usuário (ADR-0007).
 */
export class FsVaultStore implements VaultStore {
  readonly kind = 'fs' as const;
  readonly description: string;
  private readonly root: string;
  private realRoot: string | null = null;
  private readonly locks = new Map<string, Promise<unknown>>();

  constructor(root: string, env: Record<string, string | undefined> = process.env) {
    if (env.VERCEL) {
      throw new VaultConfigError(
        'O vault em pasta local não funciona na Vercel (sistema de arquivos efêmero). Use VAULT_STORE=github.',
      );
    }
    if (!nodePath.isAbsolute(root)) throw new VaultConfigError('VAULT_FS_ROOT deve ser um caminho absoluto.');
    this.root = nodePath.resolve(root);
    this.description = 'fs';
  }

  async list(): Promise<VaultEntry[]> {
    const root = await this.getRealRoot();
    const entries: VaultEntry[] = [];
    const walk = async (dir: string, prefix: string) => {
      const items = await fs.readdir(dir, { withFileTypes: true });
      for (const item of items) {
        if (item.isSymbolicLink()) continue; // nunca segue links simbólicos
        if (item.isDirectory()) {
          if (prefix === '' && item.name === '.git') continue;
          await walk(nodePath.join(dir, item.name), `${prefix}${item.name}/`);
        } else if (item.isFile()) {
          const full = nodePath.join(dir, item.name);
          const bytes = await fs.readFile(full);
          entries.push({ path: `${prefix}${item.name}`, sha: gitBlobSha(bytes), size: bytes.byteLength });
        }
      }
    };
    await walk(root, '');
    return entries.sort((a, b) => a.path.localeCompare(b.path));
  }

  async read(path: string): Promise<VaultFile> {
    const { relative, absolute } = await this.resolve(path);
    const bytes = await this.readBytes(absolute);
    if (!bytes) throw new NotFoundError();
    return { path: relative, content: decodeText(bytes), sha: gitBlobSha(bytes), size: bytes.byteLength };
  }

  async create(path: string, content: string, _options: WriteOptions): Promise<WriteResult> {
    const { relative, absolute } = await this.resolve(path);
    return this.withLock(absolute, async () => {
      await fs.mkdir(nodePath.dirname(absolute), { recursive: true });
      await this.assertInsideRoot(nodePath.dirname(absolute));
      const bytes = encodeText(content);
      try {
        await fs.writeFile(absolute, bytes, { flag: 'wx' });
      } catch (error) {
        if (isErrno(error, 'EEXIST')) throw new AlreadyExistsError();
        throw error;
      }
      return { path: relative, sha: gitBlobSha(bytes), commitSha: null };
    });
  }

  async update(path: string, content: string, { expectedSha }: UpdateOptions): Promise<WriteResult> {
    const { relative, absolute } = await this.resolve(path);
    return this.withLock(absolute, async () => {
      const current = await this.readBytes(absolute);
      if (!current) throw new NotFoundError();
      const currentSha = gitBlobSha(current);
      if (currentSha !== expectedSha) throw new ConflictError(currentSha);

      // Escrita atômica: arquivo temporário na mesma pasta + rename.
      const bytes = encodeText(content);
      const temp = nodePath.join(
        nodePath.dirname(absolute),
        `.${nodePath.basename(absolute)}.${randomBytes(6).toString('hex')}.tmp`,
      );
      try {
        await fs.writeFile(temp, bytes, { flag: 'wx' });
        await fs.rename(temp, absolute);
      } catch (error) {
        await fs.rm(temp, { force: true });
        throw error;
      }
      return { path: relative, sha: gitBlobSha(bytes), commitSha: null };
    });
  }

  private async getRealRoot(): Promise<string> {
    if (this.realRoot) return this.realRoot;
    try {
      const real = await fs.realpath(this.root);
      const stat = await fs.stat(real);
      if (!stat.isDirectory()) throw new Error('not a directory');
      await fs.access(real, constants.R_OK | constants.W_OK);
      this.realRoot = real;
      return real;
    } catch {
      throw new VaultConfigError('VAULT_FS_ROOT não existe ou não pode ser lido e gravado.');
    }
  }

  /** Valida o caminho e garante que ele (e o ancestral existente mais próximo) está dentro da raiz. */
  private async resolve(path: string): Promise<{ relative: string; absolute: string }> {
    const relative = normalizeVaultPath(path);
    const root = await this.getRealRoot();
    const absolute = nodePath.join(root, ...relative.split('/'));
    if (!isInside(root, absolute)) throw new NotFoundError();
    await this.assertInsideRoot(absolute);
    return { relative, absolute };
  }

  private async assertInsideRoot(target: string): Promise<void> {
    const root = await this.getRealRoot();
    let current = target;
    // Sobe até o primeiro ancestral existente e confere o caminho real (resolve links simbólicos).
    for (;;) {
      try {
        const real = await fs.realpath(current);
        if (!isInside(root, real) && real !== root) throw new NotFoundError();
        return;
      } catch (error) {
        if (error instanceof NotFoundError) throw error;
        if (!isErrno(error, 'ENOENT')) throw error;
        const parent = nodePath.dirname(current);
        if (parent === current) throw new NotFoundError();
        current = parent;
      }
    }
  }

  private async readBytes(absolute: string): Promise<Buffer | null> {
    try {
      const stat = await fs.lstat(absolute);
      if (stat.isSymbolicLink() || !stat.isFile()) throw new UnsupportedContentError('Não é um arquivo comum.');
      if (stat.size > MAX_READ_BYTES) throw new TooLargeError();
      return await fs.readFile(absolute);
    } catch (error) {
      if (isErrno(error, 'ENOENT') || isErrno(error, 'ENOTDIR')) return null;
      throw error;
    }
  }

  /** Serializa operações no mesmo arquivo dentro deste processo. */
  private async withLock<T>(key: string, task: () => Promise<T>): Promise<T> {
    const previous = this.locks.get(key) ?? Promise.resolve();
    const run = previous.then(task, task);
    const settled = run.catch(() => undefined);
    this.locks.set(key, settled);
    try {
      return await run;
    } finally {
      if (this.locks.get(key) === settled) this.locks.delete(key);
    }
  }
}

function isInside(root: string, target: string): boolean {
  const relative = nodePath.relative(root, target);
  return relative !== '' && !relative.startsWith('..') && !nodePath.isAbsolute(relative);
}

function isErrno(error: unknown, code: string): boolean {
  return typeof error === 'object' && error !== null && (error as { code?: unknown }).code === code;
}
