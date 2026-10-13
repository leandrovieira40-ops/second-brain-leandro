import { assertPrecondition, normalizeBatch } from './batch';
import { decodeText, encodeText, gitBlobSha } from './blob';
import {
  AlreadyExistsError,
  ConflictError,
  NotFoundError,
  TooLargeError,
  UnsupportedContentError,
  VaultConfigError,
  type VaultError,
  VaultRateLimitedError,
  VaultUnavailableError,
} from './errors';
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

export interface GitHubVaultStoreOptions {
  owner: string;
  repo: string;
  branch: string;
  token: string;
  /** Injetável para testes (GitHub falso) — padrão: `fetch` global. */
  fetch?: typeof fetch;
  apiBaseUrl?: string;
  timeoutMs?: number;
  /** Espera entre tentativas de leitura (ms). Testes usam 0. */
  retryDelaysMs?: number[];
}

const MAX_READ_BYTES = 5 * 1024 * 1024;

interface TreeResponse {
  truncated: boolean;
  tree: { path: string; type: string; sha: string; size?: number }[];
}

interface ContentResponse {
  type: string;
  sha: string;
  size: number;
  encoding?: string;
  content?: string;
}

interface WriteResponse {
  content: { sha: string; path: string };
  commit: { sha: string };
}

/**
 * Adaptador de produção: lê e grava o vault pela API REST do GitHub, sem clonar o repositório.
 * Toda atualização envia o SHA esperado — o próprio GitHub recusa gravações sobre versões
 * desatualizadas (ADR-0004). Respostas do GitHub nunca são repassadas ao chamador.
 */
export class GitHubVaultStore implements VaultStore {
  readonly kind = 'github' as const;
  readonly description: string;
  readonly supportsHistory = true;
  private readonly fetchImpl: typeof fetch;
  private readonly base: string;
  private readonly timeoutMs: number;
  private readonly retryDelaysMs: number[];

  constructor(private readonly options: GitHubVaultStoreOptions) {
    for (const key of ['owner', 'repo', 'branch', 'token'] as const) {
      if (!options[key]) throw new VaultConfigError(`Configuração do GitHub incompleta: ${key}.`);
    }
    this.fetchImpl = options.fetch ?? fetch;
    this.base = `${options.apiBaseUrl ?? 'https://api.github.com'}/repos/${encodeURIComponent(
      options.owner,
    )}/${encodeURIComponent(options.repo)}`;
    this.timeoutMs = options.timeoutMs ?? 15_000;
    this.retryDelaysMs = options.retryDelaysMs ?? [300, 1_000];
    this.description = `github:${options.owner}/${options.repo}@${options.branch}`;
  }

  async list(): Promise<VaultEntry[]> {
    const response = await this.request(
      'GET',
      `/git/trees/${encodeURIComponent(this.options.branch)}?recursive=1`,
    );
    if (response.status === 409) return []; // repositório vazio (sem commits)
    if (response.status === 404) {
      throw new VaultConfigError(
        'Repositório ou branch do vault não encontrado (ou o token não tem acesso).',
      );
    }
    const body = await this.json<TreeResponse>(response, 200);
    if (body.truncated) {
      throw new TooLargeError(
        'O vault tem arquivos demais para listar de uma vez (limite da API do GitHub).',
      );
    }
    return body.tree
      .filter((item) => item.type === 'blob')
      .map((item) => ({ path: item.path, sha: item.sha, size: item.size ?? 0 }))
      .sort((a, b) => a.path.localeCompare(b.path));
  }

  async read(path: string): Promise<VaultFile> {
    return this.readRef(normalizeVaultPath(path), this.options.branch);
  }

  async readAt(path: string, commitSha: string): Promise<VaultFile> {
    if (!/^[0-9a-f]{40}$/.test(commitSha)) throw new NotFoundError('Versão inválida.');
    return this.readRef(normalizeVaultPath(path), commitSha);
  }

