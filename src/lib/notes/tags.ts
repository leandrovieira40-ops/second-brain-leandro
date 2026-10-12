import { maskNonProse } from './mask';
import { toStringList } from './frontmatter';

// Regras do Obsidian: letras (Unicode), dígitos, `_`, `-` e `/`; ao menos um caractere não numérico;
// precedida de início de linha ou espaço.
const INLINE_TAG_RE = /(?<=^|\s)#([\p{L}\p{N}_\-/]+)/gmu;

export function normalizeTag(tag: string): string | null {
  const cleaned = tag.trim().replace(/^#+/, '').replace(/\/+$/, '');
  if (!cleaned || !/^[\p{L}\p{N}_\-/]+$/u.test(cleaned)) return null;
  if (/^[\p{N}/]+$/u.test(cleaned)) return null;
  return cleaned;
}

export function extractInlineTags(markdown: string): string[] {
  const masked = maskNonProse(markdown);
  const tags: string[] = [];
  for (const match of masked.matchAll(INLINE_TAG_RE)) {
    const tag = normalizeTag(match[1]!);
    if (tag) tags.push(tag);
  }
  return tags;
}

export function frontmatterTags(data: Record<string, unknown> | null): string[] {
  if (!data) return [];
  const values = [...toStringList(data.tags), ...toStringList(data.tag)];
  return values
    .flatMap((value) => value.split(/\s+/))
    .map(normalizeTag)
    .filter((tag): tag is string => tag !== null);
}

/** União sem duplicatas (comparação sem maiúsculas), preservando a primeira grafia. */
export function uniqueTags(...lists: string[][]): string[] {
  const seen = new Map<string, string>();
  for (const tag of lists.flat()) {
    const key = tag.toLocaleLowerCase('und');
    if (!seen.has(key)) seen.set(key, tag);
  }
  return [...seen.values()];
}
