import { FileTextIcon, HashIcon } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { requireSession } from '@/lib/auth/guard';
import { getDb } from '@/lib/db';
import { listTags, searchNotes, type SearchHit, type TagCount } from '@/lib/index/queries';
import { log } from '@/lib/log/logger';
import { noteHref } from '@/lib/notes/href';
import { cn } from '@/lib/utils';
import { dirname } from '@/lib/vault/paths';

export const metadata: Metadata = { title: 'Tags' };

const NOTES_PER_TAG = 50;

type Props = { searchParams: Promise<{ tag?: string }> };

export default async function TagsPage({ searchParams }: Props) {
  await requireSession();
  const { tag } = await searchParams;
  const selected = tag?.trim().slice(0, 100) || null;
  const db = getDb();

  let tags: TagCount[] = [];
  let notes: SearchHit[] = [];
  let failed = false;
  if (db) {
    try {
      [tags, notes] = await Promise.all([
        listTags(db),
        selected ? searchNotes(db, { q: '', tag: selected, limit: NOTES_PER_TAG }) : [],
      ]);
    } catch (error) {
      failed = true;
      log('error', 'tags.page_failed', {
        errorClass: error instanceof Error ? error.name : 'unknown',
      });
    }
  }
  const selectedCount = tags.find((item) => item.tag.toLowerCase() === selected?.toLowerCase());

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-4xl space-y-6 px-6 py-10">
        <header>
          <h1 className="text-2xl font-semibold tracking-tight">Tags</h1>
          <p className="text-muted-foreground text-sm">
            Do frontmatter (<code>tags:</code>) e do texto (<code>#tag</code>), sem diferenciar
            maiúsculas.
          </p>
        </header>

        {!db ? (
          <p className="rounded-lg border border-dashed p-4 text-sm">
            A página de tags usa o índice derivado. Configure <code>DATABASE_URL</code> e rode{' '}
            <code>npm run db:migrate</code> (docs/DEPLOYMENT.md).
          </p>
        ) : failed ? (
          <p role="alert" className="text-destructive text-sm">
            O índice está indisponível agora. Tente de novo em instantes.
          </p>
        ) : tags.length === 0 ? (
          <p className="text-muted-foreground text-sm">
            Nenhuma tag no índice. Se você acabou de configurar o banco, use “Sincronizar índice” no
            Início.
          </p>
        ) : (
          <ul className="flex flex-wrap gap-2" aria-label="Todas as tags">
            {tags.map((item) => {
              const active = item.tag.toLowerCase() === selected?.toLowerCase();
              return (
                <li key={item.tag}>
                  <Link
                    href={`/tags?tag=${encodeURIComponent(item.tag)}`}
                    aria-current={active ? 'page' : undefined}
                    className={cn(
                      'hover:bg-muted inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-sm',
                      active && 'bg-accent text-accent-foreground border-transparent',
                    )}
                  >
                    <HashIcon className="size-3.5" />
                    {item.tag}
                    <span className="text-muted-foreground text-xs">{item.count}</span>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}

        {selected && db && !failed ? (
          <section className="space-y-3" aria-labelledby="tag-notes">
            <h2 id="tag-notes" className="flex items-center gap-1 text-sm font-semibold">
              <HashIcon className="size-4" />
              {selected} · {notes.length} {notes.length === 1 ? 'nota' : 'notas'}
              {selectedCount && selectedCount.count > notes.length
                ? ` (mostrando ${notes.length} de ${selectedCount.count})`
                : ''}
            </h2>
            {notes.length === 0 ? (
              <p className="text-muted-foreground text-sm">Nenhuma nota com esta tag.</p>
            ) : (
              <ul className="divide-y rounded-lg border">
                {notes.map((note) => (
                  <li key={note.path}>
                    <Link
                      href={noteHref(note.path)}
                      className="hover:bg-muted flex items-center gap-2 px-4 py-2 text-sm"
                    >
                      <FileTextIcon className="text-muted-foreground size-4 shrink-0" />
                      <span className="truncate">{note.title}</span>
                      <span className="text-muted-foreground ml-auto truncate text-xs">
                        {dirname(note.path) || 'raiz'}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </section>
        ) : null}
      </div>
    </div>
  );
}
