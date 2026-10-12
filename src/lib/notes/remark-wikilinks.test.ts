import { describe, expect, it } from 'vitest';
import { LinkResolver } from './resolve';
import { remarkWikilinks } from './remark-wikilinks';

describe('remarkWikilinks', () => {
  it('converte links resolvidos e marca quebrados, sem tocar em código', () => {
    const tree = {
      type: 'root',
      children: [
        {
          type: 'paragraph',
          children: [
            { type: 'text', value: 'Veja [[Posicionamento|o conceito]] e [[Inexistente]].' },
            { type: 'inlineCode', value: '[[ignorado]]' },
          ],
        },
      ],
    };
    const resolver = new LinkResolver(['04-Concepts/Posicionamento.md']);
    remarkWikilinks({
      resolver,
      fromPath: 'x.md',
      hrefFor: (p) => `/note?path=${encodeURIComponent(p)}`,
    })(tree);
    const children = tree.children[0]!.children as {
      type: string;
      url?: string;
      value?: string;
      children?: { value: string }[];
    }[];
    expect(children.map((c) => c.type)).toEqual([
      'text',
      'link',
      'text',
      'wikilinkBroken',
      'text',
      'inlineCode',
    ]);
    expect(children[1]).toMatchObject({ url: '/note?path=04-Concepts%2FPosicionamento.md' });
    expect(children[1]!.children![0]!.value).toBe('o conceito');
    expect(children[3]!.children![0]!.value).toBe('Inexistente');
    expect(children[5]!.value).toBe('[[ignorado]]');
  });
});
