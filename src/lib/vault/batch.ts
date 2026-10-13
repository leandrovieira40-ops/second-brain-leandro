import { AlreadyExistsError, ConflictError, NotFoundError } from './errors';
import { normalizeVaultPath } from './paths';
import type { BatchChange } from './types';

/** Normaliza caminhos e rejeita lotes vazios ou com o mesmo arquivo duas vezes. */
export function normalizeBatch(changes: readonly BatchChange[]): BatchChange[] {
  if (changes.length === 0) throw new Error('Lote vazio.');
  const seen = new Set<string>();
  return changes.map((change) => {
    const path = normalizeVaultPath(change.path);
    if (seen.has(path)) throw new Error(`Arquivo repetido no lote: ${path}`);
    seen.add(path);
    return { ...change, path };
  });
}

/** Verifica a pré-condição de uma alteração diante do SHA atual (`null` = inexistente). */
export function assertPrecondition(change: BatchChange, currentSha: string | null): void {
  if (change.expectedSha === null) {
    if (currentSha !== null)
      throw new AlreadyExistsError(`Já existe um arquivo em ${change.path}.`);
    return;
  }
  if (currentSha === null)
    throw new NotFoundError(`O arquivo ${change.path} não existe mais no vault.`);
  if (currentSha !== change.expectedSha) throw new ConflictError(currentSha);
}
