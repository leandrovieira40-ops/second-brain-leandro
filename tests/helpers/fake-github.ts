import { createHash } from 'node:crypto';

/**
 * Simulação em memória dos endpoints da API REST do GitHub usados pelo `GitHubVaultStore`, com os
 * códigos de status documentados: Contents API (201/200, 404, 409 para SHA divergente, 422 para
 * criação sem `sha` de arquivo existente), Trees API (409 para repositório vazio) e Git Data API
 * (árvores, commits e refs — 422 quando a atualização do ref não é fast-forward). Mantém um histórico
 * de commits real, para `commits?path=` e `contents?ref=<commit>`. Também permite injetar falhas.
 * A suíte de contrato roda contra este falso **e**, opcionalmente, contra o GitHub real.
 */
export interface FakeGitHub {
  fetch: typeof fetch;
  /** Arquivos no head do branch. */
  readonly files: Map<string, Buffer>;
  requests: { method: string; url: string; auth: string | null }[];
  /** Próximas respostas forçadas (status ou 'network'). */
  failures: (number | 'network')[];
  /** Simula uma alteração feita fora da aplicação (push do Obsidian). */
  writeExternal(path: string, content: string): void;
  /** Executa algo logo antes da próxima atualização de ref (simula push concorrente). */
  beforeNextRefUpdate: (() => void) | null;
  readonly commitCount: number;
}

interface Commit {
  sha: string;
  tree: string;
  parent: string | null;
  message: string;
  date: string;
}

const sha1 = (value: string | Buffer) => createHash('sha1').update(value).digest('hex');
const blobSha = (bytes: Buffer) =>
  createHash('sha1').update(`blob ${bytes.byteLength}\0`).update(bytes).digest('hex');

