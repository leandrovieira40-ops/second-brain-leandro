import { describe, expect, it } from 'vitest';
import {
  cleanTags,
  pdfImportSchema,
  safeText,
  sourceNoteBody,
  sourceNoteTitle,
  type PdfReading,
} from './pdf-note';

const reading: PdfReading = {
  title: 'O Mito do Progresso',
  author: 'Gilberto Dupas',
  summary: 'Primeiro parágrafo.\n\nSegundo   parágrafo\ncom quebra.',
  key_ideas: ['Progresso não é linear.', '  '],
  quotes: [{ text: 'O progresso é um mito.', page: 3 }],
  applications: ['Questionar metas de crescimento.'],
  tags: ['Filosofia', '#Progresso Técnico', 'x'.repeat(60), ''],
};

describe('sourceNoteBody', () => {
  it('preenche as seções do modelo Fonte e deixa espaço para o resumo do usuário', () => {
    const body = sourceNoteBody(reading, {
      fileName: 'O_Mito_do_Progresso.pdf',
      pageCount: 13,
      date: '14/10/2026',
    });
    expect(body).toContain(
      '> 📄 Importado de **OMitodoProgresso.pdf** (13 páginas) em 14/10/2026.',
    );
    expect(body).toContain(
      '## Resumo (IA)\n\nPrimeiro parágrafo.\n\nSegundo parágrafo com quebra.\n',
    );
    expect(body).toContain('## Ideias centrais\n\n- Progresso não é linear.\n\n');
    expect(body).toContain('> "O progresso é um mito." (p. 3)');
    expect(body).toContain('## Aplicações práticas\n\n- Questionar metas de crescimento.');
    expect(body.endsWith('## Resumo (meu)\n\n')).toBe(true);
  });

  it('neutraliza HTML, links [[ ]] e linhas que imitam frontmatter', () => {
    expect(safeText('<img src=x onerror=alert(1)>Oi [[Nota]]\n---\nfim')).toBe(
      'Oi [ [Nota]]\n—\nfim',
    );
    const body = sourceNoteBody(
      { ...reading, summary: '---\ntype: hack\n---', key_ideas: [], quotes: [], applications: [] },
      { fileName: 'a.pdf', pageCount: 1, date: 'hoje' },
    );
    expect(body).not.toMatch(/^---$/m);
    expect(body).toContain('_Nenhuma citação._');
  });
});

describe('sourceNoteTitle e cleanTags', () => {
  it('usa o título da IA ou, sem ele, o nome do arquivo', () => {
    expect(sourceNoteTitle(reading, 'x.pdf')).toBe('O Mito do Progresso');
    expect(sourceNoteTitle({ ...reading, title: ' ?? ' }, 'O_Mito_do_Progresso.pdf')).toBe(
      'O Mito do Progresso',
    );
    expect(sourceNoteTitle({ ...reading, title: 'A/B: C' }, 'x.pdf')).toBe('A B C');
  });

  it('tags simples, sem acento nem espaço, no máximo 5', () => {
    expect(cleanTags(reading.tags)).toEqual(['filosofia', 'progresso-tecnico', 'x'.repeat(40)]);
    expect(cleanTags(['a', 'b', 'c', 'd', 'e', 'f'])).toHaveLength(5);
  });
});

describe('pdfImportSchema', () => {
  it('aceita texto e imagens em base64 e recusa o resto', () => {
    const ok = {
      fileName: 'a.pdf',
      pageCount: 1,
      pages: [{ number: 1, text: 'oi', image: 'QUJD' }],
    };
    expect(pdfImportSchema.safeParse(ok).success).toBe(true);
    expect(
      pdfImportSchema.safeParse({ ...ok, pages: [{ number: 1, text: '', image: 'data:x' }] })
        .success,
    ).toBe(false);
    expect(pdfImportSchema.safeParse({ ...ok, pages: [] }).success).toBe(false);
  });
});
