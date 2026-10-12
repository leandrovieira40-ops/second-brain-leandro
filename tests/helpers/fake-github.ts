import { createHash } from 'node:crypto';

/**
 * Simulação em memória dos endpoints da API REST do GitHub usados pelo `GitHubVaultStore`, com os
 * mesmos códigos de status documentados (201/200, 404, 409 para SHA divergente, 422 para criação sem
 * `sha` de arquivo existente, 409 para repositório vazio na Trees API). Também permite injetar falhas.
 * A suíte de contrato roda contra este falso **e**, opcionalmente, contra o GitHub real.
 */
export interface FakeGitHub {
  fetch: typeof fetch;
  files: Map<string, Buffer>;
  requests: { method: string; url: string; auth: string | null }[];
  /** Próximas respostas forçadas (status ou 'network'). */
  failures: (number | 'network')[];
  /** Simula uma alteração feita fora da aplicação. */
  writeExternal(path: string, content: string): void;
  commitCount: number;
}

const blobSha = (bytes: Buffer) =>
  createHash('sha1').update(`blob ${bytes.byteLength}\0`).update(bytes).digest('hex');

export function createFakeGitHub(options: { owner?: string; repo?: string; branch?: string; token?: string } = {}): FakeGitHub {
  const owner = options.owner ?? 'dono';
  const repo = options.repo ?? 'vault';
  const branch = options.branch ?? 'main';
  const token = options.token ?? 'token-de-teste';
  const files = new Map<string, Buffer>();
  const blobs = new Map<string, Buffer>();
  const state: FakeGitHub = {
    files,
    requests: [],
    failures: [],
    commitCount: 0,
    writeExternal(path, content) {
      const bytes = Buffer.from(content, 'utf8');
      files.set(path, bytes);
      blobs.set(blobSha(bytes), bytes);
      state.commitCount++;
    },
    fetch: async (input, init) => {
      const url = new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url);
      const method = (init?.method ?? 'GET').toUpperCase();
      const headers = new Headers(init?.headers);
      state.requests.push({ method, url: url.pathname + url.search, auth: headers.get('authorization') });

      const failure = state.failures.shift();
      if (failure === 'network') throw new TypeError('fetch failed');
      if (typeof failure === 'number') return json(failure, { message: 'falha simulada' });

      if (headers.get('authorization') !== `Bearer ${token}`) return json(401, { message: 'Bad credentials' });
      const prefix = `/repos/${owner}/${repo}`;
      if (!url.pathname.startsWith(prefix)) return json(404, { message: 'Not Found' });
      const rest = url.pathname.slice(prefix.length);

      if (method === 'GET' && rest.startsWith('/git/trees/')) {
        if (decodeURIComponent(rest.slice('/git/trees/'.length)) !== branch) return json(404, { message: 'Not Found' });
        if (files.size === 0) return json(409, { message: 'Git Repository is empty.' });
        const tree = [...files.entries()].map(([path, bytes]) => ({
          path,
          type: 'blob',
          sha: blobSha(bytes),
          size: bytes.byteLength,
        }));
        return json(200, { sha: 'tree', truncated: false, tree });
      }

      if (method === 'GET' && rest.startsWith('/git/blobs/')) {
        const bytes = blobs.get(rest.slice('/git/blobs/'.length));
        if (!bytes) return json(404, { message: 'Not Found' });
        return json(200, { content: bytes.toString('base64'), encoding: 'base64', size: bytes.byteLength });
      }

      if (rest.startsWith('/contents/')) {
        const path = rest.slice('/contents/'.length).split('/').map(decodeURIComponent).join('/');
        if (method === 'GET') {
          if (url.searchParams.get('ref') !== branch) return json(404, { message: 'No commit found for the ref' });
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
          const body = JSON.parse(String(init?.body)) as { content: string; sha?: string; branch?: string; message: string };
          if (body.branch !== branch) return json(404, { message: 'Branch not found' });
          if (!body.message) return json(422, { message: 'message is required' });
          const existing = files.get(path);
          if (existing && !body.sha) return json(422, { message: 'Invalid request.\n\n"sha" wasn\'t supplied.' });
          if (!existing && body.sha) return json(404, { message: 'Not Found' });
          if (existing && body.sha !== blobSha(existing)) {
            return json(409, { message: `${path} does not match ${body.sha}` });
          }
          const bytes = Buffer.from(body.content, 'base64');
          files.set(path, bytes);
          blobs.set(blobSha(bytes), bytes);
          state.commitCount++;
          return json(existing ? 200 : 201, {
            content: { path, sha: blobSha(bytes) },
            commit: { sha: `commit-${state.commitCount}` },
          });
        }
      }
      return json(404, { message: 'Not Found' });
    },
  };
  return state;
}

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}
