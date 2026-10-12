import { describe, expect, it } from 'vitest';
import { maskNonProse } from './mask';
import { extractWikilinks, parseWikilinkInner } from './wikilinks';

describe('parseWikilinkInner', () => {
  it.each([
    ['Nota', { target: 'Nota', subpath: null, alias: null }],
    ['Nota|apelido', { target: 'Nota', subpath: null, alias: 'apelido' }],
    ['Nota#Seção', { target: 'Nota', subpath: 'Seção', alias: null }],
    ['Nota#^bloco1|ver', { target: 'Nota', subpath: '^bloco1', alias: 'ver' }],
    ['pasta/Nota\\|tabela', { target: 'pasta/Nota', subpath: null, alias: 'tabela' }],
    ['#Só seção', { target: '', subpath: 'Só seção', alias: null }],
  ])('%j', (inner, expected) => {
    expect(parseWikilinkInner(inner)).toEqual(expected);
  });
});

describe('extractWikilinks', () => {
  it('encontra links, embeds e linhas', () => {
    const md = 'Veja [[Posicionamento]] e\n![[diagrama.png]] e [[Vendas#Fechamento|fechar]].';
    const links = extractWikilinks(md);
    expect(links.map((l) => [l.target, l.embed, l.line])).toEqual([
      ['Posicionamento', false, 1],
      ['diagrama.png', true, 2],
      ['Vendas', false, 2],
    ]);
    expect(md.slice(links[2]!.start, links[2]!.end)).toBe('[[Vendas#Fechamento|fechar]]');
  });

  it('ignora código cercado, código inline e comentários', () => {
    const md = [
      '```',
      '[[Dentro do bloco]]',
      '```',
      'Texto `[[inline]]` e %%[[comentário]]%% e [[Fora]]',
      '~~~md',
      '[[Outro bloco]]',
      '~~~',
    ].join('\n');
    expect(extractWikilinks(md).map((l) => l.target)).toEqual(['Fora']);
  });

  it('ignora links vazios e não atravessa linhas', () => {
    expect(extractWikilinks('[[]] [[a\nb]]')).toEqual([]);
  });
});

describe('maskNonProse', () => {
  it('preserva o tamanho e as quebras de linha', () => {
    const md = 'a `b` c\n```\nx\n```\nd';
    const masked = maskNonProse(md);
    expect(masked).toHaveLength(md.length);
    expect(masked.split('\n')).toHaveLength(md.split('\n').length);
    expect(masked.startsWith('a     c')).toBe(true);
  });

  it('bloco não fechado vai até o fim', () => {
    expect(maskNonProse('ok\n```\n[[x]]').includes('[[x]]')).toBe(false);
  });
});
