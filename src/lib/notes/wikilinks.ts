import { maskNonProse } from './mask';

export interface Wikilink {
  /** Texto original completo, ex.: `![[Nota#Seção|apelido]]`. */
  raw: string;
  /** Destino sem subcaminho, ex.: `Nota` (vazio para links à própria nota: `[[#Seção]]`). */
  target: string;
  /** Cabeçalho (`#Seção`) ou bloco (`#^id`), sem o `#`. */
  subpath: string | null;
  alias: string | null;
  embed: boolean;
  /** Offset no texto analisado. */
  start: number;
  end: number;
  /** Linha (1-based). */
  line: number;
}

const WIKILINK_RE = /(!?)\[\[([^[\]\n]+?)\]\]/g;

export function parseWikilinkInner(inner: string): Pick<Wikilink, 'target' | 'subpath' | 'alias'> {
  // Em tabelas o Obsidian usa `\|` para separar o apelido.
  const pipe = inner.search(/\\?\|/);
  let destination = inner;
  let alias: string | null = null;
  if (pipe !== -1) {
    destination = inner.slice(0, pipe);
    alias =
      inner
        .slice(pipe)
        .replace(/^\\?\|/, '')
        .trim() || null;
  }
  const hash = destination.indexOf('#');
  const target = (hash === -1 ? destination : destination.slice(0, hash)).trim().replace(/\\$/, '');
  const subpath = hash === -1 ? null : destination.slice(hash + 1).trim() || null;
  return { target, subpath, alias };
}

export function extractWikilinks(markdown: string): Wikilink[] {
  const masked = maskNonProse(markdown);
  const links: Wikilink[] = [];
  let line = 1;
  let lastIndex = 0;
  for (const match of masked.matchAll(WIKILINK_RE)) {
    for (let i = lastIndex; i < match.index; i++) if (masked[i] === '\n') line++;
    lastIndex = match.index;
    const raw = markdown.slice(match.index, match.index + match[0].length);
    const parsed = parseWikilinkInner(match[2]!);
    if (!parsed.target && !parsed.subpath) continue;
    links.push({
      raw,
      ...parsed,
      embed: match[1] === '!',
      start: match.index,
      end: match.index + match[0].length,
      line,
    });
  }
  return links;
}
