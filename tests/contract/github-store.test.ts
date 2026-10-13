import { describe, expect, it } from 'vitest';
import {
  AlreadyExistsError,
  ConflictError,
  TooLargeError,
  VaultConfigError,
  VaultRateLimitedError,
  VaultUnavailableError,
} from '@/lib/vault/errors';
import { GitHubVaultStore } from '@/lib/vault/github-store';
import { createFakeGitHub } from '../helpers/fake-github';
import { describeVaultStoreContract } from './vault-store.contract';

function setup() {
  const github = createFakeGitHub();
  const store = new GitHubVaultStore({
    owner: 'dono',
    repo: 'vault',
    branch: 'main',
    token: 'token-de-teste',
    fetch: github.fetch,
    retryDelaysMs: [0, 0],
  });
  return { github, store };
}

describeVaultStoreContract('GitHub (API simulada)', async () => {
  const { github, store } = setup();
  return {
    store,
    prefix: '',
    writeExternal: async (path, content) => github.writeExternal(path, content),
  };
});

describe('GitHubVaultStore — comportamento HTTP', () => {
  it('envia o token apenas no cabeçalho Authorization e codifica caminhos', async () => {
    const { github, store } = setup();
    await store.create('Pasta com espaço/Ação #1.md', 'x', { message: 'm' });
    const request = github.requests.at(-1)!;
    expect(request.auth).toBe('Bearer token-de-teste');
    expect(request.url).toBe(
      '/repos/dono/vault/contents/Pasta%20com%20espa%C3%A7o/A%C3%A7%C3%A3o%20%231.md',
    );
    expect(request.url).not.toContain('token');
  });

  it('repositório vazio lista nada; branch inexistente é erro de configuração', async () => {
    const { store } = setup();
    expect(await store.list()).toEqual([]);
    const other = new GitHubVaultStore({
      owner: 'dono',
      repo: 'vault',
      branch: 'outro',
      token: 'token-de-teste',
      fetch: createFakeGitHub().fetch,
      retryDelaysMs: [],
    });
    await expect(other.list()).rejects.toBeInstanceOf(VaultConfigError);
  });

  it('token inválido vira erro de configuração sem vazar a resposta', async () => {
    const github = createFakeGitHub({ token: 'certo' });
    const store = new GitHubVaultStore({
      owner: 'dono',
      repo: 'vault',
      branch: 'main',
      token: 'errado',
      fetch: github.fetch,
    });
    const error = await store.list().catch((e) => e);
    expect(error).toBeInstanceOf(VaultConfigError);
    expect(String(error.message)).not.toContain('Bad credentials');
  });

  it('lê arquivos acima de 1 MB pelo blob', async () => {
    const { github, store } = setup();
    const big = 'a'.repeat(1024 * 1024 + 10);
    github.writeExternal('grande.md', big);
    const file = await store.read('grande.md');
    expect(file.content).toBe(big);
    expect(github.requests.some((r) => r.url.startsWith('/repos/dono/vault/git/blobs/'))).toBe(
      true,
    );
  });

  it('repete leituras em falhas transitórias, mas não gravações', async () => {
    const { github, store } = setup();
    github.writeExternal('a.md', 'conteúdo');
    github.failures.push('network', 502);
    expect((await store.read('a.md')).content).toBe('conteúdo');

    github.failures.push('network');
    await expect(store.create('b.md', 'x', { message: 'm' })).rejects.toBeInstanceOf(
      VaultUnavailableError,
    );
    expect(github.files.has('b.md')).toBe(false);
  });

  it('reconhece limites de taxa (primário e secundário)', async () => {
    const { github, store } = setup();
    github.failures.push(429);
    await expect(store.list()).rejects.toBeInstanceOf(VaultRateLimitedError);
  });

  it('criação sobre arquivo existente é AlreadyExists; atualização divergente é Conflict', async () => {
    const { github, store } = setup();
    github.writeExternal('x.md', 'remoto');
    await expect(store.create('x.md', 'meu', { message: 'm' })).rejects.toBeInstanceOf(
      AlreadyExistsError,
    );
    await expect(
      store.update('x.md', 'meu', { message: 'm', expectedSha: 'a'.repeat(40) }),
    ).rejects.toBeInstanceOf(ConflictError);
    expect(github.files.get('x.md')?.toString()).toBe('remoto');
  });

  it('repete a gravação quando o 409 foi só corrida no branch (SHA ainda confere)', async () => {
    const { github, store } = setup();
    const { sha } = await store.create('y.md', 'v1', { message: 'm' });
    github.failures.push(409);
    const result = await store.update('y.md', 'v2', { message: 'm', expectedSha: sha });
    expect(github.files.get('y.md')?.toString()).toBe('v2');
    expect(result.commitSha).toMatch(/^[0-9a-f]{40}$/);
  });

  it('árvore truncada é erro explícito', async () => {
    const { store } = setup();
    const truncated = new GitHubVaultStore({
      owner: 'dono',
      repo: 'vault',
      branch: 'main',
      token: 't',
      fetch: async () =>
        new Response(JSON.stringify({ truncated: true, tree: [] }), { status: 200 }),
    });
    void store;
    await expect(truncated.list()).rejects.toBeInstanceOf(TooLargeError);
  });

  it('commit em lote reavalia as pré-condições se o branch andar no meio do caminho', async () => {
    const { github, store } = setup();
    const { sha } = await store.create('a.md', 'v1', { message: 'm' });
    await store.create('outro.md', 'x', { message: 'm' });

    // Um push em OUTRO arquivo durante o lote: o lote é refeito sobre o novo head e passa.
    github.beforeNextRefUpdate = () => github.writeExternal('outro.md', 'mudou');
    await store.commit([{ kind: 'put', path: 'a.md', content: 'v2', expectedSha: sha }], {
      message: 'm',
    });
    expect(github.files.get('a.md')?.toString()).toBe('v2');
    expect(github.files.get('outro.md')?.toString()).toBe('mudou');

    // Um push NO MESMO arquivo durante o lote: vira conflito, a versão externa é preservada.
    const current = (await store.read('a.md')).sha;
    github.beforeNextRefUpdate = () => github.writeExternal('a.md', 'editado no Obsidian');
    await expect(
      store.commit([{ kind: 'put', path: 'a.md', content: 'v3', expectedSha: current }], {
        message: 'm',
      }),
    ).rejects.toBeInstanceOf(ConflictError);
    expect(github.files.get('a.md')?.toString()).toBe('editado no Obsidian');
  });

  it('commit em lote exige um vault com ao menos um commit', async () => {
    const { store } = setup();
    await expect(
      store.commit([{ kind: 'put', path: 'a.md', content: 'x', expectedSha: null }], {
        message: 'm',
      }),
    ).rejects.toBeInstanceOf(VaultConfigError);
  });
});
