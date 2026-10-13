'use client';

import { useMemo, useState } from 'react';
import { Input } from '@/components/ui/input';
import { useVault } from '../vault-context';
import { GraphCanvas } from './graph-canvas';
import { useGraph } from './graph-data';

/** Grafo global: todas as notas e as ligações entre elas. */
export function GraphPage() {
  const { searchAvailable } = useVault();
  const state = useGraph(searchAvailable);
  const [filter, setFilter] = useState('');
  const [hideOrphans, setHideOrphans] = useState(false);

  const view = useMemo(() => {
    if (state.kind !== 'ready') return null;
    const { nodes, edges } = state.graph;
    const term = filter.trim().toLocaleLowerCase('pt-BR');
    const linked = new Set(edges.flatMap((edge) => [edge.source, edge.target]));
    const kept = nodes.filter(
      (node) =>
        (!hideOrphans || linked.has(node.path)) &&
        (!term ||
          node.title.toLocaleLowerCase('pt-BR').includes(term) ||
          node.path.toLocaleLowerCase('pt-BR').includes(term) ||
          node.tags.some((tag) => tag.toLocaleLowerCase('pt-BR').includes(term.replace(/^#/, '')))),
    );
    const keep = new Set(kept.map((node) => node.path));
    return {
      nodes: kept,
      edges: edges.filter((edge) => keep.has(edge.source) && keep.has(edge.target)),
    };
  }, [state, filter, hideOrphans]);

  return (
    <div className="flex h-full flex-col">
      <header className="flex flex-wrap items-center gap-3 border-b px-4 py-2">
        <h1 className="text-base font-semibold">Grafo</h1>
        {view ? (
          <span className="text-muted-foreground text-xs">
            {view.nodes.length} notas · {view.edges.length} ligações
          </span>
        ) : null}
        <div className="ml-auto flex items-center gap-3">
          <label className="text-muted-foreground flex items-center gap-1.5 text-xs">
            <input
              type="checkbox"
              checked={hideOrphans}
              onChange={(event) => setHideOrphans(event.target.checked)}
            />
            Esconder notas sem ligações
          </label>
          <Input
            type="search"
            placeholder="Filtrar por nome ou #tag"
            aria-label="Filtrar o grafo"
            value={filter}
            onChange={(event) => setFilter(event.target.value)}
            className="h-8 w-56"
          />
        </div>
      </header>
      <div className="bg-graph relative min-h-0 flex-1">
        {!searchAvailable ? (
          <p className="text-muted-foreground p-6 text-sm">
            O grafo usa o índice de busca (DATABASE_URL). Configure-o e sincronize no Início.
          </p>
        ) : state.kind === 'loading' ? (
          <p className="text-muted-foreground p-6 text-sm">Carregando o grafo…</p>
        ) : state.kind === 'error' ? (
          <p role="alert" className="text-destructive p-6 text-sm">
            {state.message}
          </p>
        ) : view && view.nodes.length === 0 ? (
          <p className="text-muted-foreground p-6 text-sm">
            Nenhuma nota no índice. Use “Sincronizar índice” no Início.
          </p>
        ) : view ? (
          <GraphCanvas
            nodes={view.nodes}
            edges={view.edges}
            label={`Grafo com ${view.nodes.length} notas e ${view.edges.length} ligações`}
          />
        ) : null}
        <p className="text-muted-foreground pointer-events-none absolute bottom-2 left-3 text-xs">
          Arraste para mover · roda do mouse para aproximar · clique para abrir
        </p>
      </div>
    </div>
  );
}
