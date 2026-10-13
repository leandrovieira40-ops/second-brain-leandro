import { describe, expect, it } from 'vitest';
import { parseFrontmatter } from './frontmatter';
import { formatPropertyValue, isTemplateNote } from './property-display';

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