export function createFakeGitHub(
  options: { owner?: string; repo?: string; branch?: string; token?: string } = {},
): FakeGitHub {
  const owner = options.owner ?? 'dono';
  const repo = options.repo ?? 'vault';
  const branch = options.branch ?? 'main';
  const token = options.token ?? 'token-de-teste';

  const blobs = new Map<string, Buffer>();
  const trees = new Map<string, Map<string, Buffer>>();
  const commits = new Map<string, Commit>();
  let head: string | null = null;
  let counter = 0;
  let clock = Date.UTC(2026, 9, 1);

  const storeTree = (files: Map<string, Buffer>) => {
    const key = [...files.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([path, bytes]) => `${path}:${blobSha(bytes)}`)
      .join('\n');
    const sha = sha1(`tree\n${key}`);
    trees.set(sha, files);
    for (const bytes of files.values()) blobs.set(blobSha(bytes), bytes);
    return sha;
  };
  const headFiles = () => (head ? trees.get(commits.get(head)!.tree)! : new Map<string, Buffer>());
  const newCommit = (tree: string, parent: string | null, message: string) => {
    const sha = sha1(`commit-${++counter}-${tree}-${parent}`);
    clock += 60_000;
    commits.set(sha, { sha, tree, parent, message, date: new Date(clock).toISOString() });
    return sha;
  };
  const commitFiles = (files: Map<string, Buffer>, message: string) => {
    head = newCommit(storeTree(files), head, message);
    return head;
  };
  const filesAt = (ref: string | null) => {
    if (!ref || ref === branch) return head ? headFiles() : null;
    const commit = commits.get(ref);
    return commit ? trees.get(commit.tree)! : null;
  };

  const state: FakeGitHub = {
    get files() {
      return headFiles();
    },
    get commitCount() {
      return counter;
    },
    requests: [],
    failures: [],
    beforeNextRefUpdate: null,
    writeExternal(path, content) {
      commitFiles(
        new Map(headFiles()).set(path, Buffer.from(content, 'utf8')),
        'Alteração externa',
      );
    },
    fetch: async (input, init) => {
      const url = new URL(
        typeof input === 'string' ? input : input instanceof URL ? input.href : input.url,
      );
      const method = (init?.method ?? 'GET').toUpperCase();
      const headers = new Headers(init?.headers);
      state.requests.push({
        method,
        url: url.pathname + url.search,
        auth: headers.get('authorization'),
      });

      const failure = state.failures.shift();
      if (failure === 'network') throw new TypeError('fetch failed');
      if (typeof failure === 'number') return json(failure, { message: 'falha simulada' });

      if (headers.get('authorization') !== `Bearer ${token}`) {
        return json(401, { message: 'Bad credentials' });
      }
      const prefix = `/repos/${owner}/${repo}`;
      if (!url.pathname.startsWith(prefix)) return json(404, { message: 'Not Found' });
      const rest = url.pathname.slice(prefix.length);
      const body = init?.body ? (JSON.parse(String(init.body)) as Record<string, unknown>) : {};

      // --- Trees ---------------------------------------------------------------------------
      if (method === 'GET' && rest.startsWith('/git/trees/')) {
        const ref = decodeURIComponent(rest.slice('/git/trees/'.length));
        if (ref === branch && !head) return json(409, { message: 'Git Repository is empty.' });
        const files = ref === branch ? headFiles() : trees.get(ref);
        if (!files) return json(404, { message: 'Not Found' });
        const tree = [...files.entries()].map(([path, bytes]) => ({
          path,
          type: 'blob',
          sha: blobSha(bytes),
          size: bytes.byteLength,
        }));
        return json(200, { sha: ref, truncated: false, tree });
      }
      if (method === 'POST' && rest === '/git/trees') {
        const base = body.base_tree ? trees.get(String(body.base_tree)) : new Map<string, Buffer>();
        if (!base) return json(422, { message: 'base_tree inválida' });
        const files = new Map(base);
        for (const entry of body.tree as {
          path: string;
          sha?: string | null;
          content?: string;
        }[]) {
          if (entry.sha === null) files.delete(entry.path);
          else if (typeof entry.content === 'string')
            files.set(entry.path, Buffer.from(entry.content, 'utf8'));
          else if (entry.sha && blobs.has(entry.sha)) files.set(entry.path, blobs.get(entry.sha)!);
          else return json(422, { message: 'entrada de árvore inválida' });
        }
        return json(201, { sha: storeTree(files) });
      }

      // --- Blobs, commits e refs ------------------------------------------------------------
      if (method === 'GET' && rest.startsWith('/git/blobs/')) {
        const bytes = blobs.get(rest.slice('/git/blobs/'.length));
        if (!bytes) return json(404, { message: 'Not Found' });
        return json(200, {
          content: bytes.toString('base64'),
          encoding: 'base64',
          size: bytes.byteLength,
        });
      }
      if (method === 'GET' && rest === `/git/ref/heads/${branch}`) {
        if (!head) return json(409, { message: 'Git Repository is empty.' });
        return json(200, { ref: `refs/heads/${branch}`, object: { sha: head, type: 'commit' } });
      }
      if (method === 'GET' && rest.startsWith('/git/commits/')) {
        const commit = commits.get(rest.slice('/git/commits/'.length));
        if (!commit) return json(404, { message: 'Not Found' });
        return json(200, {
          sha: commit.sha,
          tree: { sha: commit.tree },
          parents: commit.parent ? [{ sha: commit.parent }] : [],
        });
      }
      if (method === 'POST' && rest === '/git/commits') {
        const parents = body.parents as string[];
        if (!trees.has(String(body.tree)) || parents.some((p) => !commits.has(p))) {
          return json(422, { message: 'commit inválido' });
        }
        return json(201, {
          sha: newCommit(String(body.tree), parents[0] ?? null, String(body.message)),
        });
      }
      if (method === 'PATCH' && rest === `/git/refs/heads/${branch}`) {
        const hook = state.beforeNextRefUpdate;
        state.beforeNextRefUpdate = null;
        hook?.();
        const commit = commits.get(String(body.sha));
        if (!commit) return json(422, { message: 'Object does not exist' });
        if (!body.force && commit.parent !== head) {
          return json(422, { message: 'Update is not a fast forward' });
        }
        head = commit.sha;
        return json(200, { ref: `refs/heads/${branch}`, object: { sha: head } });
      }

      // --- Histórico ------------------------------------------------------------------------
      if (method === 'GET' && rest === '/commits') {
        if (!head) return json(409, { message: 'Git Repository is empty.' });
        const path = url.searchParams.get('path') ?? '';
        const limit = Number(url.searchParams.get('per_page') ?? 30);
        const result: unknown[] = [];
        for (let sha: string | null = head; sha && result.length < limit;) {
          const commit: Commit = commits.get(sha)!;
          const after = trees.get(commit.tree)!.get(path);
          const before = commit.parent
            ? trees.get(commits.get(commit.parent)!.tree)!.get(path)
            : undefined;
          const changed = (after ? blobSha(after) : null) !== (before ? blobSha(before) : null);
          if (!path || changed) {
            result.push({
              sha: commit.sha,
              commit: { message: commit.message, author: { name: 'Dono', date: commit.date } },
            });
          }
          sha = commit.parent;
        }
        return json(200, result);
      }

      // --- Contents API ---------------------------------------------------------------------
      if (rest.startsWith('/contents/')) {
        const path = rest.slice('/contents/'.length).split('/').map(decodeURIComponent).join('/');
        if (method === 'GET') {
          const files = filesAt(url.searchParams.get('ref'));
          if (!files) return json(404, { message: 'No commit found for the ref' });
          const bytes = files.get(path);
          if (!bytes) {
            const isDir = [...files.keys()].some((p) => p.startsWith(`${path}/`));
            return isDir ? json(200, []) : json(404, { message: 'Not Found' });
          }
          const large = bytes.byteLength > 1024 * 1024;
          return json(200, {
            type: 'file',
            path,
            sha: blobSha(bytes),
            size: bytes.byteLength,
            encoding: large ? 'none' : 'base64',
            // O GitHub quebra o base64 em linhas de 60 caracteres.
            content: large ? '' : (bytes.toString('base64').match(/.{1,60}/g) ?? []).join('\n'),
          });
        }
        if (method === 'PUT') {
          const put = body as { content: string; sha?: string; branch?: string; message: string };
          if (put.branch !== branch) return json(404, { message: 'Branch not found' });
          if (!put.message) return json(422, { message: 'message is required' });
          const files = headFiles();
          const existing = files.get(path);
          if (existing && !put.sha) {
            return json(422, { message: 'Invalid request.\n\n"sha" wasn\'t supplied.' });
          }
          if (!existing && put.sha) return json(404, { message: 'Not Found' });
          if (existing && put.sha !== blobSha(existing)) {
            return json(409, { message: `${path} does not match ${put.sha}` });
          }
          const bytes = Buffer.from(put.content, 'base64');
          const commitSha = commitFiles(new Map(files).set(path, bytes), put.message);
          return json(existing ? 200 : 201, {
            content: { path, sha: blobSha(bytes) },
            commit: { sha: commitSha },
          });
        }
      }
      return json(404, { message: 'Not Found' });
    },
  };
  return state;
}

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}
