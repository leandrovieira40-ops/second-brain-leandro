import { describe, expect, it } from 'vitest';
import { conflictCopyPath, InvalidTitleError, noteFilePath, titleToFileName } from './filename';

describe('titleToFileName', () => {
  it.each([
    ['Posicionamento', 'Posicionamento.md'],
    ['Livro: Subtítulo', 'Livro - Subtítulo.md'],
    ['E/ou? <talvez> "sim" | não', 'E ou talvez sim não.md'],
    ['Tag #1 e ^bloco [x]', 'Tag 1 e bloco x.md'],
    ['  ...Pontos nas bordas...  ', 'Pontos nas bordas.md'],
    ['CON', 'CON_.md'],
    ['nul', 'nul_.md'],
    ['Ação e reação', 'Ação e reação.md'],
  ])('%j → %j', (title, expected) => {
    expect(titleToFileName(title)).toBe(expected);
  });

  it('rejeita título sem conteúdo útil', () => {
    expect(() => titleToFileName('   ')).toThrow(InvalidTitleError);
    expect(() => titleToFileName('???')).toThrow(InvalidTitleError);
  });

  it('limita o tamanho do nome', () => {
    const name = titleToFileName('a'.repeat(300));
    expect(name.length).toBeLessThanOrEqual(123);
  });

  it('normaliza Unicode para NFC', () => {
    expect(titleToFileName('Ação')).toBe('Ação.md'.normalize('NFC'));
  });
});

describe('noteFilePath', () => {
  it('combina pasta e nome', () => {
    expect(noteFilePath('00-Inbox', 'Ideia')).toBe('00-Inbox/Ideia.md');
    expect(noteFilePath('', 'Ideia')).toBe('Ideia.md');
  });
});

describe('conflictCopyPath', () => {
  it('usa data e hora no fuso configurado', () => {
    const date = new Date('2026-10-12T21:30:00Z');
    expect(conflictCopyPath('Pasta/Nota.md', date, 'America/Sao_Paulo')).toBe(
      'Pasta/Nota (conflito 2026-10-12 1830).md',
    );
  });
});
