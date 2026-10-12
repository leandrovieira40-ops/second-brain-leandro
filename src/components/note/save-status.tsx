'use client';

import {
  CheckIcon,
  CloudOffIcon,
  LoaderCircleIcon,
  PencilIcon,
  TriangleAlertIcon,
} from 'lucide-react';
import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import type { SaveState } from '@/lib/editor/save-controller';
import { cn } from '@/lib/utils';

const time = (ms: number) =>
  new Date(ms).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });

/** Estado honesto do salvamento (ADR-0008): "Salvo" só após confirmação do servidor. */
export function SaveStatus({ state, onRetry }: { state: SaveState; onRetry: () => void }) {
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
      text = state.lastSavedAt ? `Salvo às ${time(state.lastSavedAt)}` : 'Sem alterações';
      break;
    case 'dirty':
      icon = <PencilIcon />;
      text = 'Alterações não salvas';
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

  return (
    <div className="flex items-center gap-2">
      <span
        role="status"
        aria-live="polite"
        data-testid="save-status"
        data-status={state.status}
        title={
          state.message ??
          (state.unsaved ? 'O texto está guardado como rascunho neste navegador.' : undefined)
        }
        className={cn('flex items-center gap-1.5 text-xs whitespace-nowrap [&_svg]:size-3.5', tone)}
      >
        {icon}
        {text}
      </span>
      {state.status === 'error' ? (
        <Button size="sm" variant="outline" onClick={onRetry}>
          Tentar agora
        </Button>
      ) : null}
    </div>
  );
}
