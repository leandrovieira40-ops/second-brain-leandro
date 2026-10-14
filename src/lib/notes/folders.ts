import type { NoteType } from './types';

/** Nome amigável das pastas padrão do vault (o nome real continua o mesmo no Obsidian/Git). */
const FOLDERS: Record<string, { icon: string; label: string; hint: string }> = {
  '00-Inbox': {
    icon: '📥',
    label: 'Caixa de entrada',
    hint: 'Ideias rápidas, para organizar depois',
  },
  '01-Fleeting-Notes': { icon: '💭', label: 'Rascunhos', hint: 'Pensamentos curtos, ainda soltos' },
  '02-Sources': { icon: '📚', label: 'Fontes', hint: 'O que você leu, viu ou ouviu' },
  '02-Sources/Books': { icon: '📖', label: 'Livros', hint: 'Anotações de livros' },
  '03-Permanent-Notes': { icon: '💡', label: 'Ideias', hint: 'Ideias próprias, já desenvolvidas' },
  '04-Concepts': { icon: '🔤', label: 'Conceitos', hint: 'Definições, um conceito por nota' },
  '05-Projects': { icon: '🎯', label: 'Projetos', hint: 'Coisas com objetivo e prazo' },
  '06-Areas': {
    icon: '🧭',
    label: 'Áreas',
    hint: 'Responsabilidades contínuas (saúde, finanças…)',
  },
  '07-Maps-of-Content': { icon: '🗺️', label: 'Mapas', hint: 'Índices que organizam outras notas' },
  '08-Daily-Notes': { icon: '📅', label: 'Diário', hint: 'Uma nota por dia' },
  '09-Reviews': { icon: '🔁', label: 'Revisões', hint: 'Revisões semanais, mensais…' },
  '10-Templates': { icon: '🧩', label: 'Modelos', hint: 'Modelos usados pelo Obsidian' },
  Attachments: { icon: '📎', label: 'Anexos', hint: 'Imagens e arquivos' },
};

export interface FolderDisplay {
  icon: string;
  label: string;
  hint: string | null;
}

/** Como mostrar uma pasta: nome amigável das pastas padrão; as demais, pelo próprio nome. */
export function folderDisplay(path: string): FolderDisplay {
  if (path === '') return { icon: '🏠', label: 'Raiz do vault', hint: 'Fora de qualquer pasta' };
  const known = FOLDERS[path];
  if (known) return known;
  const name = path.slice(path.lastIndexOf('/') + 1);
  return {
    icon: '📁',
    label: name.replace(/^\d+[-_ ]+/, '').replace(/[-_]+/g, ' ') || name,
    hint: null,
  };
}

/** Caminho completo legível, ex.: "Fontes › Livros". */
export function folderTrail(path: string): string {
  if (path === '') return folderDisplay('').label;
  const parts = path.split('/');
  return parts.map((_, i) => folderDisplay(parts.slice(0, i + 1).join('/')).label).join(' › ');
}

/** O que é cada tipo de nota, em uma frase (aparece ao criar uma nota). */
export const NOTE_TYPE_INFO: Partial<Record<NoteType, { icon: string; hint: string }>> = {
  inbox: { icon: '📥', hint: 'Anote rápido, sem pensar onde guardar' },
  fleeting: { icon: '💭', hint: 'Um pensamento curto para desenvolver depois' },
  permanent: { icon: '💡', hint: 'Uma ideia sua, explicada com suas palavras' },
  concept: { icon: '🔤', hint: 'A definição de um termo ou conceito' },
  source: { icon: '📰', hint: 'Artigo, vídeo, podcast ou site que você consumiu' },
  book: { icon: '📖', hint: 'Resumo e citações de um livro' },
  project: { icon: '🎯', hint: 'Algo com objetivo e prazo' },
  area: { icon: '🧭', hint: 'Uma responsabilidade contínua da sua vida' },
  moc: { icon: '🗺️', hint: 'Um índice que reúne notas de um tema' },
  daily: { icon: '📅', hint: 'O registro de um dia' },
  review: { icon: '🔁', hint: 'Uma revisão da semana, do mês…' },
};
