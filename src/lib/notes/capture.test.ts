import { describe, expect, it } from 'vitest';
import { captureTitle } from './capture';

describe('captureTitle', () => {
  it.each([
    ['Ideia: vender por assinatura\nmais detalhes', 'Ideia: vender por assinatura'],
    ['\n\n# Título com **ênfase**', 'Título com ênfase'],
    ['- [ ] ligar para [[Fulano|o cliente]]', 'ligar para o cliente'],
    ['> citação de [um artigo](https://x.com)', 'citação de um artigo'],
    ['1. primeiro passo', 'primeiro passo'],
    ['   ', 'Captura 2026-10-12 1830'],
    ['---', 'Captura 2026-10-12 1830'],
  ])('%j → %j', (text, expected) => {
    expect(captureTitle(text, '2026-10-12 1830')).toBe(expected);
  });

  it('corta títulos longos em uma palavra', () => {
    const title = captureTitle('palavra '.repeat(30), 'x');
    expect(title.length).toBeLessThanOrEqual(80);
    expect(title.endsWith('palavra')).toBe(true);
  });
});
