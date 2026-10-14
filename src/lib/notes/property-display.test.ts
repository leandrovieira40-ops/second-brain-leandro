import { describe, expect, it } from 'vitest';
import { parseFrontmatter } from './frontmatter';
import {
  formatIsoDate,
  formatPropertyValue,
  friendlyPropertyValue,
  isTemplateNote,
  propertyLabel,
} from './property-display';

describe('formatPropertyValue', () => {
  it('mostra placeholders de modelos como foram escritos', () => {
    const { data } = parseFrontmatter(
      '---\ncreated: {{date:YYYY-MM-DD}}\ntitle: "{{title}}"\nother: {{ value }}\n---\n',
    );
    expect(formatPropertyValue(data?.created)).toBe('{{date:YYYY-MM-DD}}');
    expect(formatPropertyValue(data?.title)).toBe('{{title}}');
    expect(formatPropertyValue(data?.other)).toBe('{{value}}');
  });

  it('formata valores comuns', () => {
    expect(formatPropertyValue(null)).toBe('—');
    expect(formatPropertyValue([])).toBe('—');
    expect(formatPropertyValue(['a', 'b'])).toBe('a, b');
    expect(formatPropertyValue({ a: 1 })).toBe('{"a":1}');
    expect(formatPropertyValue(3)).toBe('3');
  });
});

describe('isTemplateNote', () => {
  it('reconhece a pasta de modelos e campos com placeholders', () => {
    expect(isTemplateNote('10-Templates/Nota permanente.md', null)).toBe(true);
    expect(isTemplateNote('Templates/x.md', null)).toBe(true);
    expect(isTemplateNote('04-Concepts/x.md', 'title: "{{title}}"')).toBe(true);
    expect(isTemplateNote('04-Concepts/x.md', 'title: Ideia')).toBe(false);
  });
});

describe('propriedades em português', () => {
  it('traduz nomes conhecidos e mantém os demais', () => {
    expect(propertyLabel('created')).toBe('Criada em');
    expect(propertyLabel('minha_chave')).toBe('minha_chave');
  });

  it('formata datas, tipo e situação', () => {
    expect(formatIsoDate('2026-10-13')).toBe('13/10/2026');
    expect(formatIsoDate('ontem')).toBeNull();
    const labels = { inbox: 'Captura' };
    expect(friendlyPropertyValue('type', 'inbox', labels)).toBe('Captura');
    expect(friendlyPropertyValue('created', '2026-10-13', labels)).toBe('13/10/2026');
    expect(friendlyPropertyValue('status', 'active', labels)).toBe('Ativa');
    expect(friendlyPropertyValue('status', 'outro', labels)).toBe('outro');
    expect(friendlyPropertyValue('tags', [], labels)).toBe('—');
  });
});
