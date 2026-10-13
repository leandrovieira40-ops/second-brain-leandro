'use client';

import { CornerDownLeftIcon } from 'lucide-react';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { ApiError, noteBacklinks, type BacklinkDto } from '@/lib/client/api';
import { noteHref, useVault } from '../vault-context';

type State =
  | { path: string; kind: 'loaded'; backlinks: BacklinkDto[] }
  | { path: string; kind: 'unavailable' }
  | { path: string; kind: 'error'; message: string };

/** Notas que apontam para esta (do índice derivado — reflete o que já foi salvo). */
export function NoteBacklinks({ path }: { path: string }) {
  const { searchAvailable } = useVault();
  const [state, setState] = useState<State | null>(null);

  useEffect(() => {
    if (!searchAvailable) return;
    const controller = new AbortController();
    noteBacklinks(path, controller.signal).then(
      (result) =>
        setState(
          result.available
            ? { path, kind: 'loaded', backlinks: result.backlinks }
            : { path, kind: 'unavailable' },
        ),
      (error: unknown) => {
        if (controller.signal.aborted) return;
        setState({
          path,
          kind: 'error',
          message: error instanceof ApiError ? error.message : 'Sem conexão.',
        });
      },
    );
    return () => controller.abort();
  }, [path, searchAvailable]);

  const current = state?.path === path ? state : null;
  const count = current?.kind === 'loaded' ? ` (${current.backlinks.length})` : '';

  return (
    <section aria-labelledby="backlinks-heading" className="space-y-2">
      <h2
        id="backlinks-heading"
        className="text-muted-foreground text-xs font-semibold tracking-wide uppercase"
      >
        Links de entrada{count}
      </h2>
      {!searchAvailable || current?.kind === 'unavailable' ? (
        <p className="text-muted-foreground text-xs">
          Disponível com o índice configurado (DATABASE_URL).
        </p>
      ) : !current ? (
        <p className="text-muted-foreground text-xs">Carregando…</p>
      ) : current.kind === 'error' ? (
        <p className="text-destructive text-xs" role="alert">
          {current.message}
        </p>
      ) : current.backlinks.length === 0 ? (
        <p className="text-muted-foreground text-xs">Nenhuma nota aponta para esta.</p>
      ) : (
        <ul className="space-y-2">
          {current.backlinks.map((backlink) => (
            <li key={`${backlink.sourcePath}:${backlink.line}`} className="space-y-0.5">
              <Link
                href={noteHref(backlink.sourcePath)}
                className="wikilink flex items-center gap-1.5 break-words"
                title={backlink.sourcePath}
              >
                <CornerDownLeftIcon className="text-muted-foreground size-3.5 shrink-0" />
                {backlink.sourceTitle}
              </Link>
              {backlink.context ? (
                <p className="text-muted-foreground line-clamp-2 pl-5 text-xs">
                  {backlink.context}
                </p>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
