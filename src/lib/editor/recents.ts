/** Notas abertas recentemente NESTE navegador (conveniência local; não é dado do vault). */
const KEY = 'sb:recent';
const MAX = 15;

export function loadRecents(): string[] {
  try {
    const value = JSON.parse(localStorage.getItem(KEY) ?? '[]') as unknown;
    return Array.isArray(value)
      ? value.filter((item): item is string => typeof item === 'string')
      : [];
  } catch {
    return [];
  }
}

export function pushRecent(path: string): string[] {
  const next = [path, ...loadRecents().filter((item) => item !== path)].slice(0, MAX);
  try {
    localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    // Sem armazenamento local: a lista só não persiste.
  }
  return next;
}

export function clearRecents(): void {
  try {
    localStorage.removeItem(KEY);
  } catch {
    // nada a limpar
  }
}
