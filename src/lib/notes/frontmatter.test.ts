import { describe, expect, it } from 'vitest';
import {
  applyChange,
  findFrontmatter,
  parseFrontmatter,
  scalarFieldChange,
  toStringList,
} from './frontmatter';

const NOTE = `---
id: 01K7DQ2VQ8M6Z4X0R1S2T3V4W5
title: "Livro: Subtítulo"
created: 2026-10-01
updated: 2026-10-01 # mantido pelo editor
tags: [a, b]
---
# Corpo
texto
`;

describe('parseFrontmatter', () => {
  it('separa YAML e corpo, mantendo datas como texto', () => {
    const parsed = parseFrontmatter(NOTE);
    expect(parsed.error).toBeNull();
    expect(parsed.data).toMatchObject({ title: 'Livro: Subtítulo', created: '2026-10-01' });
    expect(typeof parsed.data?.created).toBe('string');
    expect(parsed.body).toBe('# Corpo\ntexto\n');
  });

  it('sem frontmatter devolve o conteúdo inteiro como corpo', () => {
    const parsed = parseFrontmatter('# Só corpo\n---\nnão é frontmatter\n');
    expect(parsed.block).toBeNull();
    expect(parsed.body).toBe('# Só corpo\n---\nnão é frontmatter\n');
  });

  it('aceita CRLF, BOM e frontmatter vazio', () => {
    expect(parseFrontmatter('---\r\ntitle: x\r\n---\r\ncorpo').data).toEqual({ title: 'x' });
    expect(parseFrontmatter('﻿---\ntitle: x\n---\n').data).toEqual({ title: 'x' });
    expect(parseFrontmatter('---\n---\ncorpo').data).toEqual({});
  });

  it('reporta YAML inválido sem lançar', () => {
    const parsed = parseFrontmatter('---\ntitle: [aberto\n---\ncorpo');
    expect(parsed.data).toBeNull();
    expect(parsed.error).toBeTruthy();
    expect(parsed.body).toBe('corpo');
  });

  it('rejeita frontmatter que não é mapa', () => {
    expect(parseFrontmatter('---\n- a\n- b\n---\n').error).toMatch(/mapa/);
  });

  it('não confunde abertura sem fechamento com frontmatter', () => {
    expect(findFrontmatter('---\ntitle: x\nsem fim')).toBeNull();
  });
});

describe('scalarFieldChange', () => {
  it('altera apenas o valor, preservando comentário e o resto do arquivo', () => {
    const change = scalarFieldChange(NOTE, 'updated', '2026-10-12');
    const result = applyChange(NOTE, change);
    expect(result).toBe(NOTE.replace('updated: 2026-10-01 #', 'updated: 2026-10-12 #'));
    expect(change?.insert).toBe('2026-10-12');
  });

  it('preserva o estilo de aspas', () => {
    const content = "---\nupdated: '2026-01-01'\n---\n";
    expect(applyChange(content, scalarFieldChange(content, 'updated', '2026-10-12'))).toBe(
      "---\nupdated: '2026-10-12'\n---\n",
    );
  });

  it('retorna null quando não há nada a fazer', () => {
    expect(scalarFieldChange('sem frontmatter', 'updated', 'x')).toBeNull();
    expect(scalarFieldChange('---\ntitle: a\n---\n', 'updated', 'x')).toBeNull();
    expect(scalarFieldChange('---\nupdated: x\n---\n', 'updated', 'x')).toBeNull();
    expect(scalarFieldChange('---\nupdated: [x]\n---\n', 'updated', 'y')).toBeNull();
  });

  it('ignora chaves aninhadas e chaves no corpo', () => {
    const content = '---\nmeta:\n  updated: 2020-01-01\n---\nupdated: 2020-01-01\n';
    expect(scalarFieldChange(content, 'updated', '2026-10-12')).toBeNull();
  });

  it('preenche valor vazio', () => {
    const content = '---\nupdated:\n---\n';
    expect(applyChange(content, scalarFieldChange(content, 'updated', '2026-10-12'))).toBe(
      '---\nupdated: 2026-10-12\n---\n',
    );
  });

  it('com encoding yaml, grava um escalar válido mesmo com caracteres especiais', () => {
    const content = '---\ntitle: Antigo # comentário\ntype: note\n---\nCorpo\n';
    const next = applyChange(content, scalarFieldChange(content, 'title', 'Ideia: foco', 'yaml'));
    expect(next).toBe('---\ntitle: "Ideia: foco" # comentário\ntype: note\n---\nCorpo\n');
    expect(parseFrontmatter(next).data?.title).toBe('Ideia: foco');
    const quoted = "---\ntitle: 'Antigo'\n---\n";
    expect(applyChange(quoted, scalarFieldChange(quoted, 'title', 'Novo', 'yaml'))).toBe(
      '---\ntitle: Novo\n---\n',
    );
  });
});

describe('toStringList', () => {
  it('aceita listas e textos separados por vírgula', () => {
    expect(toStringList(['a', ' b ', null, ''])).toEqual(['a', 'b']);
    expect(toStringList('a, b')).toEqual(['a', 'b']);
    expect(toStringList(undefined)).toEqual([]);
  });
});
