import { CalendarIcon, HashIcon } from 'lucide-react';
import Link from 'next/link';
import { NOTE_TYPE_INFO } from '@/lib/notes/folders';
import type { ParsedNote } from '@/lib/notes/parse';
import { formatIsoDate } from '@/lib/notes/property-display';
import { isNoteType, NOTE_TYPE_LABELS } from '@/lib/notes/types';

/** Linha discreta abaixo do título: tipo, datas e tags (o resto fica em "Detalhes da nota"). */
export function NoteMeta({ note }: { note: ParsedNote }) {
  const created = formatIsoDate(note.frontmatter?.created);
  const updated = formatIsoDate(note.frontmatter?.updated);
  const type = isNoteType(note.type) ? note.type : null;
  const chip =
    'bg-muted text-muted-foreground inline-flex items-center gap-1 rounded-full px-2.5 py-0.5';

  return (
    <div className="mt-3 mb-2 flex flex-wrap items-center gap-2 text-xs" data-testid="note-meta">
      {type && type !== 'note' ? (
        <span className={chip}>
          {NOTE_TYPE_INFO[type]?.icon ? (
            <span aria-hidden="true">{NOTE_TYPE_INFO[type]?.icon}</span>
          ) : null}
          {NOTE_TYPE_LABELS[type]}
        </span>
      ) : null}
      {created ? (
        <span className={chip}>
          <CalendarIcon className="size-3" />
          {updated && updated !== created
            ? `Criada em ${created} · editada em ${updated}`
            : `Criada em ${created}`}
        </span>
      ) : null}
      {note.tags.map((tag) => (
        <Link
          key={tag}
          href={`/tags?tag=${encodeURIComponent(tag)}`}
          className={`${chip} hover:text-foreground`}
        >
          <HashIcon className="size-3" />
          {tag}
        </Link>
      ))}
    </div>
  );
}
