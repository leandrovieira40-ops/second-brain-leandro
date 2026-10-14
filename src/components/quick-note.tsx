'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { ApiError, captureNote } from '@/lib/client/api';
import { noteHref, useShell } from './vault-context';

const DRAFT_KEY = 'sb:quick-note';

function readDraft(): { title: string; text: string } {
  try {
    const value = JSON.parse(localStorage.getItem(DRAFT_KEY) ?? 'null') as unknown;
    if (value && typeof value === 'object') {
      const { title, text } = value as Record<string, unknown>;
      return {
        title: typeof title === 'string' ? title : '',
        text: typeof text === 'string' ? text : '',
      };
    }
  } catch {
    // sem armazenamento local: começa vazio
  }
  return { title: '', text: '' };
}

function writeDraft(title: string, text: string) {
  try {
    if (title || text) localStorage.setItem(DRAFT_KEY, JSON.stringify({ title, text }));
    else localStorage.removeItem(DRAFT_KEY);
  } catch {
    // rascunho é só uma conveniência deste navegador
  }
}

/**
 * Bloco de notas do Início, como no Google Keep: clique, escreva e salve. A nota vai para a Caixa
 * de entrada. Enquanto não é salva, o texto fica guardado neste navegador.
 */
export function QuickNote({ onSaved }: { onSaved: () => void }) {
  const router = useRouter();
  const { notify } = useShell();
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [text, setText] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const textRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const draft = readDraft();
    /* eslint-disable react-hooks/set-state-in-effect -- localStorage só existe no cliente */
    if (draft.title || draft.text) {
      setTitle(draft.title);
      setText(draft.text);
      setOpen(true);
    }
    /* eslint-enable react-hooks/set-state-in-effect */
  }, []);

  useEffect(() => writeDraft(title, text), [title, text]);

  // A caixa de texto cresce com o conteúdo.
  useEffect(() => {
    const element = textRef.current;
    if (!element) return;
    element.style.height = 'auto';
    element.style.height = `${Math.min(element.scrollHeight, 480)}px`;
  }, [text, open]);

  async function save() {
    if (!title.trim() && !text.trim()) {
      setError('Escreva alguma coisa antes de salvar.');
      return;
    }
    setPending(true);
    setError(null);
    try {
      const created = await captureNote(text, title.trim() || undefined);
      setTitle('');
      setText('');
      setOpen(false);
      notify('Nota salva na Caixa de entrada.', noteHref(created.path));
      onSaved();
      router.refresh();
    } catch (e) {
      setError(
        e instanceof ApiError
          ? e.message
          : 'Sem conexão: a nota não foi salva. O texto continua aqui.',
      );
    }
    setPending(false);
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="bg-card text-muted-foreground hover:border-primary/50 w-full rounded-xl border px-5 py-4 text-left shadow-sm transition-colors"
      >
        Escreva uma nota…
      </button>
    );
  }

  return (
    <form
      aria-label="Nova nota rápida"
      className="bg-card focus-within:border-primary/50 rounded-xl border shadow-sm"
      onSubmit={(event) => {
        event.preventDefault();
        void save();
      }}
      onKeyDown={(event) => {
        if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') {
          event.preventDefault();
          void save();
        }
      }}
    >
      <input
        aria-label="Título"
        placeholder="Título"
        value={title}
        maxLength={200}
        onChange={(event) => setTitle(event.target.value)}
        className="placeholder:text-muted-foreground w-full bg-transparent px-5 pt-4 text-lg font-semibold outline-none"
      />
      <textarea
        ref={textRef}
        aria-label="Texto da nota"
        placeholder="Escreva uma nota…"
        autoFocus
        rows={3}
        value={text}
        maxLength={20_000}
        onChange={(event) => setText(event.target.value)}
        className="placeholder:text-muted-foreground block w-full resize-none bg-transparent px-5 py-3 text-base leading-relaxed outline-none"
      />
      {error ? (
        <p role="alert" className="text-destructive px-5 pb-2 text-sm">
          {error}
        </p>
      ) : null}
      <div className="flex items-center justify-between gap-2 border-t px-3 py-2">
        <p className="text-muted-foreground px-2 text-xs max-sm:hidden">
          Vai para a 📥 Caixa de entrada · Ctrl+Enter salva
        </p>
        <div className="ml-auto flex gap-2">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => setOpen(false)}
            title="Fechar (o texto continua guardado aqui)"
          >
            Fechar
          </Button>
          <Button type="submit" size="sm" disabled={pending}>
            {pending ? 'Salvando…' : 'Salvar nota'}
          </Button>
        </div>
      </div>
    </form>
  );
}
