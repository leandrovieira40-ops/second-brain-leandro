import { MemoryVaultStore } from '@/lib/vault/memory-store';
import { describeVaultStoreContract } from './vault-store.contract';

describeVaultStoreContract('memória', async () => {
  const store = new MemoryVaultStore();
  return { store, prefix: '', writeExternal: async (path, content) => store.writeExternal(path, content) };
});
