import { describe, expect, it } from 'vitest';
import { parseNote } from './parse';
import { newNoteContent } from './template';

describe('parseNote', () => {
  it('extrai título, tipo, tags, aliases e links', () => {
    const content = `---
id: 01K7DQ2VQ8M6Z4X0R1S2T3V4W5
title: Posicionamento
type: concept
tags: [marketing]
aliases: [Positioning]
---
Ligado a [[Vendas consultivas]] e #estratégia.
`;
    const note = parseNote('04-Concepts/Posicionamento.md', content);
    expect(note).toMatchObject({
      title: 'Posicionamento',
      type: 'concept',
      id: '01K7DQ2VQ8M6Z4X0R1S2T3V4W5',
      tags: ['marketing', 'estratégia'],
      aliases: ['Positioning'],
      frontmatterError: null,
    });
    expect(note.links.map((l) => l.target)).toEqual(['Vendas consultivas']);
  });

  it('usa o nome do arquivo como título e "note" como tipo padrão', () => {
    const note = parseNote('00-Inbox/Ideia solta.md', 'Só texto.');
    expect(note).toMatchObject({ title: 'Ideia solta', type: 'note', id: null, frontmatter: null });
  });

  it('não lança com YAML inválido', () => {
    const note = parseNote('a.md', '---\ntags: [\n---\n[[Link]]');
    expect(note.frontmatterError).toBeTruthy();
    expect(note.links).toHaveLength(1);
  });
});

describe('newNoteContent', () => {
  it('gera frontmatter válido, com aspas quando necessário', () => {
    const content = newNoteContent({
      id: '01K7DQ2VQ8M6Z4X0R1S2T3V4W5',
      title: 'Livro: Subtítulo #1',
      type: 'book',
      today: '2026-10-12',
    });
    const note = parseNote('02-Sources/Books/Livro - Subtítulo 1.md', content);
    expect(note.frontmatterError).toBeNull();
    expect(note.frontmatter).toMatchObject({
      title: 'Livro: Subtítulo #1',
      type: 'book',
      created: '2026-10-12',
      updated: '2026-10-12',
      reading_status: 'to-read',
    });
    expect(note.tags).toEqual([]);
  });
});
