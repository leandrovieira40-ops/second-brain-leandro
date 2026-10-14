import { describe, expect, it } from 'vitest';
import { folderDisplay, folderTrail } from './folders';

describe('folderDisplay', () => {
  it('usa nomes amigáveis para as pastas padrão e limpa os demais nomes', () => {
    expect(folderDisplay('00-Inbox').label).toBe('Caixa de entrada');
    expect(folderDisplay('02-Sources/Books').label).toBe('Livros');
    expect(folderDisplay('').label).toBe('Raiz do vault');
    expect(folderDisplay('11-Leituras_da_semana').label).toBe('Leituras da semana');
    expect(folderDisplay('Clientes/Acme').label).toBe('Acme');
  });

  it('monta o caminho legível', () => {
    expect(folderTrail('02-Sources/Books')).toBe('Fontes › Livros');
    expect(folderTrail('05-Projects/Site novo')).toBe('Projetos › Site novo');
  });
});
