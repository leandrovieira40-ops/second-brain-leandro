/** Porta de persistência do vault (ADR-0004). Implementações: GitHub, pasta local, memória. */

export interface VaultEntry {
  path: string;
  /** SHA do blob Git (a "versão" do arquivo). */
  sha: string;
  size: number;
}

export interface VaultFile {
  path: string;
  content: string;
  sha: string;
  size: number;
}

export interface WriteOptions {
  /** Mensagem de commit completa (o serviço adiciona o trailer de origem). */
  message: string;
}

export interface UpdateOptions extends WriteOptions {
  /** SHA que o cliente leu. Se o arquivo mudou desde então, a gravação falha com `ConflictError`. */
  expectedSha: string;
}

export interface WriteResult {
  path: string;
  sha: string;
  /** Commit criado (GitHub); `null` quando o adaptador não faz commits (pasta local, memória). */
  commitSha: string | null;
}

export type VaultStoreKind = 'github' | 'fs' | 'memory';

export interface VaultStore {
  readonly kind: VaultStoreKind;
  /** Descrição sem segredos, para diagnóstico (ex.: `github:dono/repo@main`). */
  readonly description: string;
  /** Todos os arquivos do vault (exceto `.git`). */
  list(): Promise<VaultEntry[]>;
  /** Lança `NotFoundError` se não existir. */
  read(path: string): Promise<VaultFile>;
  /** Nunca sobrescreve: lança `AlreadyExistsError` se o arquivo já existir. */
  create(path: string, content: string, options: WriteOptions): Promise<WriteResult>;
  /** Lança `ConflictError` se o SHA atual for diferente de `expectedSha`; `NotFoundError` se sumiu. */
  update(path: string, content: string, options: UpdateOptions): Promise<WriteResult>;
}
