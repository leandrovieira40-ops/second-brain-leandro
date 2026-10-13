import { basename } from '@/lib/vault/paths';
import { findFrontmatter } from './frontmatter';
import { LinkResolver } from './resolve';
import { extractWikilinks } from './wikilinks';

/** Os dois mundos de uma renomeação: o vault antes e depois de `oldPath` virar `newPath`. */
export interface RenameContext {
  oldPath: string;
  newPath: string;
  before: LinkResolver;
  after: LinkResolver;
}

export function renameContext(input: {
  oldPath: string;
  newPath: string;
  /** Todos os arquivos visíveis do vault ANTES da renomeação (notas e anexos). */
  paths: readonly string[];
  aliases: ReadonlyMap<string, readonly string[]>;
}): RenameContext {
  const { oldPath, newPath } = input;
  const afterPaths = [...input.paths.filter((path) => path !== oldPath), newPath];
  const afterAliases = new Map(input.aliases);
  const moved = afterAliases.get(oldPath);
  afterAliases.delete(oldPath);
  if (moved) afterAliases.set(newPath, moved);
  return {
    oldPath,
    newPath,
    before: new LinkResolver(input.paths, input.aliases),
    after: new LinkResolver(afterPaths, afterAliases),
  };
}

/**
 * Para onde o link `target`, escrito na nota `sourceBefore`, precisa apontar depois da renomeação —
 * ou `null` se ele continua certo sem mudar (ou já estava quebrado; links quebrados não são tocados).
 */
export function retargetedLink(
  target: string,
  sourceBefore: string,
  sourceAfter: string,
  context: RenameContext,
): string | null {
  if (!target) return null; // `[[#Seção]]`: a própria nota
  const before = context.before.resolve(target, sourceBefore).path;
  if (!before) return null;
  const desired = before === context.oldPath ? context.newPath : before;
  return context.after.resolve(target, sourceAfter).path === desired ? null : desired;
}

/**
 * O texto de link mais curto que resolve, sem ambiguidade, para `desired` a partir de `fromPath`:
 * só o nome, depois `pasta/nome`, …, até o caminho completo (como o Obsidian faz).
 */
export function shortestLinkTarget(
  desired: string,
  fromPath: string,
  resolver: LinkResolver,
  style: { withExtension: boolean; withFolder: boolean },
): string {
  const isNote = /\.md$/i.test(desired);
  const strip = (value: string) =>
    isNote && !style.withExtension ? value.replace(/\.md$/i, '') : value;
  const parts = desired.split('/');
  const start = style.withFolder ? Math.max(parts.length - 2, 0) : parts.length - 1;
  for (let i = start; i > 0; i--) {
    const candidate = strip(parts.slice(i).join('/'));
    const resolution = resolver.resolve(candidate, fromPath);
    if (resolution.path === desired && !resolution.ambiguous) return candidate;
  }
  return strip(desired);
}

/**
 * Reescreve os `[[links]]` do corpo de uma nota que mudariam de destino com a renomeação. Só o
 * destino é trocado: subcaminho (`#Seção`), apelido (`|texto`), embed (`!`) e o resto do texto ficam
 * byte a byte iguais. Links em código, comentários e no frontmatter não são tocados.
 */
export function rewriteLinksForRename(
  content: string,
  sourceBefore: string,
  sourceAfter: string,
  context: RenameContext,
): { content: string; changed: number } {
  const bodyStart = findFrontmatter(content)?.bodyStart ?? 0;
  const body = content.slice(bodyStart);
  const edits: { from: number; to: number; insert: string }[] = [];
  for (const link of extractWikilinks(body)) {
    const desired = retargetedLink(link.target, sourceBefore, sourceAfter, context);
    if (!desired) continue;
    const next = shortestLinkTarget(desired, sourceAfter, context.after, {
      withExtension: /\.md$/i.test(link.target),
      withFolder: link.target.includes('/'),
    });
    const open = link.raw.indexOf('[[') + 2;
    const at = link.raw.indexOf(link.target, open);
    if (at === -1) continue;
    const from = bodyStart + link.start + at;
    edits.push({ from, to: from + link.target.length, insert: next });
  }
  let result = content;
  for (const edit of edits.reverse()) {
    result = result.slice(0, edit.from) + edit.insert + result.slice(edit.to);
  }
  return { content: result, changed: edits.length };
}

/** Notas (do grafo de links) cujos links podem mudar de destino com a renomeação. */
export function affectedSources(
  links: readonly { sourcePath: string; targetRaw: string }[],
  context: RenameContext,
): string[] {
  const affected = new Set<string>();
  for (const link of links) {
    if (link.sourcePath === context.oldPath || affected.has(link.sourcePath)) continue;
    if (retargetedLink(link.targetRaw, link.sourcePath, link.sourcePath, context)) {
      affected.add(link.sourcePath);
    }
  }
  return [...affected].sort();
}

/** `title` do frontmatter acompanha o nome do arquivo quando o nome veio do título. */
export function followsFileName(title: unknown, path: string, toFileName: (t: string) => string) {
  if (typeof title !== 'string' || !title.trim()) return false;
  try {
    return toFileName(title) === basename(path);
  } catch {
    return false;
  }
}
