'use client';

import { RotateCcwIcon, Trash2Icon } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { ApiError, purgeFromTrash, restoreFromTrash, type TrashItemDto } from '@/lib/client/api';
import { noteName } from '@/lib/vault/paths';
import { noteHref } from './vault-context';

/** Lixeira: notas em `.trash/` (mesma pasta usada pelo Obsidian). */
export function TrashView({
  initialItems,
  error,
  hasHistory,
}: {
  initialItems: TrashItemDto[];
  error: string | null;
  hasHistory: boolean;
}) {
  const router = useRouter();
  const [items, setItems] = useState(initialItems);
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<{ text: string; href?: string } | null>(null);

  async function restore(item: TrashItemDto) {
    setBusy(item.path);
    try {
      const restored = await restoreFromTrash(item.path);
      setItems((current) => current.filter((entry) => entry.path !== item.path));
      setMessage({ text: `Restaurada em ${restored.path}.`, href: noteHref(restored.path) });
      router.refresh();
    } catch (e) {
      setMessage({ text: e instanceof ApiError ? e.message : 'Sem conexão: nada foi alterado.' });
    }
    setBusy(null);
  }

  async function purge(item: TrashItemDto) {
    const warning = hasHistory
      ? 'Excluir definitivamente? A nota sai da lixeira; o conteúdo ainda poderá ser recuperado pelo histórico do Git do vault.'
      : 'Excluir definitivamente? Na pasta local, só será possível recuperar pelo seu Git, se a nota tiver sido commitada.';
    if (!window.confirm(warning)) return;
    setBusy(item.path);
    try {
      await purgeFromTrash({ trashPath: item.path, expectedSha: item.sha });
      setItems((current) => current.filter((entry) => entry.path !== item.path));
      setMessage({ text: `${noteName(item.originalPath)} foi excluída definitivamente.` });
      router.refresh();
    } catch (e) {
      setMessage({ text: e instanceof ApiError ? e.message : 'Sem conexão: nada foi alterado.' });
    }
    setBusy(null);
  }

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-3xl space-y-6 px-6 py-10">
        <header>
          <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight">
            <Trash2Icon className="size-5" /> Lixeira
          </h1>
          <p className="text-muted-foreground text-sm">
            Notas movidas para <code>.trash/</code> no vault. Restaurar devolve a nota ao lugar de
            origem (ou ao lado, se o nome estiver ocupado) sem sobrescrever nada.
          </p>
        </header>
        {error ? (
          <p role="alert" className="text-destructive text-sm">
            {error}
          </p>
        ) : null}
        {message ? (
          <p role="status" className="bg-accent text-accent-foreground rounded px-3 py-2 text-sm">
            {message.text}{' '}
            {message.href ? (
              <Link href={message.href} className="underline underline-offset-2">
                Abrir
              </Link>
            ) : null}
          </p>
        ) : null}
        {items.length === 0 ? (
          <p className="text-muted-foreground text-sm">A lixeira está vazia.</p>
        ) : (
          <ul className="divide-y rounded-lg border" aria-label="Notas na lixeira">
            {items.map((item) => (
              <li key={item.path} className="flex flex-wrap items-center gap-3 px-4 py-3">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{noteName(item.originalPath)}</p>
                  <p className="text-muted-foreground truncate text-xs">{item.originalPath}</p>
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={busy !== null}
                  onClick={() => restore(item)}
                >
                  <RotateCcwIcon /> Restaurar
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={busy !== null}
                  onClick={() => purge(item)}
                >
                  Excluir de vez
                </Button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
