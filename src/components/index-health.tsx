'use client';

import { DatabaseIcon, LinkIcon, RefreshCwIcon, UnlinkIcon } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { ApiError, indexStatus, syncIndex, type IndexStatusDto } from '@/lib/client/api';
import { noteName } from '@/lib/vault/paths';
import { noteHref, useShell, useVault } from './vault-context';

const when = (iso: string | null) =>
  iso ? new Date(iso).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' }) : 'nunca';

/** Estado do índice derivado e saúde do vault (links quebrados, notas órfãs). Dados reais, sem estimativas. */
export function IndexHealth() {
  const router = useRouter();
  const { searchAvailable } = useVault();
  const { openNewNote } = useShell();
  const [status, setStatus] = useState<IndexStatusDto | null>(null);
  const [message, setMessage] = useState<{ text: string; error: boolean } | null>(null);
  const [syncing, setSyncing] = useState(false);

  const load = useCallback(async () => {
    try {
      setStatus(await indexStatus());
    } catch (error) {
      setMessage({
        text:
          error instanceof ApiError ? error.message : 'Sem conexão: estado do índice desconhecido.',
        error: true,
      });
    }
  }, []);

  useEffect(() => {
    if (!searchAvailable) return;
    let active = true;
    indexStatus().then(
      (result) => active && setStatus(result),
      (error: unknown) =>
        active &&
        setMessage({
          text:
            error instanceof ApiError
              ? error.message
              : 'Sem conexão: estado do índice desconhecido.',
          error: true,
        }),
    );
    return () => {
      active = false;
    };
  }, [searchAvailable]);

  async function sync() {
    setSyncing(true);
    setMessage(null);
    try {
      const result = await syncIndex();
      setMessage({
        text: `Índice sincronizado: ${result.total} notas (${result.added} novas, ${result.updated} atualizadas, ${result.removed} removidas).`,
        error: false,
      });
      await load();
      router.refresh();
    } catch (error) {
      setMessage({
        text:
          error instanceof ApiError ? error.message : 'Sem conexão: o índice não foi sincronizado.',
        error: true,
      });
    }
    setSyncing(false);
  }

  if (!searchAvailable) {
    return (
      <section className="rounded-lg border border-dashed p-4 text-sm" aria-label="Índice">
        <h2 className="flex items-center gap-2 font-semibold">
          <DatabaseIcon className="size-4" /> Índice de busca desativado
        </h2>
        <p className="text-muted-foreground mt-1">
          Busca no conteúdo, links de entrada e tags precisam do índice (PostgreSQL). Sem ele, tudo
          o mais funciona e a busca (Ctrl+K) usa só os nomes de arquivo. Veja docs/DEPLOYMENT.md.
        </p>
      </section>
    );
  }

  const ready = status?.available ? status : null;
  return (
    <section className="space-y-4 rounded-lg border p-4" aria-label="Índice">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 text-sm font-semibold">
            <DatabaseIcon className="size-4" /> Índice de busca
          </h2>
          <p className="text-muted-foreground mt-1 text-sm">
            {ready
              ? `${ready.noteCount} ${ready.noteCount === 1 ? 'nota indexada' : 'notas indexadas'} · atualizado em ${when(ready.indexedAt)}`
              : status
                ? 'Índice indisponível.'
                : 'Carregando…'}
          </p>
        </div>
        <Button size="sm" variant="outline" onClick={sync} disabled={syncing}>
          <RefreshCwIcon className={syncing ? 'animate-spin' : undefined} />
          {syncing ? 'Sincronizando…' : 'Sincronizar índice'}
        </Button>
      </div>
      {ready?.lastError ? (
        <p role="alert" className="bg-warning-surface rounded p-2 text-sm">
          {ready.lastError}
        </p>
      ) : null}
      {message ? (
        <p
          role={message.error ? 'alert' : 'status'}
          className={message.error ? 'text-destructive text-sm' : 'text-sm'}
        >
          {message.text}
        </p>
      ) : null}

      {ready ? (
        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-2">
            <h3 className="flex items-center gap-1.5 text-xs font-semibold tracking-wide uppercase">
              <UnlinkIcon className="size-3.5" /> Links sem destino ({ready.brokenLinks.length}
              {ready.brokenLinks.length >= 20 ? '+' : ''})
            </h3>
            {ready.brokenLinks.length === 0 ? (
              <p className="text-muted-foreground text-sm">Nenhum link quebrado.</p>
            ) : (
              <ul className="space-y-1 text-sm">
                {ready.brokenLinks.map((link) => (
                  <li key={`${link.sourcePath}:${link.line}:${link.targetRaw}`} className="min-w-0">
                    <Link href={noteHref(link.sourcePath)} className="wikilink">
                      {noteName(link.sourcePath)}
                    </Link>{' '}
                    → <span className="wikilink-broken">{link.targetRaw}</span>{' '}
                    <button
                      type="button"
                      className="text-primary text-xs underline underline-offset-2"
                      onClick={() => openNewNote({ title: link.targetRaw.split('/').pop() })}
                    >
                      criar nota
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <div className="space-y-2">
            <h3 className="flex items-center gap-1.5 text-xs font-semibold tracking-wide uppercase">
              <LinkIcon className="size-3.5" /> Notas sem conexões ({ready.orphans.length}
              {ready.orphans.length >= 20 ? '+' : ''})
            </h3>
            {ready.orphans.length === 0 ? (
              <p className="text-muted-foreground text-sm">Todas as notas têm algum link.</p>
            ) : (
              <ul className="space-y-1 text-sm">
                {ready.orphans.map((path) => (
                  <li key={path}>
                    <Link href={noteHref(path)} className="wikilink" title={path}>
                      {noteName(path)}
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      ) : null}
    </section>
  );
}
