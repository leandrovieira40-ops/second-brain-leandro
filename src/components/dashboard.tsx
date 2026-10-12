'use client';

import { FileTextIcon, InboxIcon, PlusIcon, TriangleAlertIcon } from 'lucide-react';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { listDraftPaths } from '@/lib/editor/drafts';
import { INBOX_FOLDER } from '@/lib/notes/types';
import { noteName } from '@/lib/vault/paths';
import { noteHref, useShell, useVault } from './vault-context';

/** Painel inicial: somente indicadores calculados a partir de dados reais do vault e do navegador. */
export function Dashboard() {
  const { tree, error: vaultError } = useVault();
  const { openNewNote } = useShell();
  const [drafts, setDrafts] = useState<string[]>([]);
  // eslint-disable-next-line react-hooks/set-state-in-effect -- localStorage só existe no cliente
  useEffect(() => setDrafts(listDraftPaths().sort()), []);

  const inbox = tree.notes.filter((path) => path.startsWith(`${INBOX_FOLDER}/`));

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-4xl space-y-8 px-6 py-10">
        <header className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Início</h1>
            <p className="text-muted-foreground text-sm">
              {tree.notes.length} {tree.notes.length === 1 ? 'nota' : 'notas'} ·{' '}
              {tree.folders.length} {tree.folders.length === 1 ? 'pasta' : 'pastas'} ·{' '}
              {tree.attachments.length} {tree.attachments.length === 1 ? 'anexo' : 'anexos'}
            </p>
          </div>
          <Button onClick={openNewNote}>
            <PlusIcon /> Nova nota <kbd className="ml-1 text-xs opacity-70">Alt+N</kbd>
          </Button>
        </header>

        {vaultError ? (
          <section
            role="alert"
            className="border-destructive/40 bg-destructive/5 rounded-lg border p-4 text-sm"
          >
            <p className="font-medium">Não foi possível ler o vault.</p>
            <p className="text-muted-foreground mt-1">{vaultError}</p>
            <p className="text-muted-foreground mt-1">
              Confira as variáveis de ambiente (docs/DEPLOYMENT.md).
            </p>
          </section>
        ) : null}

        {drafts.length > 0 ? (
          <section className="bg-warning-surface rounded-lg border p-4">
            <h2 className="flex items-center gap-2 text-sm font-semibold">
              <TriangleAlertIcon className="text-warning size-4" /> Alterações não sincronizadas
              neste navegador
            </h2>
            <p className="text-muted-foreground mt-1 text-sm">
              Abra cada nota para restaurar ou descartar o rascunho. Elas ainda não estão no vault.
            </p>
            <ul className="mt-2 space-y-1 text-sm">
              {drafts.map((path) => (
                <li key={path}>
                  <Link className="text-primary underline underline-offset-2" href={noteHref(path)}>
                    {path}
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        <section className="space-y-3">
          <h2 className="flex items-center gap-2 text-sm font-semibold">
            <InboxIcon className="size-4" /> Inbox ({inbox.length})
          </h2>
          {inbox.length === 0 ? (
            <p className="text-muted-foreground text-sm">
              Nada aguardando processamento em <code>{INBOX_FOLDER}</code>. Capturas rápidas entram
              aqui.
            </p>
          ) : (
            <ul className="divide-y rounded-lg border">
              {inbox.slice(0, 20).map((path) => (
                <li key={path}>
                  <Link
                    href={noteHref(path)}
                    className="hover:bg-muted flex items-center gap-2 px-4 py-2 text-sm"
                  >
                    <FileTextIcon className="text-muted-foreground size-4" />
                    {noteName(path)}
                  </Link>
                </li>
              ))}
              {inbox.length > 20 ? (
                <li className="text-muted-foreground px-4 py-2 text-sm">
                  e mais {inbox.length - 20} na barra lateral.
                </li>
              ) : null}
            </ul>
          )}
        </section>

        {tree.notes.length === 0 && !vaultError ? (
          <section className="rounded-lg border border-dashed p-6 text-sm">
            <p className="font-medium">Seu vault ainda não tem notas.</p>
            <p className="text-muted-foreground mt-1">
              Crie a primeira nota, ou envie a estrutura de <code>vault-template/</code> para o
              repositório do vault (veja docs/VAULT_SYNC.md).
            </p>
          </section>
        ) : null}
      </div>
    </div>
  );
}
