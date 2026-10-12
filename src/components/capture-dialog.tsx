'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { ApiError, captureNote } from '@/lib/client/api';
import { INBOX_FOLDER } from '@/lib/notes/types';
import { noteHref } from './vault-context';

/** Captura rápida (Alt+C): texto livre direto para o Inbox, sem classificar. */
export function CaptureDialog({
  open,
  onOpenChange,
  onCaptured,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCaptured: (path: string, href: string) => void;
}) {
  const router = useRouter();
  const [text, setText] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function submit() {
    if (!text.trim()) {
      setError('Escreva algo para capturar.');
      return;
    }
    setPending(true);
    setError(null);
    try {
      const created = await captureNote(text);
      setText('');
      onOpenChange(false);
      onCaptured(created.path, noteHref(created.path));
      router.refresh();
    } catch (e) {
      setError(
        e instanceof ApiError
          ? e.message
          : 'Sem conexão: nada foi capturado. O texto continua aqui.',
      );
    }
    setPending(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogTitle>Captura rápida</DialogTitle>
        <DialogDescription>
          Vai para <code>{INBOX_FOLDER}</code> como está. A primeira linha vira o título. Ctrl+Enter
          para salvar.
        </DialogDescription>
        <form
          className="space-y-3"
          onSubmit={(event) => {
            event.preventDefault();
            void submit();
          }}
        >
          <Label htmlFor="capture-text" className="sr-only">
            Texto da captura
          </Label>
          <textarea
            id="capture-text"
            autoFocus
            rows={6}
            value={text}
            onChange={(event) => setText(event.target.value)}
            onKeyDown={(event) => {
              if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') {
                event.preventDefault();
                void submit();
              }
            }}
            maxLength={20_000}
            className="border-input placeholder:text-muted-foreground w-full resize-y rounded-md border bg-transparent px-3 py-2 text-sm"
            placeholder="Uma ideia, um link, uma pergunta…"
          />
          {error ? (
            <p role="alert" className="text-destructive text-sm">
              {error}
            </p>
          ) : null}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button type="submit" disabled={pending}>
              {pending ? 'Capturando…' : 'Capturar'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
