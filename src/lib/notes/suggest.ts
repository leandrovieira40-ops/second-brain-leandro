import { dirname, noteName } from '@/lib/vault/paths';

export interface NoteSuggestion {
  path: string;
  /** Texto a inserir no link: o nome, ou o caminho quando o nome é ambíguo. */
  insert: string;
  label: string;
  folder: string;
}

const fold = (value: string) =>
  value
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLocaleLowerCase('pt-BR');

/**
 * Sugestões para `[[...`: prefixo do nome > início de palavra > trecho do nome > trecho do caminho.
 * Comparação sem acentos e sem maiúsculas. Nomes repetidos sugerem o caminho, para não criar links
 * ambíguos.
 */
export function suggestNotes(
  query: string,
  paths: readonly string[],
  limit = 20,
): NoteSuggestion[] {
  const q = fold(query.trim());
  const counts = new Map<string, number>();
  for (const path of paths) {
    const key = fold(noteName(path));
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  const scored: { score: number; suggestion: NoteSuggestion }[] = [];
  for (const path of paths) {
    const name = noteName(path);
    const folded = fold(name);
    let score: number;
    if (!q) score = 4;
    else if (folded.startsWith(q)) score = 0;
    else if (folded.split(/[\s\-_.]+/).some((word) => word.startsWith(q))) score = 1;
    else if (folded.includes(q)) score = 2;
    else if (fold(path).includes(q)) score = 3;
    else continue;
    const ambiguous = (counts.get(folded) ?? 0) > 1;
    scored.push({
      score,
      suggestion: {
        path,
        insert: ambiguous ? path.replace(/\.md$/i, '') : name,
        label: name,
        folder: dirname(path),
      },
    });
  }
  return scored
    .sort(
      (a, b) => a.score - b.score || a.suggestion.label.localeCompare(b.suggestion.label, 'pt-BR'),
    )
    .slice(0, limit)
    .map((item) => item.suggestion);
}
