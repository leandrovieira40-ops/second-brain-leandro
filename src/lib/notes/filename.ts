import { MAX_PATH_LENGTH } from '@/lib/vault/paths';

export const MAX_FILE_NAME_LENGTH = 120;

const WINDOWS_RESERVED = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/i;

export class InvalidTitleError extends Error {
  override readonly name = 'InvalidTitleError';
}

/**
 * Converte um título em nome de arquivo seguro em Windows/macOS/Linux e utilizável em `[[links]]` do
 * Obsidian. Acentos e maiúsculas são preservados. Ver ADR-0012.
 */
export function titleToFileName(title: string): string {
  let name = title
    .normalize('NFC')
    .replace(/:/g, ' -')
    .replace(/[\\/*?"<>|#^[\]\u0000-\u001f\u007f]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^[.\s]+/, '')
    .replace(/[.\s]+$/, '');

  if (name.length > MAX_FILE_NAME_LENGTH) {
    name = name.slice(0, MAX_FILE_NAME_LENGTH).replace(/[.\s]+$/, '');
  }
  if (name.length === 0) throw new InvalidTitleError('O título precisa ter letras ou números.');
  if (WINDOWS_RESERVED.test(name)) name = `${name}_`;
  return `${name}.md`;
}

/** Caminho completo, garantindo o limite total de tamanho. */
export function noteFilePath(folder: string, title: string): string {
  const file = titleToFileName(title);
  const path = folder ? `${folder}/${file}` : file;
  if (path.length > MAX_PATH_LENGTH) throw new InvalidTitleError('Caminho longo demais.');
  return path;
}

/** `Nota (conflito 2026-10-12 1830).md` na mesma pasta da original. */
export function conflictCopyPath(path: string, now: Date, timeZone: string): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(now);
  const get = (type: string) => parts.find((part) => part.type === type)?.value ?? '00';
  const stamp = `${get('year')}-${get('month')}-${get('day')} ${get('hour')}${get('minute')}`;
  return path.replace(/\.md$/i, ` (conflito ${stamp}).md`);
}