  async history(path: string, limit = 30): Promise<CommitInfo[]> {
    const key = normalizeVaultPath(path);
    const query = new URLSearchParams({
      path: key,
      sha: this.options.branch,
      per_page: String(limit),
    });
    const response = await this.request('GET', `/commits?${query}`);
    if (response.status === 409) return []; // repositório vazio
    const body = await this.json<
      { sha: string; commit: { message: string; author?: { name?: string; date?: string } } }[]
    >(response, 200);
    return body.map((item) => ({
      sha: item.sha,
      message: item.commit.message,
      date: item.commit.author?.date ?? '',
      author: item.commit.author?.name ?? null,
    }));
  }

  /**
   * Commit atômico de várias alterações (Git Data API): árvore nova sobre a atual, commit com o head
   * como pai e avanço do branch SEM force. Se o branch andou no meio do caminho, as pré-condições
   * são reavaliadas sobre o novo head — um conflito real vira erro, nunca sobrescrita.
   */
  async commit(changes: readonly BatchChange[], { message }: WriteOptions): Promise<BatchResult> {
    const batch = normalizeBatch(changes);
    for (let attempt = 0; attempt < 3; attempt++) {
      const head = await this.headCommit();
      const current = await this.treeShas(head.treeSha);
      for (const change of batch) assertPrecondition(change, current.get(change.path) ?? null);

      const tree = await this.post<{ sha: string }>('/git/trees', {
        base_tree: head.treeSha,
        tree: batch.map((change) =>
          change.kind === 'put'
            ? { path: change.path, mode: '100644', type: 'blob', content: change.content }
            : { path: change.path, mode: '100644', type: 'blob', sha: null },
        ),
      });
      const commit = await this.post<{ sha: string }>('/git/commits', {
        message,
        tree: tree.sha,
        parents: [head.commitSha],
      });
      const response = await this.request(
        'PATCH',
        `/git/refs/heads/${encodePath(this.options.branch)}`,
        { sha: commit.sha, force: false },
      );
      if (response.status === 200) return { commitSha: commit.sha };
      if (response.status !== 422 && response.status !== 409) throw await this.unexpected(response);
      await response.body?.cancel(); // branch andou: tenta de novo sobre o head atual
    }
    throw new VaultUnavailableError(
      'O vault mudou várias vezes durante a gravação. Tente de novo.',
    );
  }

  private async headCommit(): Promise<{ commitSha: string; treeSha: string }> {
    const ref = await this.request('GET', `/git/ref/heads/${encodePath(this.options.branch)}`);
    if (ref.status === 404 || ref.status === 409) {
      throw new VaultConfigError(
        'O vault ainda não tem commits (ou o branch não existe). Crie uma nota primeiro.',
      );
    }
    const { object } = await this.json<{ object: { sha: string } }>(ref, 200);
    const commit = await this.request('GET', `/git/commits/${object.sha}`);
    const body = await this.json<{ tree: { sha: string } }>(commit, 200);
    return { commitSha: object.sha, treeSha: body.tree.sha };
  }

  private async treeShas(treeSha: string): Promise<Map<string, string>> {
    const response = await this.request('GET', `/git/trees/${treeSha}?recursive=1`);
    const body = await this.json<TreeResponse>(response, 200);
    if (body.truncated) throw new TooLargeError('O vault tem arquivos demais para esta operação.');
    return new Map(
      body.tree.filter((item) => item.type === 'blob').map((item) => [item.path, item.sha]),
    );
  }

  private async post<T>(path: string, body: unknown): Promise<T> {
    const response = await this.request('POST', path, body);
    return this.json<T>(response, 201);
  }

