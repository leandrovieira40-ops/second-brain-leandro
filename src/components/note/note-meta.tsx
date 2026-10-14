'use client';

import { CalendarIcon, CheckIcon, ChevronDownIcon, HashIcon } from 'lucide-react';
import Link from 'next/link';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { folderDisplay, folderOptions } from '@/lib/notes/folders';
import type { ParsedNote } from '@/lib/notes/parse';
import { formatIsoDate } from '@/lib/notes/property-display';
import { cn } from '@/lib/utils';

const chip =
  'bg-muted text-muted-foreground inline-flex items-center gap-1 rounded-full px-2.5 py-0.5';

/**
 * Linha discreta abaixo do título: a pasta (clique para mover a nota), a data e as tags. O resto
 * fica em "Detalhes da nota".
 */
export function NoteMeta({
  note,
  folder,
  folders,
  disabled,
  onMove,
}: {
  note: ParsedNote;
  folder: string;
  folders: readonly string[];
  disabled?: boolean;
  onMove: (folder: string) => void;
}) {
  const created = formatIsoDate(note.frontmatter?.created);
  const updated = formatIsoDate(note.frontmatter?.updated);
  const current = folderDisplay(folder);

  return (
    <div className="mt-3 mb-2 flex flex-wrap items-center gap-2 text-xs" data-testid="note-meta">
      <DropdownMenu>
        <DropdownMenuTrigger
          disabled={disabled}
          aria-label={`Pasta: ${current.label}. Clique para mover a nota`}
          title="Mover para outra pasta"
          className={cn(
            chip,
            'hover:text-foreground hover:bg-accent cursor-pointer disabled:cursor-default disabled:opacity-60',
          )}
        >
          <span aria-hidden="true">{current.icon}</span>
          {current.label}
          <ChevronDownIcon className="size-3" />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="max-h-[60vh] w-72 overflow-y-auto">
          <p className="text-muted-foreground px-2.5 pt-1.5 pb-1 text-xs">Mover a nota para…</p>
          {folderOptions(folders, folder).map((option) => {
            const display = folderDisplay(option);
            const depth = option ? option.split('/').length - 1 : 0;
            const selected = option === folder;
            return (
              <DropdownMenuItem
                key={option}
                disabled={selected}
                onSelect={() => onMove(option)}
                style={{ paddingLeft: `${0.625 + depth * 1}rem` }}
                className="items-start"
              >
                <span aria-hidden="true">{display.icon}</span>
                <span className="min-w-0 flex-1">
                  <span className="block">{display.label}</span>
                  {display.hint ? (
                    <span className="text-muted-foreground block text-xs">{display.hint}</span>
                  ) : null}
                </span>
                {selected ? <CheckIcon className="mt-0.5" /> : null}
              </DropdownMenuItem>
            );
          })}
        </DropdownMenuContent>
      </DropdownMenu>
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
