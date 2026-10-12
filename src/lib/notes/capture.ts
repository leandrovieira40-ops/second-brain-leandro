/** Título de uma captura rápida: primeira linha com texto, sem marcação Markdown (máx. 80 caracteres). */
export function captureTitle(text: string, stamp: string): string {
  const line = text
    .split(/\r?\n/)
    .map((value) => value.trim())
    .find((value) => value.length > 0);
  let title = (line ?? '')
    .replace(/^(#{1,6}\s+|[-*+]\s+(\[[ xX]\]\s+)?|>\s*|\d+[.)]\s+)/, '')
    .replace(
      /!?\[\[([^\]|#]+)(#[^\]|]*)?(\|([^\]]+))?\]\]/g,
      (_m, target, _s, _p, alias) => alias ?? target,
    )
    .replace(/!?\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/[*_`~]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  if (title.length > 80) {
    const cut = title.slice(0, 80);
    const space = cut.lastIndexOf(' ');
    title = (space > 40 ? cut.slice(0, space) : cut).trim();
  }
  return /[\p{L}\p{N}]/u.test(title) ? title : `Captura ${stamp}`;
}