  private async readRef(key: string, ref: string): Promise<VaultFile> {
    const response = await this.request(
      'GET',
      `/contents/${encodePath(key)}?ref=${encodeURIComponent(ref)}`,
    );
    if (response.status === 404) throw new NotFoundError();
    const body = await this.json<ContentResponse | ContentResponse[]>(response, 200);
    if (Array.isArray(body)) throw new NotFoundError('O caminho é uma pasta, não um arquivo.');
    if (body.type !== 'file') throw new UnsupportedContentError('Não é um arquivo comum.');
    if (body.size > MAX_READ_BYTES) throw new TooLargeError();

    let bytes: Uint8Array;
    if (body.encoding === 'base64' && typeof body.content === 'string') {
      bytes = Buffer.from(body.content, 'base64');
    } else {
      // Arquivos acima de 1 MB vêm sem conteúdo; o blob é lido pelo SHA.
      bytes = await this.readBlob(body.sha);
    }
    if (gitBlobSha(bytes) !== body.sha) {
      throw new VaultUnavailableError('Resposta inconsistente do GitHub (SHA não confere).');
    }
    return { path: key, content: decodeText(bytes), sha: body.sha, size: bytes.byteLength };
  }

  async create(path: string, content: string, { message }: WriteOptions): Promise<WriteResult> {
    const key = normalizeVaultPath(path);
    const payload = { message, content: toBase64(content), branch: this.options.branch };
    // 409 aqui significa corrida no branch (outro commit simultâneo): seguro repetir, pois sem `sha`
    // o GitHub recusa (422) se o arquivo passar a existir.
    for (let attempt = 0; ; attempt++) {
      const response = await this.request('PUT', `/contents/${encodePath(key)}`, payload);
      if (response.status === 201 || response.status === 200)
        return this.writeResult(key, response);
      if (response.status === 422) throw new AlreadyExistsError();
      if (response.status === 409 && attempt < 2) continue;
      if (response.status === 404) {
        throw new VaultConfigError(
          'Repositório ou branch do vault não encontrado (ou o token não tem acesso).',
        );
      }
      throw await this.unexpected(response);
    }
  }

  async update(
    path: string,
    content: string,
    { message, expectedSha }: UpdateOptions,
  ): Promise<WriteResult> {
    const key = normalizeVaultPath(path);
    const payload = {
      message,
      content: toBase64(content),
      sha: expectedSha,
      branch: this.options.branch,
    };
    for (let attempt = 0; ; attempt++) {
      const response = await this.request('PUT', `/contents/${encodePath(key)}`, payload);
      if (response.status === 200 || response.status === 201)
        return this.writeResult(key, response);
      if (response.status !== 409 && response.status !== 422 && response.status !== 404) {
        throw await this.unexpected(response);
      }
      // O GitHub usa 409/422/404 tanto para "SHA não confere" quanto para corridas no branch ou
      // arquivo removido. A versão atual decide.
      const currentSha = await this.currentSha(key);
      if (currentSha === null) throw new NotFoundError('A nota foi removida ou movida no vault.');
      if (currentSha !== expectedSha) throw new ConflictError(currentSha);
      if (attempt >= 2)
        throw new VaultUnavailableError('Não foi possível gravar após várias tentativas.');
    }
  }

  private async currentSha(path: string): Promise<string | null> {
    try {
      return (await this.read(path)).sha;
    } catch (error) {
      if (error instanceof NotFoundError) return null;
      throw error;
    }
  }

  private async readBlob(sha: string): Promise<Uint8Array> {
    const response = await this.request('GET', `/git/blobs/${encodeURIComponent(sha)}`);
    if (response.status === 404) throw new NotFoundError();
    const body = await this.json<{ content: string; encoding: string; size: number }>(
      response,
      200,
    );
    if (body.size > MAX_READ_BYTES) throw new TooLargeError();
    if (body.encoding !== 'base64') throw new UnsupportedContentError();
    return Buffer.from(body.content, 'base64');
  }

  private async writeResult(path: string, response: Response): Promise<WriteResult> {
    const body = (await response.json()) as WriteResponse;
    return { path, sha: body.content.sha, commitSha: body.commit.sha };
  }

