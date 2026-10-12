export const NOTE_TYPES = [
  'inbox',
  'fleeting',
  'source',
  'book',
  'permanent',
  'concept',
  'project',
  'area',
  'moc',
  'daily',
  'review',
  'template',
  'note',
] as const;

export type NoteType = (typeof NOTE_TYPES)[number];

export function isNoteType(value: unknown): value is NoteType {
  return typeof value === 'string' && (NOTE_TYPES as readonly string[]).includes(value);
}

/** Destino padrão de novas notas por tipo. A aplicação nunca depende do nome da pasta (ADR-0001). */
export const DEFAULT_FOLDER_BY_TYPE: Record<NoteType, string> = {
  inbox: '00-Inbox',
  fleeting: '01-Fleeting-Notes',
  source: '02-Sources',
  book: '02-Sources/Books',
  permanent: '03-Permanent-Notes',
  concept: '04-Concepts',
  project: '05-Projects',
  area: '06-Areas',
  moc: '07-Maps-of-Content',
  daily: '08-Daily-Notes',
  review: '09-Reviews',
  template: '10-Templates',
  note: '00-Inbox',
};

export const NOTE_TYPE_LABELS: Record<NoteType, string> = {
  inbox: 'Captura (Inbox)',
  fleeting: 'Nota passageira',
  source: 'Fonte',
  book: 'Livro',
  permanent: 'Nota permanente',
  concept: 'Conceito',
  project: 'Projeto',
  area: 'Área',
  moc: 'Mapa de conteúdo',
  daily: 'Nota diária',
  review: 'Revisão',
  template: 'Template',
  note: 'Nota',
};

export const INBOX_FOLDER = DEFAULT_FOLDER_BY_TYPE.inbox;
