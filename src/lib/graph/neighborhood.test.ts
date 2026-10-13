import { describe, expect, it } from 'vitest';
import { degrees, neighborhood } from './neighborhood';

const node = (path: string) => ({ path, title: path, tags: [] });
const nodes = ['a', 'b', 'c', 'd', 'e'].map(node);
const edges = [
  { source: 'a', target: 'b' },
  { source: 'b', target: 'c' },
  { source: 'c', target: 'd' },
];

describe('neighborhood', () => {
  it('pega a nota e os vizinhos até a profundidade pedida', () => {
    expect(neighborhood(nodes, edges, 'b').nodes.map((n) => n.path)).toEqual(['a', 'b', 'c']);
    expect(neighborhood(nodes, edges, 'b', 2).nodes.map((n) => n.path)).toEqual([
      'a',
      'b',
      'c',
      'd',
    ]);
    expect(neighborhood(nodes, edges, 'e')).toEqual({ nodes: [node('e')], edges: [] });
  });
});

describe('degrees', () => {
  it('conta as ligações de cada nota', () => {
    expect(Object.fromEntries(degrees(edges))).toEqual({ a: 1, b: 2, c: 2, d: 1 });
  });
});
