import { describe, expect, it } from 'vitest';
import { LinkResolver } from './resolve';

const files = [
  '04-Concepts/Posicionamento.md',
  '03-Permanent-Notes/Vendas consultivas.md',
  '05-Projects/Cliente A/Plano.md',
  '05-Projects/Cliente B/Plano.md',
  'Plano.md',
  'Attachments/diagrama.png',
  '02-Sources/Books/Livro 1.5.md',
];

describe('LinkResolver', () => {
  const resolver = new LinkResolver(
    files,
    new Map([['04-Concepts/Posicionamento.md', ['Positioning']]]),
  );

  it('resolve pelo nome do arquivo sem diferenciar maiúsculas', () => {
    expect(resolver.resolve('posicionamento', 'x.md').path).toBe('04-Concepts/Posicionamento.md');
    expect(resolver.resolve('Vendas consultivas.md', 'x.md').path).toBe(
      '03-Permanent-Notes/Vendas consultivas.md',
    );
  });

  it('resolve caminhos completos e sufixos', () => {
    expect(resolver.resolve('05-Projects/Cliente B/Plano', 'x.md').path).toBe(
      '05-Projects/Cliente B/Plano.md',
    );
    expect(resolver.resolve('Cliente A/Plano', 'x.md').path).toBe('05-Projects/Cliente A/Plano.md');
  });

  it('em ambiguidade prefere a mesma pasta e depois o caminho mais curto', () => {
    const same = resolver.resolve('Plano', '05-Projects/Cliente A/Reunião.md');
    expect(same).toMatchObject({ path: '05-Projects/Cliente A/Plano.md', ambiguous: true });
    expect(resolver.resolve('Plano', 'Outro/x.md').path).toBe('Plano.md');
  });

  it('resolve anexos, aliases, nomes com ponto e links para a própria nota', () => {
    expect(resolver.resolve('diagrama.png', 'x.md').path).toBe('Attachments/diagrama.png');
    expect(resolver.resolve('Positioning', 'x.md').path).toBe('04-Concepts/Posicionamento.md');
    expect(resolver.resolve('Livro 1.5', 'x.md').path).toBe('02-Sources/Books/Livro 1.5.md');
    expect(resolver.resolve('', 'atual.md').path).toBe('atual.md');
  });

  it('marca links quebrados', () => {
    expect(resolver.resolve('Inexistente', 'x.md')).toEqual({
      path: null,
      ambiguous: false,
      candidates: [],
    });
  });
});
