import { basename, dirname } from '@/lib/vault/paths';

export interface LinkResolution {
  /** Caminho do arquivo resolvido, ou `null` se não existir (link quebrado). */
  path: string | null;
  /** Mais de um candidato; o escolhido segue as regras abaixo. */
  ambiguous: boolean;
  candidates: string[];
}

const key = (value: string) => value.normalize('NFC').toLocaleLowerCase('und');
const withMd = (value: string) => (/\.md$/i.test(value) ? [value] : [`${value}.md`, value]);

/**
 * Índice de resolução de `[[links]]` com a semântica do Obsidian:
 * caminho exato → sufixo de caminho → nome do arquivo (sem diferenciar maiúsculas) → alias.
 * Em ambiguidade vence o arquivo na pasta da nota de origem e, depois, o caminho mais curto.
 */
export class LinkResolver {
  private readonly byPath = new Map<string, string>();
  private readonly byName = new Map<string, string[]>();
  private readonly byAlias = new Map<string, string[]>();

  constructor(paths: readonly string[], aliases: ReadonlyMap<string, readonly string[]> = new Map()) {
    for (const path of paths) {
      this.byPath.set(key(path), path);
      const name = basename(path);
      const names = name.toLowerCase().endsWith('.md') ? [name, name.slice(0, -3)] : [name];
      for (const n of names) push(this.byName, key(n), path);
    }
    for (const [path, list] of aliases) {
      for (const alias of list) push(this.byAlias, key(alias), path);
    }
  }

  resolve(target: string, fromPath: string): LinkResolution {
    const normalized = target.normalize('NFC').trim().replace(/^\.?\//, '');
    if (normalized === '') return { path: fromPath, ambiguous: false, candidates: [fromPath] };

    const variants = withMd(normalized);

    if (normalized.includes('/')) {
      for (const variant of variants) {
        const exact = this.byPath.get(key(variant));
        if (exact) return { path: exact, ambiguous: false, candidates: [exact] };
      }
      const suffixMatches = [...this.byPath.values()].filter((path) =>
        variants.some((variant) => key(path).endsWith(`/${key(variant)}`)),
      );
      if (suffixMatches.length > 0) return pick(suffixMatches, fromPath);
    }

    const nameMatches = withMd(basename(normalized))
      .map((variant) => this.byName.get(key(variant)))
      .find((list) => list && list.length > 0);
    if (nameMatches && nameMatches.length > 0) return pick(nameMatches, fromPath);

    const aliasMatches = this.byAlias.get(key(normalized));
    if (aliasMatches && aliasMatches.length > 0) return pick(aliasMatches, fromPath);

    return { path: null, ambiguous: false, candidates: [] };
  }
}

function push(map: Map<string, string[]>, k: string, value: string) {
  const list = map.get(k);
  if (list) {
    if (!list.includes(value)) list.push(value);
  } else {
    map.set(k, [value]);
  }
}

function pick(candidates: string[], fromPath: string): LinkResolution {
  const unique = [...new Set(candidates)];
  if (unique.length === 1) return { path: unique[0]!, ambiguous: false, candidates: unique };
  const folder = dirname(fromPath);
  const sameFolder = unique.filter((path) => dirname(path) === folder);
  const pool = sameFolder.length > 0 ? sameFolder : unique;
  const sorted = [...pool].sort((a, b) => a.length - b.length || a.localeCompare(b));
  return { path: sorted[0]!, ambiguous: true, candidates: unique };
}
