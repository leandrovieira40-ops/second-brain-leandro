import type { LinkResolver } from './resolve';
import { parseWikilinkInner } from './wikilinks';

/**
 * Plugin remark: transforma `[[wikilinks]]` em links internos (ou marca links quebrados).
 * Opera só em nós de texto, então código e código inline ficam intactos.
 */
interface Node {
  type: string;
  value?: string;
  url?: string;
  children?: Node[];
  data?: { hName?: string; hProperties?: Record<string, string> };
}

export interface WikilinkOptions {
  resolver: LinkResolver;
  fromPath: string;
  hrefFor: (path: string) => string;
}

const WIKILINK_RE = /(!?)\[\[([^[\]\n]+?)\]\]/g;

export function remarkWikilinks(options: WikilinkOptions) {
  return (tree: Node) => transform(tree, options);
}

function transform(node: Node, options: WikilinkOptions): void {
  if (!node.children) return;
  const next: Node[] = [];
  for (const child of node.children) {
    if (child.type === 'text' && child.value?.includes('[[')) {
      next.push(...splitText(child.value, options));
    } else {
      if (child.type !== 'link' && child.type !== 'linkReference') transform(child, options);
      next.push(child);
    }
  }
  node.children = next;
}

function splitText(value: string, { resolver, fromPath, hrefFor }: WikilinkOptions): Node[] {
  const nodes: Node[] = [];
  let last = 0;
  for (const match of value.matchAll(WIKILINK_RE)) {
    const { target, subpath, alias } = parseWikilinkInner(match[2]!);
    if (!target && !subpath) continue;
    if (match.index > last) nodes.push({ type: 'text', value: value.slice(last, match.index) });
    const label = alias ?? (subpath && target ? `${target} › ${subpath}` : target || subpath || '');
    const resolution = resolver.resolve(target, fromPath);
    if (resolution.path) {
      nodes.push({
        type: 'link',
        url: hrefFor(resolution.path),
        children: [{ type: 'text', value: match[1] ? `📎 ${label}` : label }],
        data: {
          hProperties: {
            className: 'wikilink',
            ...(resolution.ambiguous
              ? { title: `Ambíguo: ${resolution.candidates.length} notas com esse nome` }
              : {}),
          },
        },
      });
    } else {
      nodes.push({
        type: 'wikilinkBroken',
        children: [{ type: 'text', value: label }],
        data: {
          // Botão: o Markdown do usuário nunca gera <button> (HTML bruto é ignorado), só este plugin.
          hName: 'button',
          hProperties: {
            type: 'button',
            className: 'wikilink-broken',
            'data-wikilink-target': target,
            title: 'Nota não encontrada — clique para criá-la.',
          },
        },
      });
    }
    last = match.index + match[0].length;
  }
  if (last < value.length) nodes.push({ type: 'text', value: value.slice(last) });
  return nodes;
}
