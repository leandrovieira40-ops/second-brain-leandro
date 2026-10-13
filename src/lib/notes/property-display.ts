/**
 * Texto exibido para um valor de propriedade do frontmatter. Placeholders de modelos do Obsidian
 * (`{{title}}`, `{{date:YYYY-MM-DD}}`) sem aspas viram mapas no YAML (`{ "{ date:… }": null }`);
 * aqui eles voltam a aparecer como foram escritos.
 */
export function formatPropertyValue(value: unknown): string {
  if (value === null || value === undefined || value === '') return '—';
  if (Array.isArray(value)) return value.length ? value.map(formatPropertyValue).join(', ') : '—';
  if (typeof value === 'object') {
    const placeholder = templatePlaceholder(value as Record<string, unknown>);
    return placeholder ?? JSON.stringify(value);
  }
  return String(value);
}

function templatePlaceholder(value: Record<string, unknown>): string | null {
  const entries = Object.entries(value);
  if (entries.length !== 1) return null;
  const [key, inner] = entries[0]!;
  if (inner !== null) return null;
  // `{{x}}` → { "{x}": null } (o YAML lê as chaves externas como mapa e a interna como chave).
  const match = /^\{\s*(.*?)\s*\}$/.exec(key.trim());
  return match ? `{{${match[1]}}}` : null;
}

/** Arquivo de modelo (pasta de templates ou campos com `{{…}}`): os placeholders são intencionais. */
export function isTemplateNote(path: string, rawFrontmatter: string | null): boolean {
  if (path.split('/').some((segment) => /^(\d+-)?templates?$/i.test(segment))) return true;
  return rawFrontmatter !== null && /\{\{[^}]+\}\}/.test(rawFrontmatter);
}
