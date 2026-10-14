'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ApiError, renameNote } from '@/lib/client/api';
import { dirname, noteName } from '@/lib/vault/paths';
import { FolderSelect } from '../folder-select';
import { useVault } from '../vault-context';

export interface RenameOutcome {
  path: string;
  updatedNotes: string[];
}

/** Renomear e/ou mover a nota. Os links para ela são reescritos no mesmo commit (servidor). */
export function RenameDialog({
  open,
  onOpenChange,
  path,
  expectedSha,
  onRenamed,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  path: string;
  /** Versão salva que o usuário está vendo. */
  expectedSha: string;
  onRenamed: (outcome: RenameOutcome) => void;
}) {
  const { tree, storeKind, searchAvailable } = useVault();
  const [folder, setFolder] = useState(dirname(path));
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const title = String(new FormData(event.currentTarget).get('title') ?? '').trim();
    if (!title) {
      setError('Dê um nome à nota.');
      return;
    }
    setPending(true);
    setError(null);
    try {
      const result = await renameNote({ path, expectedSha, title, folder });
      onRenamed({ path: result.path, updatedNotes: result.updatedNotes });
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Sem conexão. Nada foi alterado.');
      setPending(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogTitle>Renomear ou mover</DialogTitle>
        <DialogDescription>
          Os [[links]] para esta nota em outras notas são atualizados no mesmo commit. Nada
          existente é sobrescrito.
          {!searchAvailable && storeKind === 'github'
            ? ' Sem o índice, a aplicação lê todas as notas para achar os links (até 400 notas).'
            : ''}
        </DialogDescription>
        <form onSubmit={onSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="rename-title">Nome</Label>
            <Input
              id="rename-title"
              name="title"
              autoFocus
              maxLength={200}
              autoComplete="off"
              defaultValue={noteName(path)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="rename-folder">Pasta</Label>
            <FolderSelect
              id="rename-folder"
              value={folder}
              folders={tree.folders}
              onChange={setFolder}
            />
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
              {pending ? 'Renomeando…' : 'Renomear'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