  /** Executa a requisição; GETs são repetidos em falhas transitórias. Erros comuns viram `VaultError`. */
  private async request(
    method: 'GET' | 'PUT' | 'POST' | 'PATCH',
    path: string,
    body?: unknown,
  ): Promise<Response> {
    const attempts = method === 'GET' ? this.retryDelaysMs.length + 1 : 1;
    let lastError: VaultError = new VaultUnavailableError();
    for (let attempt = 0; attempt < attempts; attempt++) {
      if (attempt > 0) await sleep(this.retryDelaysMs[attempt - 1] ?? 0);
      let response: Response;
      try {
        response = await this.fetchImpl(`${this.base}${path}`, {
          method,
          headers: {
            Accept: 'application/vnd.github+json',
            Authorization: `Bearer ${this.options.token}`,
            'X-GitHub-Api-Version': '2022-11-28',
            'User-Agent': 'second-brain',
            ...(body ? { 'Content-Type': 'application/json' } : {}),
          },
          body: body ? JSON.stringify(body) : undefined,
          cache: 'no-store',
          signal: AbortSignal.timeout(this.timeoutMs),
        });
      } catch (error) {
        lastError = new VaultUnavailableError(
          `Não foi possível falar com o GitHub (rede ou tempo esgotado; detalhe: ${failureCode(error)}).`,
        );
        continue;
      }
      const mapped = classify(response);
      if (!mapped) return response;
      lastError = mapped;
      if (!(mapped instanceof VaultUnavailableError)) break;
    }
    throw lastError;
  }

  private async json<T>(response: Response, expected: number): Promise<T> {
    if (response.status !== expected) throw await this.unexpected(response);
    return (await response.json()) as T;
  }

  private async unexpected(response: Response): Promise<VaultError> {
    await response.body?.cancel();
    return new VaultUnavailableError(`Resposta inesperada do GitHub (HTTP ${response.status}).`);
  }
}

/** Mapeia status que valem para qualquer endpoint. `null` = deixar o chamador interpretar. */
function classify(response: Response): VaultError | null {
  const { status, headers } = response;
  if (status === 401) return new VaultConfigError('Token do GitHub inválido ou expirado.');
  if (
    status === 429 ||
    (status === 403 && (headers.get('retry-after') || headers.get('x-ratelimit-remaining') === '0'))
  ) {
    const retryAfter = Number(headers.get('retry-after'));
    const reset = Number(headers.get('x-ratelimit-reset'));
    const seconds =
      Number.isFinite(retryAfter) && retryAfter > 0
        ? retryAfter
        : Number.isFinite(reset) && reset > 0
          ? Math.max(0, Math.ceil(reset - Date.now() / 1000))
          : null;
    return new VaultRateLimitedError(seconds);
  }
  if (status === 403)
    return new VaultConfigError('O token do GitHub não tem permissão para o repositório do vault.');
  if (status >= 500) return new VaultUnavailableError(`GitHub indisponível (HTTP ${status}).`);
  return null;
}

function encodePath(path: string): string {
  return path.split('/').map(encodeURIComponent).join('/');
}

function toBase64(content: string): string {
  return Buffer.from(encodeText(content)).toString('base64');
}

function sleep(ms: number): Promise<void> {
  return ms > 0 ? new Promise((resolve) => setTimeout(resolve, ms)) : Promise.resolve();
}

/** Código curto e seguro da falha de rede (ex.: `UND_ERR_CONNECT_TIMEOUT`), sem mensagem nem URL. */
function failureCode(error: unknown): string {
  const cause = (error as { cause?: { code?: unknown } } | null)?.cause;
  const raw =
    typeof cause?.code === 'string'
      ? cause.code
      : error instanceof Error
        ? error.name
        : 'desconhecido';
  return raw.replace(/[^A-Za-z0-9_]/g, '').slice(0, 40) || 'desconhecido';
}
