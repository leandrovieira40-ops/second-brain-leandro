/**
 * Substitui por espaços (preservando offsets e quebras de linha) os trechos de Markdown onde links e
 * tags não devem ser reconhecidos: blocos de código cercados, código inline e comentários `%% %%`.
 */
export function maskNonProse(markdown: string): string {
  const chars = markdown.split('');
  const blank = (from: number, to: number) => {
    for (let i = from; i < to; i++) if (chars[i] !== '\n' && chars[i] !== '\r') chars[i] = ' ';
  };

  // Blocos cercados (``` ou ~~~), linha a linha.
  const lines = markdown.split('\n');
  let offset = 0;
  let fence: { char: string; length: number } | null = null;
  let fenceStart = 0;
  for (const line of lines) {
    const lineEnd = offset + line.length;
    const match = /^ {0,3}(`{3,}|~{3,})/.exec(line);
    if (fence) {
      if (match && match[1]![0] === fence.char && match[1]!.length >= fence.length && line.trim() === match[1]) {
        blank(fenceStart, lineEnd);
        fence = null;
      }
    } else if (match) {
      fence = { char: match[1]![0]!, length: match[1]!.length };
      fenceStart = offset;
    }
    offset = lineEnd + 1;
  }
  if (fence) blank(fenceStart, markdown.length); // bloco não fechado vai até o fim

  // Código inline: sequência de N crases até a próxima sequência de exatamente N crases.
  const masked = chars.join('');
  const inlineRe = /(`+)([\s\S]*?[^`])\1(?!`)/g;
  for (const match of masked.matchAll(inlineRe)) {
    blank(match.index, match.index + match[0].length);
  }

  // Comentários do Obsidian.
  for (const match of chars.join('').matchAll(/%%[\s\S]*?%%/g)) {
    blank(match.index, match.index + match[0].length);
  }
  return chars.join('');
}
