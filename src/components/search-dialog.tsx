'use client';

import { FileTextIcon, SearchIcon } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useEffect, useId, useMemo, useState } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { ApiError, searchNotes, type SearchHitDto } from '@/lib/client/api';
import { splitHighlights } from '@/lib/notes/highlight';
import { suggestNotes } from '@/lib/notes/suggest';
import { dirname, noteName } from '@/lib/vault/paths';
import { cn } from '@/lib/utils';
import { noteHref, useVault } from './vault-context';

interface Item {
  path: string;
  title: string;
  folder: string;
  snippet: string | null;
}

type Remote =
  | { query: string; kind: 'hits'; hits: SearchHitDto[] }
  | { query: string; kind: 'unavailable' }
  | { query: string; kind: 'error'; message: string };

const DEBOUNCE_MS = 150;

/**
 * Busca global (Ctrl+K). Nomes de arquivo aparecem na hora (árvore já carregada); o conteúdo vem do
 * índice. Sem índice, a busca continua funcionando só pelos nomes — e diz isso.
 */
export function SearchDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const router = useRouter();
  const { tree, searchAvailable } = useVault();
  const [query, setQuery] = useState('');
  const [remote, setRemote] = useState<Remote | null>(null);
  const [active, setActive] = useState(0);
  const listId = useId();
  const trimmed = query.trim();

  useEffect(() => {
    if (!open || !searchAvailable || !trimmed) return;
    const controller = new AbortController();
    const timer = setTimeout(() => {
      searchNotes({ q: trimmed, limit: 20 }, controller.signal).then(
        (result) =>
          setRemote(
            result.available
              ? { query: trimmed, kind: 'hits', hits: result.hits }
              : { query: trimmed, kind: 'unavailable' },
          ),
        (error: unknown) => {
          if (controller.signal.aborted) return;
          setRemote({
            query: trimmed,
            kind: 'error',
            message: error instanceof ApiError ? error.message : 'Sem conexão.',
          });
        },
      );
    }, DEBOUNCE_MS);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [open, searchAvailable, trimmed]);

  // Só vale o resultado da consulta atual (respostas atrasadas de consultas antigas são ignoradas).
  const current = remote?.query === trimmed ? remote : null;
  const items = useMemo<Item[]>(() => {
    if (!trimmed) return [];
    const byName = trimmed.startsWith('#')
      ? []
      : suggestNotes(trimmed, tree.notes, 8).map((suggestion) => ({
          path: suggestion.path,
          title: suggestion.label,
          folder: suggestion.folder,
          snippet: null,
        }));
    if (current?.kind !== 'hits') return byName;
    const fromIndex = current.hits.map((hit) => ({
      path: hit.path,
      title: hit.title || noteName(hit.path),
      folder: dirname(hit.path),
      snippet: hit.snippet.trim() ? hit.snippet : null,
    }));
    const seen = new Set(fromIndex.map((item) => item.path));
    return [...fromIndex, ...byName.filter((item) => !seen.has(item.path))].slice(0, 30);
  }, [trimmed, tree.notes, current]);

  const selected = Math.min(active, Math.max(items.length - 1, 0));
  const status = !trimmed
    ? 'Digite para buscar. Use #tag para filtrar por tag.'
    : !searchAvailable || current?.kind === 'unavailable'
      ? 'Buscando só nos nomes: a busca no conteúdo precisa do índice (DATABASE_URL).'
      : current?.kind === 'error'
        ? `Busca no conteúdo indisponível agora (${current.message}). Mostrando nomes de arquivo.`
        : !current
          ? 'Buscando no conteúdo…'
          : items.length === 0
            ? 'Nada encontrado.'
            : `${items.length} resultado${items.length > 1 ? 's' : ''}.`;

  function go(item: Item | undefined) {
    if (!item) return;
    onOpenChange(false);
    router.push(noteHref(item.path));
  }

  function onKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setActive((index) => Math.min(index + 1, items.length - 1));
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      setActive((index) => Math.max(index - 1, 0));
    } else if (event.key === 'Enter') {
      event.preventDefault();
      go(items[selected]);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="top-[12vh] max-w-2xl translate-y-0 gap-0 p-0">
        <DialogTitle className="sr-only">Buscar no vault</DialogTitle>
        <DialogDescription className="sr-only">
          Busca por nome e conteúdo. Setas para navegar, Enter para abrir.
        </DialogDescription>
        <div className="flex items-center gap-2 border-b px-4 py-3">
          <SearchIcon className="text-muted-foreground size-4 shrink-0" />
          <input
            autoFocus
            type="search"
            role="combobox"
            aria-expanded={items.length > 0}
            aria-controls={listId}
            aria-activedescendant={items.length ? `${listId}-${selected}` : undefined}
            aria-label="Buscar notas"
            placeholder="Buscar notas…"
            className="placeholder:text-muted-foreground min-w-0 flex-1 bg-transparent text-base outline-none"
            value={query}
            maxLength={200}
            onChange={(event) => {
              setQuery(event.target.value);
              setActive(0);
            }}
            onKeyDown={onKeyDown}
          />
        </div>
        <ul
          id={listId}
          role="listbox"
          aria-label="Resultados"
          className="max-h-[60vh] overflow-y-auto"
        >
          {items.map((item, index) => (
            <li
              key={item.path}
              id={`${listId}-${index}`}
              role="option"
              aria-selected={index === selected}
              className={cn(
                'cursor-pointer border-b px-4 py-2 last:border-b-0',
                index === selected && 'bg-accent text-accent-foreground',
              )}
              onMouseEnter={() => setActive(index)}
              onClick={() => go(item)}
            >
              <div className="flex items-center gap-2 text-sm">
                <FileTextIcon className="text-muted-foreground size-4 shrink-0" />
                <span className="truncate font-medium">{item.title}</span>
                <span className="text-muted-foreground ml-auto truncate text-xs">
                  {item.folder || 'raiz'}
                </span>
              </div>
              {item.snippet ? (
                <p className="text-muted-foreground mt-1 line-clamp-2 pl-6 text-xs">
                  {splitHighlights(item.snippet).map((segment, i) =>
                    segment.mark ? (
                      <mark
                        key={i}
                        className="bg-warning-surface text-foreground rounded-sm px-0.5"
                      >
                        {segment.text}
                      </mark>
                    ) : (
                      <span key={i}>{segment.text}</span>
                    ),
                  )}
                </p>
              ) : null}
            </li>
          ))}
        </ul>
        <p role="status" className="text-muted-foreground border-t px-4 py-2 text-xs">
          {status}
        </p>
      </DialogContent>
    </Dialog>
  );
}
