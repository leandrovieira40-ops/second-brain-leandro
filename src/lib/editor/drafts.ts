/**
 * Rascunhos locais (ADR-0008): cópia do conteúdo não confirmado, guardada no navegador até o servidor
 * confirmar a gravação. Toda operação tolera `localStorage` indisponível (modo privado, cota cheia).
 */
export interface Draft {
  path: string;
  content: string;
  /** SHA sobre o qual o rascunho foi escrito — usado como versão esperada ao restaurar. */
  baseSha: string;
  savedAt: number;
}

const PREFIX = 'sb:draft:';

function storage(): Storage | null {
  try {
    return typeof window === 'undefined' ? null : window.localStorage;
  } catch {
    return null;
  }
}

export function saveDraft(draft: Draft): boolean {
  try {
    storage()?.setItem(PREFIX + draft.path, JSON.stringify(draft));
    return true;
  } catch {
    return false;
  }
}

export function loadDraft(path: string): Draft | null {
  try {
    const raw = storage()?.getItem(PREFIX + path);
    if (!raw) return null;
    const draft = JSON.parse(raw) as Partial<Draft>;
    if (typeof draft.content !== 'string' || typeof draft.baseSha !== 'string') return null;
    return {
      path,
      content: draft.content,
      baseSha: draft.baseSha,
      savedAt: Number(draft.savedAt) || 0,
    };
  } catch {
    return null;
  }
}

export function removeDraft(path: string): void {
  try {
    storage()?.removeItem(PREFIX + path);
  } catch {
    // Sem armazenamento local: não há o que remover.
  }
}

export function listDraftPaths(): string[] {
  const store = storage();
  if (!store) return [];
  try {
    return Object.keys(store)
      .filter((key) => key.startsWith(PREFIX))
      .map((key) => key.slice(PREFIX.length));
  } catch {
    return [];
  }
}

export function clearAllDrafts(): void {
  for (const path of listDraftPaths()) removeDraft(path);
}
