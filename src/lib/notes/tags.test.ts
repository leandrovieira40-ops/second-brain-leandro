import { describe, expect, it } from 'vitest';
import { extractInlineTags, frontmatterTags, normalizeTag, uniqueTags } from './tags';

describe('extractInlineTags', () => {
  it('reconhece tags com acentos e hierarquia', () => {
    expect(extractInlineTags('Notas sobre #estratégia e #vendas/consultivas.\n#início')).toEqual([
      'estratégia',
      'vendas/consultivas',
      'início',
    ]);
  });

  it('ignora cabeçalhos, números puros, âncoras, URLs e código', () => {
    const md = '# Título\n## Sub\n#123 x#y https://a.com/#ancora [l](#sec) `#codigo`\n```\n#bloco\n```';
    expect(extractInlineTags(md)).toEqual([]);
  });
});

describe('frontmatterTags', () => {
  it('aceita lista, texto, # inicial e a chave legada `tag`', () => {
    expect(frontmatterTags({ tags: ['#a', 'b/c'], tag: 'd, e' })).toEqual(['a', 'b/c', 'd', 'e']);
    expect(frontmatterTags({ tags: 'x y' })).toEqual(['x', 'y']);
    expect(frontmatterTags(null)).toEqual([]);
  });
});

describe('normalizeTag / uniqueTags', () => {
  it('normaliza e remove duplicatas sem diferenciar maiúsculas', () => {
    expect(normalizeTag('#Tag/')).toBe('Tag');
    expect(normalizeTag('2026')).toBeNull();
    expect(normalizeTag('com espaço')).toBeNull();
    expect(uniqueTags(['Vendas', 'b'], ['vendas', 'c'])).toEqual(['Vendas', 'b', 'c']);
  });
});
