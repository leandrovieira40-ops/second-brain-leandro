import { describe, expect, it } from 'vitest';
import { folderDisplay, folderOptions, folderTrail } from './folders';

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

describe('folderOptions', () => {
  it('inclui a raiz e a pasta atual, esconde pastas ocultas e ordena', () => {
    expect(folderOptions(['05-Projects', '.trash', '00-Inbox', '00-Inbox/.x'], 'Nova')).toEqual([
      '',
      '00-Inbox',
      '05-Projects',
      'Nova',
    ]);
  });
});
