'use client';

import { FileTextIcon, LoaderCircleIcon } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { ApiError, importPdf } from '@/lib/client/api';
import { PdfPrepareError, preparePdf } from '@/lib/client/pdf-pages';
import { PDF_IMPORT_LIMITS } from '@/lib/import/pdf-note';
import { noteHref, useShell } from './vault-context';

type Step =
  | { kind: 'idle' }
  | { kind: 'preparing'; page: number; total: number }
  | { kind: 'reading'; pages: number }
  | { kind: 'error'; message: string };

/**
 * Importar PDF: o navegador prepara as páginas e a IA lê o documento e preenche uma nota de fonte
 * (Resumo, Ideias centrais, Citações). A nota abre ao terminar.
 */
export function ImportPdfDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const router = useRouter();
  const { notify } = useShell();
  const [file, setFile] = useState<File | null>(null);
  const [step, setStep] = useState<Step>({ kind: 'idle' });
  const busy = step.kind === 'preparing' || step.kind === 'reading';

  async function start() {
    if (!file) return;
    try {
      setStep({ kind: 'preparing', page: 0, total: 0 });
      const input = await preparePdf(file, ({ page, total }) =>
        setStep({ kind: 'preparing', page, total }),
      );
      setStep({ kind: 'reading', pages: input.pages.length });
      const created = await importPdf(input);
      const skipped = input.pageCount - input.pages.length;
      notify(
        skipped > 0
          ? `PDF importado (as primeiras ${input.pages.length} de ${input.pageCount} páginas).`
          : 'PDF importado. Confira o resumo feito pela IA.',
      );
      setFile(null);
      setStep({ kind: 'idle' });
      onOpenChange(false);
      router.push(noteHref(created.path));
      router.refresh();
    } catch (error) {
      setStep({
        kind: 'error',
        message:
          error instanceof PdfPrepareError || error instanceof ApiError
            ? error.message
            : 'Sem conexão: nada foi criado. Tente de novo.',
      });
    }
  }

  return (
    <Dialog open={open} onOpenChange={(next) => (busy ? undefined : onOpenChange(next))}>
      <DialogContent>
        <DialogTitle>Importar PDF</DialogTitle>
        <DialogDescription>
          A IA lê o PDF (inclusive slides e páginas digitalizadas) e cria uma nota em 📚 Fontes com
          resumo, ideias centrais e citações. Até {PDF_IMPORT_LIMITS.maxPages} páginas.
        </DialogDescription>
        <form
          className="space-y-4"
          onSubmit={(event) => {
            event.preventDefault();
            void start();
          }}
        >
          <label className="hover:border-primary/60 flex cursor-pointer flex-col items-center gap-2 rounded-lg border border-dashed px-4 py-6 text-center text-sm">
            <FileTextIcon className="text-muted-foreground size-6" />
            {file ? (
              <span className="font-medium break-all">{file.name}</span>
            ) : (
              <span className="text-muted-foreground">Clique para escolher o arquivo PDF</span>
            )}
            <input
              type="file"
              accept="application/pdf,.pdf"
              aria-label="Arquivo PDF"
              className="sr-only"
              disabled={busy}
              onChange={(event) => {
                setFile(event.target.files?.[0] ?? null);
                setStep({ kind: 'idle' });
              }}
            />
          </label>

          {step.kind === 'preparing' ? (
            <p role="status" className="text-muted-foreground flex items-center gap-2 text-sm">
              <LoaderCircleIcon className="size-4 animate-spin" />
              {step.total ? `Preparando página ${step.page} de ${step.total}…` : 'Abrindo o PDF…'}
            </p>
          ) : null}
          {step.kind === 'reading' ? (
            <p role="status" className="text-muted-foreground flex items-center gap-2 text-sm">
              <LoaderCircleIcon className="size-4 animate-spin" />A IA está lendo {step.pages}{' '}
              {step.pages === 1 ? 'página' : 'páginas'}… isso pode levar até 2 minutos.
            </p>
          ) : null}
          {step.kind === 'error' ? (
            <p role="alert" className="text-destructive text-sm">
              {step.message}
            </p>
          ) : null}

          <div className="flex justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              disabled={busy}
              onClick={() => onOpenChange(false)}
            >
              Cancelar
            </Button>
            <Button type="submit" disabled={!file || busy}>
              {busy ? 'Importando…' : 'Importar'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
