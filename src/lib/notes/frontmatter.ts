import { isMap, parseDocument, stringify } from 'yaml';

/** Bloco de frontmatter delimitado por `---` na primeira linha (compatível com Obsidian). */
export interface FrontmatterBlock {
  /** Texto YAML entre os delimitadores. */
  yaml: string;
  /** Offset (no texto original) do início do YAML. */
  yamlStart: number;
  /** Offset do fim do YAML (início da linha de fechamento). */
  yamlEnd: number;
  /** Offset onde o corpo começa (após a linha de fechamento). */
  bodyStart: number;
}

export interface ParsedFrontmatter {
  block: FrontmatterBlock | null;
  data: Record<string, unknown> | null;
  /** Mensagem de erro de YAML, se houver. Nunca impede salvar (ADR-0008). */
  error: string | null;
  body: string;
}

const BOM = '﻿';

export function findFrontmatter(content: string): FrontmatterBlock | null {
  const start = content.startsWith(BOM) ? 1 : 0;
  const open = /^---[ \t]*\r?\n/.exec(content.slice(start));
  if (!open) return null;
  const yamlStart = start + open[0].length;
  const closeRe = /^(?:---|\.\.\.)[ \t]*(?:\r?\n|$)/gm;
  closeRe.lastIndex = yamlStart;
  // Frontmatter vazio: a linha de fechamento vem logo em seguida.
  const match = closeRe.exec(content);
  if (!match) return null;
  return {
    yaml: content.slice(yamlStart, match.index),
    yamlStart,
    yamlEnd: match.index,
    bodyStart: match.index + match[0].length,
  };
}

export function parseFrontmatter(content: string): ParsedFrontmatter {
  const block = findFrontmatter(content);
  if (!block) return { block: null, data: null, error: null, body: content };

  const body = content.slice(block.bodyStart);
  if (block.yaml.trim() === '') return { block, data: {}, error: null, body };

  // YAML 1.2 / schema core: datas continuam strings (ADR-0012).
  const doc = parseDocument(block.yaml, { prettyErrors: false, uniqueKeys: false });
  if (doc.errors.length > 0) {
    return { block, data: null, error: doc.errors[0]?.message ?? 'YAML inválido', body };
  }
  if (!isMap(doc.contents)) {
    return { block, data: null, error: 'O frontmatter deve ser um mapa chave: valor', body };
  }
  const data = doc.toJS({ maxAliasCount: 50 }) as Record<string, unknown>;
  return { block, data, error: null, body };
}

export interface TextChange {
  from: number;
  to: number;
  insert: string;
}

/**
 * Calcula a menor alteração que define `key: value` numa chave escalar de primeiro nível já existente
 * no frontmatter. Retorna `null` se a chave não existir, não for escalar de uma linha ou já tiver o
 * valor. Nunca reformata o restante do YAML (ADR-0012).
 */
export function scalarFieldChange(
  content: string,
  key: string,
  value: string,
  /** `yaml`: grava o valor como escalar YAML válido (com aspas se precisar), em vez de manter as aspas. */
  encoding: 'keep-quotes' | 'yaml' = 'keep-quotes',
): TextChange | null {
  const block = findFrontmatter(content);
  if (!block) return null;
  const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const lineRe = new RegExp(`^${escaped}:[ \\t]*([^\\r\\n]*)$`, 'm');
  const match = lineRe.exec(block.yaml);
  if (!match) return null;

  const raw = match[1] ?? '';
  // Comentário no fim da linha é preservado.
  const commentIndex = raw.search(/\s#/);
  const valuePart = (commentIndex === -1 ? raw : raw.slice(0, commentIndex)).trimEnd();
  if (/^[[{|>&*!]/.test(valuePart)) return null; // não é escalar simples

  const quote = valuePart.startsWith('"') ? '"' : valuePart.startsWith("'") ? "'" : '';
  const current = quote ? valuePart.slice(1, -1) : valuePart;
  if (current === value) return null;

  const valueOffset = block.yamlStart + match.index + match[0].length - raw.length;
  // `updated:` sem espaço após os dois-pontos precisa de um, senão o YAML muda de sentido.
  const separator = match[0].length === key.length + 1 ? ' ' : '';
  const encoded =
    encoding === 'yaml' ? stringify(value, { lineWidth: 0 }).trimEnd() : `${quote}${value}${quote}`;
  return {
    from: valueOffset,
    to: valueOffset + valuePart.length,
    insert: `${separator}${encoded}`,
  };
}

export function applyChange(content: string, change: TextChange | null): string {
  if (!change) return content;
  return content.slice(0, change.from) + change.insert + content.slice(change.to);
}

/** Lista de strings a partir de valores de frontmatter que o Obsidian aceita (lista ou texto). */
export function toStringList(value: unknown): string[] {
  if (value === null || value === undefined) return [];
  const items = Array.isArray(value) ? value : String(value).split(',');
  return items
    .filter((item) => item !== null && item !== undefined)
    .map((item) => String(item).trim())
    .filter((item) => item.length > 0);
}
