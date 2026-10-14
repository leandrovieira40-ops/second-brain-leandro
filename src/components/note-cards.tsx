'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { recentNotes, type RecentNoteDto } from '@/lib/client/api';
import { folderDisplay } from '@/lib/notes/folders';
import { formatIsoDate } from '@/lib/notes/property-display';
import { dirname, noteName } from '@/lib/vault/paths';
import { noteHref, useVault } from './vault-context';

type Card = Pick<RecentNoteDto, 'path' | 'title' | 'excerpt' | 'date'>;

/**
 * Quadro de notas em cartões, como no Google Keep: título, começo do texto e pasta. Os trechos vêm
 * do índice; sem ele, aparecem só os nomes das notas da Caixa de entrada e das recentes.
 */
export function NoteCards({ reload, fallback }: { reload: number; fallback: string[] }) {
  const { tree } = useVault();
  // `undefined`: carregando; `null`: sem índice.
  const [cards, setCards] = useState<Card[] | null | undefined>(undefined);

  useEffect(() => {
    const controller = new AbortController();
    recentNotes(controller.signal)
      .then((result) => setCards(result.available ? result.notes : null))
      .catch(() => {
        if (!controller.signal.aborted) setCards(null);
      });
    return () => controller.abort();
  }, [reload, tree]);

  if (cards === undefined)
    return <p className="text-muted-foreground text-sm">Carregando notas…</p>;
  const existing = new Set(tree.notes);
  const shown: Card[] =
    cards ??
    [...new Set(fallback)]
      .filter((path) => existing.has(path))
      .slice(0, 24)
      .map((path) => ({ path, title: noteName(path), excerpt: '', date: null }));

  if (shown.length === 0) {
    return (
      <p className="text-muted-foreground text-sm">
        Suas notas vão aparecer aqui. Escreva a primeira no quadro acima.
      </p>
    );
  }

  return (
    <ul aria-label="Notas recentes" className="columns-1 gap-4 sm:columns-2 lg:columns-3">
      {shown.map((card) => {
        const folder = folderDisplay(dirname(card.path));
        const date = formatIsoDate(card.date);
        return (
          <li key={card.path} className="mb-4 break-inside-avoid">
            <Link
              href={noteHref(card.path)}
              className="bg-card hover:border-primary/50 block rounded-xl border p-4 shadow-sm transition-colors"
            >
              <h3 className="font-semibold break-words">{card.title}</h3>
              {card.excerpt ? (
                <p className="text-muted-foreground mt-2 line-clamp-6 text-sm leading-relaxed break-words">
                  {card.excerpt}
                </p>
              ) : null}
              <p className="text-muted-foreground mt-3 flex items-center gap-2 text-xs">
                <span className="truncate">
                  <span aria-hidden="true">{folder.icon} </span>
                  {folder.label}
                </span>
                {date ? <span className="ml-auto shrink-0">{date}</span> : null}
              </p>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
