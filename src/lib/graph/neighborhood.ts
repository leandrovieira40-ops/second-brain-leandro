export interface GraphNode {
  path: string;
  title: string;
  tags: string[];
}
export interface GraphEdge {
  source: string;
  target: string;
}

/** Vizinhança de uma nota até `depth` saltos (grafo local, como o do Obsidian). */
export function neighborhood(
  nodes: readonly GraphNode[],
  edges: readonly GraphEdge[],
  center: string,
  depth = 1,
): { nodes: GraphNode[]; edges: GraphEdge[] } {
  const adjacency = new Map<string, Set<string>>();
  for (const edge of edges) {
    if (!adjacency.has(edge.source)) adjacency.set(edge.source, new Set());
    if (!adjacency.has(edge.target)) adjacency.set(edge.target, new Set());
    adjacency.get(edge.source)!.add(edge.target);
    adjacency.get(edge.target)!.add(edge.source);
  }
  const keep = new Set([center]);
  let frontier = [center];
  for (let level = 0; level < depth; level++) {
    const next: string[] = [];
    for (const path of frontier) {
      for (const neighbor of adjacency.get(path) ?? []) {
        if (!keep.has(neighbor)) {
          keep.add(neighbor);
          next.push(neighbor);
        }
      }
    }
    frontier = next;
  }
  return {
    nodes: nodes.filter((node) => keep.has(node.path)),
    edges: edges.filter((edge) => keep.has(edge.source) && keep.has(edge.target)),
  };
}

/** Quantas ligações cada nota tem (define o tamanho do ponto). */
export function degrees(edges: readonly GraphEdge[]): Map<string, number> {
  const result = new Map<string, number>();
  for (const edge of edges) {
    result.set(edge.source, (result.get(edge.source) ?? 0) + 1);
    result.set(edge.target, (result.get(edge.target) ?? 0) + 1);
  }
  return result;
}
