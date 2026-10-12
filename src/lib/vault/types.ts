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

/**
 * Uma alteração de um commit em lote. `expectedSha` é a pré-condição: `null` = o arquivo NÃO pode
 * existir; um SHA = o arquivo precisa estar exatamente nessa versão.
 */
export type BatchChange =
  | { kind: 'put'; path: string; content: string; expectedSha: string | null }
  | { kind: 'delete'; path: string; expectedSha: string };

export interface BatchResult {
  commitSha: string | null;
}

export interface CommitInfo {
  sha: string;
  message: string;
  /** ISO 8601. */
  date: string;
  author: string | null;
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
  /**
   * Várias alterações num único commit. Todas as pré-condições são verificadas antes de qualquer
   * escrita; se uma falhar, nada é gravado (`AlreadyExistsError`, `NotFoundError`, `ConflictError`).
   * No GitHub é atômico (Git Data API); na pasta local, atômico dentro do processo.
   */
  commit(changes: readonly BatchChange[], options: WriteOptions): Promise<BatchResult>;
  /** O adaptador guarda histórico de versões (GitHub sim; pasta local não — use `git log`). */
  readonly supportsHistory: boolean;
  /** Commits que alteraram o arquivo, do mais recente para o mais antigo. */
  history(path: string, limit?: number): Promise<CommitInfo[]>;
  /** Conteúdo do arquivo como estava em um commit. */
  readAt(path: string, commitSha: string): Promise<VaultFile>;
}
