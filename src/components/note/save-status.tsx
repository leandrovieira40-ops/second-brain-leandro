'use client';

import {
  CheckIcon,
  CloudOffIcon,
  LoaderCircleIcon,
  SaveIcon,
  TriangleAlertIcon,
} from 'lucide-react';
import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import type { SaveState } from '@/lib/editor/save-controller';
import { cn } from '@/lib/utils';

const time = (ms: number) =>
  new Date(ms).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });

const AUTOSAVE_HINT =
  'A nota é salva sozinha alguns segundos depois que você para de digitar. Também dá para clicar em Salvar ou apertar Ctrl+S.';

/**
 * Estado honesto do salvamento (ADR-0008): "Salvo" só após confirmação do servidor. O botão
 * Salvar fica sempre à vista, para quem prefere salvar na hora.
 */
export function SaveStatus({
  state,
  onSave,
  disabled,
}: {
  state: SaveState;
  onSave: () => void;
  disabled?: boolean;
}) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (state.status !== 'error' || !state.nextRetryAt) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [state.status, state.nextRetryAt]);

  let icon: React.ReactNode;
  let text: string;
  let tone = 'text-muted-foreground';
  switch (state.status) {
    case 'saved':
      icon = <CheckIcon />;
      text = state.lastSavedAt ? `Salvo às ${time(state.lastSavedAt)}` : 'Tudo salvo';
      tone = 'text-success';
      break;
    case 'dirty':
      icon = <span className="bg-warning size-2 rounded-full" />;
      text = 'Ainda não salvo';
      break;
    case 'saving':
      icon = <LoaderCircleIcon className="animate-spin" />;
      text = 'Salvando…';
      break;
    case 'error': {
      icon = <CloudOffIcon />;
      const seconds = state.nextRetryAt
        ? Math.max(0, Math.ceil((state.nextRetryAt - now) / 1000))
        : null;
      text = `Não salvo${seconds !== null ? ` · nova tentativa em ${seconds}s` : ''}`;
      tone = 'text-destructive';
      break;
    }
    case 'conflict':
      icon = <TriangleAlertIcon />;
      text = 'Conflito — nada foi sobrescrito';
      tone = 'text-warning';
      break;
  }

  const canSave =
    !disabled && (state.status === 'dirty' || state.status === 'error') && state.unsaved;

  return (
    <div className="flex items-center gap-2">
      <span
        role="status"
        aria-live="polite"
        data-testid="save-status"
        data-status={state.status}
        title={state.message ?? AUTOSAVE_HINT}
        className={cn(
          'flex items-center gap-1.5 text-xs whitespace-nowrap max-sm:hidden [&_svg]:size-3.5',
          tone,
        )}
      >
        {icon}
        {text}
      </span>
      <Button
        size="sm"
        variant={canSave ? 'default' : 'outline'}
        disabled={!canSave}
        onClick={onSave}
        title={AUTOSAVE_HINT}
      >
        <SaveIcon />
        {state.status === 'saving'
          ? 'Salvando…'
          : state.status === 'error'
            ? 'Tentar agora'
            : 'Salvar'}
      </Button>
    </div>
  );
}
