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

/** Nome em português das propriedades usadas pelo vault (as demais aparecem como estão). */
const PROPERTY_LABELS: Record<string, string> = {
  id: 'Identificador',
  title: 'Título',
  type: 'Tipo',
  created: 'Criada em',
  updated: 'Editada em',
  tags: 'Tags',
  aliases: 'Outros nomes',
  status: 'Situação',
  sources: 'Fontes',
  source_type: 'Tipo de fonte',
  author: 'Autor',
  url: 'Link',
  published: 'Publicado em',
  captured: 'Capturado em',
  publisher: 'Editora',
  year: 'Ano',
  isbn: 'ISBN',
  reading_status: 'Leitura',
  started: 'Começou em',
  finished: 'Terminou em',
  rating: 'Avaliação',
  metadata_origin: 'Origem dos dados',
  project_status: 'Situação do projeto',
  goal: 'Objetivo',
};

const VALUE_LABELS: Record<string, string> = {
  active: 'Ativa',
  draft: 'Rascunho',
  archived: 'Arquivada',
  done: 'Concluída',
  paused: 'Pausada',
  'to-read': 'Para ler',
  reading: 'Lendo',
  read: 'Lida',
  abandoned: 'Abandonada',
  user: 'Você',
};

/** Propriedades técnicas: ficam em "Informações técnicas" no painel. */
export const TECHNICAL_PROPERTIES = new Set(['id', 'metadata_origin']);

export function propertyLabel(key: string): string {
  return PROPERTY_LABELS[key] ?? key;
}

/** `2026-10-13` → `13/10/2026` (datas do vault são texto `AAAA-MM-DD`). */
export function formatIsoDate(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.trim());
  return match ? `${match[3]}/${match[2]}/${match[1]}` : null;
}

/** Valor de uma propriedade para leitura: tipo, situação e datas em português. */
export function friendlyPropertyValue(
  key: string,
  value: unknown,
  typeLabels: Record<string, string>,
): string {
  if (key === 'type' && typeof value === 'string') return typeLabels[value] ?? value;
  const date = formatIsoDate(value);
  if (date) return date;
  if (
    (key === 'status' ||
      key === 'reading_status' ||
      key === 'project_status' ||
      key === 'metadata_origin') &&
    typeof value === 'string'
  )
    return VALUE_LABELS[value] ?? value;
  return formatPropertyValue(value);
}
