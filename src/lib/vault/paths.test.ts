import { describe, expect, it } from 'vitest';
import {
  assertFolderPath,
  assertNotePath,
  collisionKey,
  InvalidPathError,
  isHiddenPath,
  normalizeVaultPath,
  noteName,
} from './paths';

describe('normalizeVaultPath', () => {
  it('aceita caminhos relativos simples sem alterar a forma Unicode', () => {
    const nfc = 'Ideias/Posição.md'.normalize('NFC');
    const nfd = nfc.normalize('NFD');
    expect(nfd).not.toBe(nfc);
    expect(normalizeVaultPath(nfd)).toBe(nfd);
    expect(normalizeVaultPath(nfc)).toBe(nfc);
    expect(normalizeVaultPath('00-Inbox/Nota.md')).toBe('00-Inbox/Nota.md');
  });

  it.each([
    ['', 'vazio'],
    ['/etc/passwd', 'absoluto'],
    ['../segredo.md', 'travessia'],
    ['a/../../b.md', 'travessia no meio'],
    ['a/./b.md', 'segmento ponto'],
    ['a//b.md', 'segmento vazio'],
    ['a\\b.md', 'barra invertida'],
    ['a/b\0.md', 'nulo'],
    ['a/ b.md', 'espaço no início do segmento'],
    ['a/b\n.md', 'controle'],
    ['x'.repeat(401), 'longo'],
  ])('rejeita %j (%s)', (input) => {
    expect(() => normalizeVaultPath(input)).toThrow(InvalidPathError);
  });
});

describe('assertNotePath', () => {
  it('exige .md e bloqueia pastas ocultas', () => {
    expect(assertNotePath('Projetos/Plano.md')).toBe('Projetos/Plano.md');
    expect(() => assertNotePath('Projetos/Plano.txt')).toThrow(InvalidPathError);
    expect(() => assertNotePath('.git/config.md')).toThrow(InvalidPathError);
    expect(() => assertNotePath('.obsidian/app.md')).toThrow(InvalidPathError);
    expect(() => assertNotePath('Pasta/.oculto/x.md')).toThrow(InvalidPathError);
  });
});

describe('assertFolderPath', () => {
  it('aceita raiz e remove barra final', () => {
    expect(assertFolderPath('')).toBe('');
    expect(assertFolderPath('02-Sources/Books/')).toBe('02-Sources/Books');
    expect(() => assertFolderPath('.trash')).toThrow(InvalidPathError);
    expect(() => assertFolderPath('../fora')).toThrow(InvalidPathError);
  });
});

describe('utilitários', () => {
  it('detecta caminhos ocultos e extrai nome da nota', () => {
    expect(isHiddenPath('a/.trash/b.md')).toBe(true);
    expect(isHiddenPath('a/b.md')).toBe(false);
    expect(noteName('a/b/Minha Nota.md')).toBe('Minha Nota');
  });

  it('gera a mesma chave de colisão para variações de caixa e Unicode', () => {
    expect(collisionKey('Nota.md')).toBe(collisionKey('nota.md'));
    expect(collisionKey('Ação.md')).toBe(collisionKey('AÇÃO.md'));
  });
});
