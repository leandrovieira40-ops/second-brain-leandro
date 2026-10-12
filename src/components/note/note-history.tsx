'use client';

import { HistoryIcon } from 'lucide-react';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { ApiError, noteHistory, readVersion, type CommitDto } from '@/lib/client/api';

const when = (iso: string) =>
  iso ? new Date(iso).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' }) : '—';

/** Versões da nota pelo histórico do Git. Carrega sob demanda (economiza chamadas à API). */
export function NoteHistory({
  path,
  onRestore,
}: {
  path: string;
  onRestore: (commit: CommitDto) => Promise<void>;
}) {
  const [state, setState] = useState<
    | { kind: 'idle' }
    | { kind: 'loading' }
    | { kind: 'unsupported' }
    | { kind: 'error'; message: string }
    | { kind: 'loaded'; commits: CommitDto[] }
  >({ kind: 'idle' });
  const [viewing, setViewing] = useState<{
    commit: CommitDto;
    content: string | null;
    error?: string;
  } | null>(null);

  async function load() {
    setState({ kind: 'loading' });
    try {
      const result = await noteHistory(path);
      setState(
        result.supported ? { kind: 'loaded', commits: result.commits } : { kind: 'unsupported' },
      );
    } catch (error) {
      setState({
        kind: 'error',
        message: error instanceof ApiError ? error.message : 'Sem conexão.',
      });
    }
  }

  async function view(commit: CommitDto) {
    setViewing({ commit, content: null });
    try {
      const version = await readVersion(path, commit.sha);
      setViewing({ commit, content: version.content });
    } catch (error) {
      setViewing({
        commit,
        content: null,
        error: error instanceof ApiError ? error.message : 'Sem conexão.',
      });
    }
  }

  return (
    <section aria-labelledby="history-heading" className="space-y-2">
      <h2
        id="history-heading"
        className="text-muted-foreground flex items-center gap-1.5 text-xs font-semibold tracking-wide uppercase"
      >
        <HistoryIcon className="size-3.5" /> Histórico
      </h2>
      {state.kind === 'idle' ? (
        <Button size="sm" variant="outline" onClick={load}>
          Ver versões anteriores
        </Button>
      ) : null}
      {state.kind === 'loading' ? (
        <p className="text-muted-foreground text-xs">Carregando…</p>
      ) : null}
      {state.kind === 'unsupported' ? (
        <p className="text-muted-foreground text-xs">
          Histórico disponível com o vault no GitHub. Na pasta local, use <code>git log</code> no
          clone.
        </p>
      ) : null}
      {state.kind === 'error' ? (
        <p role="alert" className="text-destructive text-xs">
          {state.message}
        </p>
      ) : null}
      {state.kind === 'loaded' ? (
        state.commits.length === 0 ? (
          <p className="text-muted-foreground text-xs">Nenhuma versão registrada.</p>
        ) : (
          <ol className="space-y-1" aria-label="Versões da nota">
            {state.commits.map((commit, index) => (
              <li key={commit.sha}>
                <button
                  type="button"
                  onClick={() => view(commit)}
                  className="hover:bg-muted w-full rounded px-1.5 py-1 text-left text-xs"
                >
                  <span className="block font-medium">
                    {when(commit.date)}
                    {index === 0 ? ' · atual' : ''}
                  </span>
                  <span className="text-muted-foreground block truncate">{commit.message}</span>
                </button>
              </li>
            ))}
          </ol>
        )
      ) : null}

      <Dialog open={viewing !== null} onOpenChange={(open) => !open && setViewing(null)}>
        <DialogContent className="max-w-3xl">
          <DialogTitle>Versão de {viewing ? when(viewing.commit.date) : ''}</DialogTitle>
          <DialogDescription>{viewing?.commit.message}</DialogDescription>
          {viewing?.error ? (
            <p role="alert" className="text-destructive text-sm">
              {viewing.error}
            </p>
          ) : (
            <pre className="bg-muted max-h-[60vh] overflow-auto rounded p-3 text-xs whitespace-pre-wrap">
              {viewing?.content ?? 'Carregando…'}
            </pre>
          )}
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setViewing(null)}>
              Fechar
            </Button>
            <Button
              disabled={!viewing?.content}
              onClick={async () => {
                if (!viewing) return;
                await onRestore(viewing.commit);
                setViewing(null);
                setState({ kind: 'idle' });
              }}
            >
              Restaurar esta versão
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </section>
  );
}
