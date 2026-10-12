import { describe, it } from 'vitest';
import { ulid } from '@/lib/notes/ids';
import { GitHubVaultStore } from '@/lib/vault/github-store';
import { describeVaultStoreContract } from './vault-store.contract';

/**
 * Contrato contra o GitHub REAL. Só roda com variáveis explícitas e deve usar um repositório
 * DESCARTÁVEL (nunca o vault pessoal): cada execução cria commits em `contract-tests/<ulid>/`.
 *
 *   GITHUB_CONTRACT_REPO=dono/repo-de-teste GITHUB_CONTRACT_TOKEN=... npx vitest run github-live
 */
const repo = process.env.GITHUB_CONTRACT_REPO;
const token = process.env.GITHUB_CONTRACT_TOKEN;
const branch = process.env.GITHUB_CONTRACT_BRANCH ?? 'main';

if (repo && token) {
  const [owner, name] = repo.split('/') as [string, string];
  const store = new GitHubVaultStore({ owner, repo: name, branch, token });
  describeVaultStoreContract('GitHub (real)', async () => {
    const prefix = `contract-tests/${ulid()}/`;
    return {
      store,
      prefix,
      writeExternal: async (path, content) => {
        const current = await store.read(path);
        await store.update(path, content, { message: 'alteração externa (teste)', expectedSha: current.sha });
      },
    };
  });
} else {
  describe('VaultStore contrato: GitHub (real)', () => {
    it.skip('defina GITHUB_CONTRACT_REPO e GITHUB_CONTRACT_TOKEN para rodar contra o GitHub real', () => {});
  });
}
