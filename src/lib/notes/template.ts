import { stringify } from 'yaml';
import type { NoteType } from './types';

export interface NewNoteInput {
  id: string;
  title: string;
  type: NoteType;
  /** Data `AAAA-MM-DD`. */
  today: string;
  tags?: string[];
  /** Valores para campos do modelo (ex.: `author` de uma fonte); campos desconhecidos são ignorados. */
  fields?: Record<string, string>;
  /** Corpo da nota no lugar das seções vazias do modelo. */
  body?: string;
}

const yamlScalar = (value: string) => stringify(value, { lineWidth: 0 }).trimEnd();

const EXTRA_FIELDS: Partial<Record<NoteType, (today: string) => string[]>> = {
  source: (today) => ['source_type:', 'author:', 'url:', 'published:', `captured: ${today}`],
  book: () => [
    'author:',
    'publisher:',
    'year:',
    'isbn:',
    'reading_status: to-read',
    'started:',
    'finished:',
    'rating:',
    'metadata_origin: user',
  ],
  project: () => ['project_status: active', 'goal:'],
  permanent: () => ['sources: []'],
  concept: () => ['sources: []'],
};

const BODY: Partial<Record<NoteType, string>> = {
  permanent: '## Ideia\n\n## Por que importa\n\n## Conexões\n\n## Fontes\n',
  concept: '## Definição\n\n## Exemplos\n\n## Relações\n',
  source: '## Resumo (meu)\n\n## Ideias centrais\n\n## Citações\n\n## Aplicações práticas\n',
  book: '## Resumo\n\n## Principais ideias\n\n## Citações\n\n## Aplicações práticas\n\n## Perguntas ainda não respondidas\n',
  project:
    '## Contexto\n\n## Objetivos\n\n## Hipóteses\n\n## Decisões\n\n## Resultados\n\n## Lições aprendidas\n\n## Próximas ações\n',
};

/** Conteúdo inicial de uma nota criada pela aplicação (ver DATA_MODEL.md). */
export function newNoteContent({
  id,
  title,
  type,
  today,
  tags,
  fields,
  body,
}: NewNoteInput): string {
  const extra = (EXTRA_FIELDS[type]?.(today) ?? []).map((line) => {
    const key = line.slice(0, line.indexOf(':'));
    const value = fields?.[key]?.trim();
    return value && line === `${key}:` ? `${key}: ${yamlScalar(value)}` : line;
  });
  const lines = [
    '---',
    `id: ${id}`,
    `title: ${yamlScalar(title)}`,
    `type: ${type}`,
    `created: ${today}`,
    `updated: ${today}`,
    tags?.length ? `tags: [${tags.map(yamlScalar).join(', ')}]` : 'tags: []',
    'aliases: []',
    ...extra,
    `status: ${type === 'permanent' ? 'draft' : 'active'}`,
    '---',
    '',
  ];
  return `${lines.join('\n')}${body ?? BODY[type] ?? ''}`;
}
