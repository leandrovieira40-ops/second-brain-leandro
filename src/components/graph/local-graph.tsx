'use client';

import { useMemo } from 'react';
import { neighborhood } from '@/lib/graph/neighborhood';
import { useVault } from '../vault-context';
import { GraphCanvas } from './graph-canvas';
import { useGraph } from './graph-data';

/** Grafo local da nota (ela e as notas ligadas a ela), no painel lateral. */
export function LocalGraph({ path }: { path: string }) {
  const { searchAvailable } = useVault();
  const state = useGraph(searchAvailable, path);
  const local = useMemo(
    () =>
      state.kind === 'ready' ? neighborhood(state.graph.nodes, state.graph.edges, path, 1) : null,
    [state, path],
  );

  return (
    <section aria-labelledby="local-graph-heading" className="space-y-2">
      <h2
        id="local-graph-heading"
        className="text-muted-foreground text-xs font-semibold tracking-wide uppercase"
      >
        Grafo local
      </h2>
      {!searchAvailable ? (
        <p className="text-muted-foreground text-xs">Disponível com o índice configurado.</p>
      ) : !local ? (
        <p className="text-muted-foreground text-xs">
          {state.kind === 'error' ? state.message : 'Carregando…'}
        </p>
      ) : local.nodes.length <= 1 ? (
        <p className="text-muted-foreground text-xs">Esta nota ainda não tem ligações.</p>
      ) : (
        <div className="bg-graph h-56 overflow-hidden rounded-md border">
          <GraphCanvas
            nodes={local.nodes}
            edges={local.edges}
            focusPath={path}
            label={`Grafo local com ${local.nodes.length} notas`}
          />
        </div>
      )}
    </section>
  );
}
