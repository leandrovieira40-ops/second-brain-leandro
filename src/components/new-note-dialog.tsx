'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ApiError, createNote } from '@/lib/client/api';
import { folderDisplay, NOTE_TYPE_INFO } from '@/lib/notes/folders';
import {
  DEFAULT_FOLDER_BY_TYPE,
  NOTE_TYPE_LABELS,
  NOTE_TYPES,
  type NoteType,
} from '@/lib/notes/types';
import { cn } from '@/lib/utils';
import { FolderSelect } from './folder-select';
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
  const [choosingFolder, setChoosingFolder] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const destination = folderDisplay(folder);

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
      <DialogContent className="max-w-2xl">
        <DialogTitle>Nova nota</DialogTitle>
        <DialogDescription>
          Escolha o tipo: a pasta certa é escolhida para você. Nada existente é sobrescrito.
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

          <fieldset className="space-y-2">
            <legend className="text-sm font-medium">Tipo de nota</legend>
            <div className="grid max-h-72 gap-2 overflow-y-auto pr-1 sm:grid-cols-2">
              {CREATABLE.map((option) => {
                const info = NOTE_TYPE_INFO[option];
                const selected = option === type;
                return (
                  <label
                    key={option}
                    className={cn(
                      'hover:bg-muted flex cursor-pointer items-start gap-2 rounded-md border p-2 text-sm',
                      selected && 'border-primary bg-accent text-accent-foreground hover:bg-accent',
                    )}
                  >
                    <input
                      type="radio"
                      name="type"
                      value={option}
                      checked={selected}
                      onChange={() => {
                        setType(option);
                        setFolder(DEFAULT_FOLDER_BY_TYPE[option]);
                      }}
                      className="sr-only"
                    />
                    <span aria-hidden className="text-base leading-5">
                      {info?.icon}
                    </span>
                    <span className="min-w-0">
                      <span className="block font-medium">{NOTE_TYPE_LABELS[option]}</span>
                      {info ? (
                        <span
                          className={cn(
                            'block text-xs',
                            selected ? 'opacity-80' : 'text-muted-foreground',
                          )}
                        >
                          {info.hint}
                        </span>
                      ) : null}
                    </span>
                  </label>
                );
              })}
            </div>
          </fieldset>

          <div className="space-y-2 rounded-md border p-3 text-sm">
            <p>
              Vai ser salva em:{' '}
              <strong>
                {destination.icon} {destination.label}
              </strong>{' '}
              {!choosingFolder ? (
                <button
                  type="button"
                  className="text-primary ml-1 text-xs underline underline-offset-2"
                  onClick={() => setChoosingFolder(true)}
                >
                  escolher outra pasta
                </button>
              ) : null}
            </p>
            {choosingFolder ? (
              <div className="space-y-1">
                <Label htmlFor="new-note-folder">Pasta</Label>
                <FolderSelect
                  id="new-note-folder"
                  value={folder}
                  folders={tree.folders}
                  onChange={setFolder}
                />
              </div>
            ) : null}
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
