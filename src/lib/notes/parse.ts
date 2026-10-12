import { noteName } from '@/lib/vault/paths';
import { parseFrontmatter, toStringList } from './frontmatter';
import { isUlid } from './ids';
import { extractInlineTags, frontmatterTags, uniqueTags } from './tags';
import { extractWikilinks, type Wikilink } from './wikilinks';

export interface ParsedNote {
  path: string;
  title: string;
  type: string;
  id: string | null;
  frontmatter: Record<string, unknown> | null;
  frontmatterError: string | null;
  tags: string[];
  aliases: string[];
  links: Wikilink[];
}

/** Análise pura de uma nota. Nunca lança por causa do conteúdo do usuário. */
export function parseNote(path: string, content: string): ParsedNote {
  const { data, error, body } = parseFrontmatter(content);
  const title =
    typeof data?.title === 'string' && data.title.trim() ? data.title.trim() : noteName(path);
  const type = typeof data?.type === 'string' && data.type.trim() ? data.type.trim() : 'note';
  const id = isUlid(data?.id) ? data.id : typeof data?.id === 'string' && data.id ? data.id : null;
  return {
    path,
    title,
    type,
    id,
    frontmatter: data,
    frontmatterError: error,
    tags: uniqueTags(frontmatterTags(data), extractInlineTags(body)),
    aliases: [...toStringList(data?.aliases), ...toStringList(data?.alias)],
    links: extractWikilinks(body),
  };
}
