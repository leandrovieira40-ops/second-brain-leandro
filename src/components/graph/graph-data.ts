'use client';

import { useEffect, useState } from 'react';
import { ApiError, noteGraph, type GraphDto } from '@/lib/client/api';

type State =
  { kind: 'loading' } | { kind: 'ready'; graph: GraphDto } | { kind: 'error'; message: string };

/** Busca o grafo uma vez por montagem (o índice já tem tudo calculado). */
export function useGraph(enabled: boolean, refreshKey?: string): State {
  const [state, setState] = useState<{ key: string; value: State } | null>(null);
  const key = `${enabled}:${refreshKey ?? ''}`;

  useEffect(() => {
    if (!enabled) return;
    const controller = new AbortController();
    noteGraph(controller.signal).then(
      (graph) => setState({ key, value: { kind: 'ready', graph } }),
      (error: unknown) => {
        if (controller.signal.aborted) return;
        setState({
          key,
          value: {
            kind: 'error',
            message: error instanceof ApiError ? error.message : 'Sem conexão.',
          },
        });
      },
    );
    return () => controller.abort();
  }, [enabled, key]);

  return state?.key === key ? state.value : { kind: 'loading' };
}
