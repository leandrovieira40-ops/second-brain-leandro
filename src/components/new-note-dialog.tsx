'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { NativeSelect } from '@/components/ui/select';
import { ApiError, createNote } from '@/lib/client/api';
import {
  DEFAULT_FOLDER_BY_TYPE,
  NOTE_TYPE_LABELS,
  NOTE_TYPES,
  type NoteType,
} from '@/lib/notes/types';
import { noteHref, useVault } from './vault-context';

const CREATABLE = NOTE_TYPES.filter((type) => type !== 'template' && type !== 'note');

export function NewNoteDialog({
  open,
  onOpenChange,
  initialTitle = '',
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Título sugerido (ex.: destino de um link quebrado). */
  initialTitle?: string;
}) {
  const router = useRouter();
  const { tree } = useVault();
  const [type, setType] = useState<NoteType>('inbox');
  const [folder, setFolder] = useState<string>(DEFAULT_FOLDER_BY_TYPE.inbox);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const folderOptions = [...new Set(['', ...tree.folders, folder])].sort((a, b) =>
    a.localeCompare(b, 'pt-BR'),
  );

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const title = String(new FormData(event.currentTarget).get('title') ?? '').trim();
    if (!title) {
      setError('Dê um título à nota.');
      return;
    }
    setPending(true);
    setError(null);
    try {
      const created = await createNote({ title, folder, type });
      onOpenChange(false);
      router.push(noteHref(created.path));
      router.refresh(); // atualiza a árvore do vault
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Sem conexão. A nota não foi criada.');
    }
    setPending(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogTitle>Nova nota</DialogTitle>
        <DialogDescription>
          O arquivo é criado no vault imediatamente. Nada existente é sobrescrito.
        </DialogDescription>
        <form onSubmit={onSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="new-note-title">Título</Label>
            <Input
              id="new-note-title"
              name="title"
              autoFocus
              maxLength={200}
              autoComplete="off"
              defaultValue={initialTitle}
            />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="new-note-type">Tipo</Label>
              <NativeSelect
                id="new-note-type"
                value={type}
                onChange={(event) => {
                  const next = event.target.value as NoteType;
                  setType(next);
                  setFolder(DEFAULT_FOLDER_BY_TYPE[next]);
                }}
              >
                {CREATABLE.map((option) => (
                  <option key={option} value={option}>
                    {NOTE_TYPE_LABELS[option]}
                  </option>
                ))}
              </NativeSelect>
            </div>
            <div className="space-y-2">
              <Label htmlFor="new-note-folder">Pasta</Label>
              <NativeSelect
                id="new-note-folder"
                value={folder}
                onChange={(event) => setFolder(event.target.value)}
              >
                {folderOptions.map((option) => (
                  <option key={option} value={option}>
                    {option || '(raiz do vault)'}
                  </option>
                ))}
              </NativeSelect>
            </div>
          </div>
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
              {pending ? 'Criando…' : 'Criar nota'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
