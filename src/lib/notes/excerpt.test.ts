import { describe, expect, it } from 'vitest';
import { plainExcerpt } from './excerpt';

describe('plainExcerpt', () => {
  it('tira a marcação e mostra links pelo nome', () => {
    expect(
      plainExcerpt(
        '## Ideia\n\n- Ver **[[Posicionamento|o conceito]]** e [site](https://x.y)\n> citação',
      ),
    ).toBe('Ideia Ver o conceito e site citação');
  });

  it('ignora blocos de código, imagens e HTML', () => {
    expect(plainExcerpt('a\n```js\nalert(1)\n```\n![[foto.png]] <img src=x onerror=y> b')).toBe(
      'a b',
    );
  });

  it('corta em palavra inteira com reticências', () => {
    expect(plainExcerpt('uma frase bem comprida aqui', 15)).toBe('uma frase bem…');
    expect(plainExcerpt('')).toBe('');
  });
});
