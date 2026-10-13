import { parseFrontmatter } from '@/lib/notes/frontmatter';
import { parseNote } from '@/lib/notes/parse';

/** O que o índice guarda de uma nota (derivado do Markdown; reconstruível a qualquer momento). */
export interface NoteRecord {
  path: string;
  blobSha: string;
  title: string;
  type: string;
  noteId: string | null;
  tags: string[];
  aliases: string[];
  keywords: string;
  frontmatter: Record<string, unknown> | null;
  body: string;
  links: LinkRecord[];
}

export interface LinkRecord {
  targetRaw: string;
  subpath: string | null;
  embed: boolean;
  line: number;
  context: string;
}

const MAX_CONTEXT = 300;

export function toNoteRecord(path: string, blobSha: string, content: string): NoteRecord {
  const note = parseNote(path, content);
  const { body } = parseFrontmatter(content);
  const lines = body.split('\n');
  return {
    path,
    blobSha,
    title: note.title,
    type: note.type,
    noteId: note.id,
    tags: note.tags,
    aliases: note.aliases,
    keywords: [...note.aliases, ...note.tags].join(' '),
    // JSON só com o que o YAML produziu (datas continuam strings, ADR-0012).
    frontmatter: note.frontmatter,
    body,
    links: note.links.map((link) => {
      const text = (lines[link.line - 1] ?? '').trim();
      return {
        targetRaw: link.target,
        subpath: link.subpath,
        embed: link.embed,
        line: link.line,
        context: text.length > MAX_CONTEXT ? `${text.slice(0, MAX_CONTEXT)}…` : text,
      };
    }),
  };
}
