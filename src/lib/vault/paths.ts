/**
 * Regras de caminho dentro do vault. Toda entrada vinda do cliente passa por aqui antes de chegar a
 * um adaptador de persistência — inclusive o adaptador local, que ainda confina o caminho resolvido
 * ao diretório raiz.
 */

export const MAX_PATH_LENGTH = 400;

export class InvalidPathError extends Error {
  override readonly name = 'InvalidPathError';
  constructor(readonly reason: string) {
    super(`Caminho inválido: ${reason}`);
  }
}

/**
 * Valida um caminho relativo do vault. Não altera a forma Unicode: um arquivo existente gravado em NFD
 * (comum em macOS) precisa ser endereçado exatamente como está. Nomes **novos** são gerados em NFC
 * (`titleToFileName`) e colisões são comparadas com `collisionKey`. Lança `InvalidPathError`.
 */
export function normalizeVaultPath(input: string): string {
  if (typeof input !== 'string') throw new InvalidPathError('não é texto');
  if (input.includes('\0')) throw new InvalidPathError('contém caractere nulo');
  if (input.includes('\\')) throw new InvalidPathError('use "/" como separador');

  const path = input.trim();
  if (path.length === 0) throw new InvalidPathError('vazio');
  if (path.length > MAX_PATH_LENGTH) throw new InvalidPathError('longo demais');
  if (path.startsWith('/')) throw new InvalidPathError('deve ser relativo');

  const segments = path.split('/');
  for (const segment of segments) {
    if (segment.length === 0) throw new InvalidPathError('segmento vazio');
    if (segment === '.' || segment === '..') throw new InvalidPathError('segmento relativo');
    if (segment !== segment.trim()) throw new InvalidPathError('espaço no início/fim de segmento');
    if (/[\u0000-\u001f\u007f]/.test(segment)) throw new InvalidPathError('caractere de controle');
  }
  return segments.join('/');
}

/** Segmentos iniciados por "." (`.git`, `.obsidian`, `.trash`, `.second-brain`) não são notas. */
export function isHiddenPath(path: string): boolean {
  return path.split('/').some((segment) => segment.startsWith('.'));
}

export function isMarkdownPath(path: string): boolean {
  return path.toLowerCase().endsWith('.md');
}

/** Valida um caminho de nota acessível pela API: normalizado, visível e terminado em `.md`. */
export function assertNotePath(input: string): string {
  const path = normalizeVaultPath(input);
  if (isHiddenPath(path)) throw new InvalidPathError('pastas ocultas não são acessíveis');
  if (!isMarkdownPath(path)) throw new InvalidPathError('notas devem terminar em .md');
  return path;
}

/** Valida uma pasta de destino (pode ser vazia = raiz do vault). */
export function assertFolderPath(input: string): string {
  if (input.trim() === '') return '';
  const path = normalizeVaultPath(input.replace(/\/+$/, ''));
  if (isHiddenPath(path)) throw new InvalidPathError('pastas ocultas não são acessíveis');
  return path;
}

/** Chave usada para detectar colisões em sistemas de arquivos que ignoram maiúsculas (macOS/Windows). */
export function collisionKey(path: string): string {
  return path.normalize('NFC').toLocaleLowerCase('und');
}

export function dirname(path: string): string {
  const index = path.lastIndexOf('/');
  return index === -1 ? '' : path.slice(0, index);
}

export function basename(path: string): string {
  const index = path.lastIndexOf('/');
  return index === -1 ? path : path.slice(index + 1);
}

/** Nome da nota sem a extensão `.md`. */
export function noteName(path: string): string {
  return basename(path).replace(/\.md$/i, '');
}

export function joinPath(folder: string, name: string): string {
  return folder ? `${folder}/${name}` : name;
}
