'use client';

import { HashIcon } from 'lucide-react';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { listTags } from '@/lib/client/api';
import { cn } from '@/lib/utils';
import { useVault } from './vault-context';

const MAX_TAGS = 40;

/** Painel de tags da barra lateral (como o do Obsidian): cada tag com o número de notas. */
export function TagPane({
  activeTag,
  onNavigate,
}: {
  activeTag: string | null;
  onNavigate: () => void;
}) {
  const { searchAvailable } = useVault();
  const [tags, setTags] = useState<{ tag: string; count: number }[] | null>(null);

  useEffect(() => {
    if (!searchAvailable) return;
    let alive = true;
    listTags().then(
      (result) => alive && setTags(result.available ? result.tags : []),
      () => alive && setTags([]),
    );
    return () => {
      alive = false;
    };
  }, [searchAvailable]);

  if (!searchAvailable || !tags || tags.length === 0) return null;
  return (
    <section className="border-t px-2 pt-3 pb-2" aria-label="Tags do vault">
      <h2 className="text-muted-foreground flex items-center justify-between px-2 pb-1 text-xs font-semibold tracking-wide uppercase">
        <span className="flex items-center gap-1.5">
          <HashIcon className="size-3.5" /> Tags
        </span>
        <span className="font-normal normal-case">{tags.length}</span>
      </h2>
      <ul className="space-y-0.5">
        {tags.slice(0, MAX_TAGS).map((item) => (
          <li key={item.tag}>
            <Link
              href={`/tags?tag=${encodeURIComponent(item.tag)}`}
              onClick={onNavigate}
              aria-current={
                item.tag.toLowerCase() === activeTag?.toLowerCase() ? 'page' : undefined
              }
              className={cn(
                'hover:bg-muted flex items-center justify-between gap-2 rounded px-2 py-0.5 text-sm',
                item.tag.toLowerCase() === activeTag?.toLowerCase() &&
                  'bg-accent text-accent-foreground',
              )}
            >
              <span className="truncate">#{item.tag}</span>
              <span className="text-muted-foreground text-xs tabular-nums">{item.count}</span>
            </Link>
          </li>
        ))}
        {tags.length > MAX_TAGS ? (
          <li>
            <Link
              href="/tags"
              onClick={onNavigate}
              className="text-muted-foreground px-2 text-xs underline"
            >
              ver todas ({tags.length})
            </Link>
          </li>
        ) : null}
      </ul>
    </section>
  );
}
