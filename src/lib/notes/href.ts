/** Endereço da página de uma nota (usado por componentes de servidor e de cliente). */
export function noteHref(path: string): string {
  return `/note?path=${encodeURIComponent(path)}`;
}
