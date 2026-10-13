/** Marcadores que o índice coloca em volta dos termos encontrados (ver lib/index/queries). */
const START = '\u0002';
const END = '\u0003';

export interface Segment {
  text: string;
  mark: boolean;
}

/**
 * Divide o trecho da busca em partes destacadas e normais, para renderizar como TEXTO (React escapa
 * tudo). Marcadores soltos ou aninhados nunca viram HTML; outros caracteres de controle somem.
 */
export function splitHighlights(snippet: string): Segment[] {
  const segments: Segment[] = [];
  let mark = false;
  let text = '';
  const flush = () => {
    if (text) segments.push({ text, mark });
    text = '';
  };
  for (const char of snippet) {
    if (char === START || char === END) {
      flush();
      mark = char === START;
    } else if (!/[\u0000-\u0008\u000b-\u001f\u007f]/.test(char)) {
      text += char;
    }
  }
  flush();
  return segments;
}
