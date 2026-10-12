import { sql } from 'drizzle-orm';
import type { Database } from '@/lib/db/connect';

/** Marcadores de destaque nos trechos (caracteres de controle: não aparecem em notas). */
export const HIGHLIGHT_START = '\u0002';
export const HIGHLIGHT_END = '\u0003';

export interface SearchFilters {
  q: string;
  type?: string | null;
  tag?: string | null;
  folder?: string | null;
  limit?: number;
}

export interface SearchHit {
  path: string;
  title: string;
  type: string;
  tags: string[];
  /** Trecho com os termos entre HIGHLIGHT_START/HIGHLIGHT_END. */
  snippet: string;
  rank: number;
}

/** Termos da busca: palavras (letras/dígitos), `#tag` vira filtro. Prefixo em cada termo (busca ao digitar). */
export function parseQuery(input: string): { terms: string[]; tags: string[] } {
  const tags: string[] = [];
  const terms: string[] = [];
  for (const raw of input.normalize('NFC').split(/\s+/)) {
    if (raw.startsWith('#') && raw.length > 1) {
      tags.push(raw.slice(1).replace(/[^\p{L}\p{N}_\-/]/gu, ''));
      continue;
    }
    for (const word of raw.split(/[^\p{L}\p{N}]+/u)) if (word) terms.push(word);
  }
  return { terms: terms.slice(0, 8), tags: tags.filter(Boolean).slice(0, 4) };
}

export async function searchNotes(db: Database, filters: SearchFilters): Promise<SearchHit[]> {
  const { terms, tags } = parseQuery(filters.q);
  const allTags = [...tags, ...(filters.tag ? [filters.tag] : [])].map((tag) =>
    tag.toLocaleLowerCase('und'),
  );
  if (terms.length === 0 && allTags.length === 0 && !filters.type && !filters.folder) return [];
  const limit = Math.min(Math.max(filters.limit ?? 20, 1), 50);
  // Cada termo vira `termo:*`; como só há letras e dígitos, não há como injetar operadores no tsquery.
  const tsquery = terms.map((term) => `${term}:*`).join(' & ');
  const raw = terms.join(' ');

  const textMatch = terms.length
    ? sql`(n.search @@ to_tsquery('sb_pt', ${tsquery})
          or n.title % ${raw}
          or unaccent(lower(n.title)) like '%' || unaccent(lower(${raw})) || '%')`
    : sql`true`;
  // Relevância: título idêntico > título que começa com o termo > parecido com o título > texto.
  const rank = terms.length
    ? sql`(case when unaccent(lower(n.title)) = unaccent(lower(${raw})) then 3 else 0 end)
        + (case when unaccent(lower(n.title)) like unaccent(lower(${raw})) || '%' then 1 else 0 end)
        + similarity(n.title, ${raw}) * 2
        + ts_rank_cd(n.search, to_tsquery('sb_pt', ${tsquery}), 1)`
    : sql`0`;
  const uniqueTags = [...new Set(allTags)];
  // Drizzle expande arrays em ($1, $2, …): por isso `in (...)` com parâmetros explícitos.
  const tagFilter = uniqueTags.length
    ? sql`and (select count(distinct lower(t)) from unnest(n.tags) t
              where lower(t) in (${sql.join(
                uniqueTags.map((tag) => sql`${tag}`),
                sql`, `,
              )})) = ${uniqueTags.length}`
    : sql``;
  const typeFilter = filters.type ? sql`and n.type = ${filters.type}` : sql``;
  const folderFilter = filters.folder
    ? sql`and n.path like ${`${filters.folder.replace(/[%_\\]/g, '\\$&')}/%`}`
    : sql``;

  const headline = terms.length
    ? sql`ts_headline('sb_pt', n.body, to_tsquery('sb_pt', ${tsquery}),
          ${`StartSel=${HIGHLIGHT_START}, StopSel=${HIGHLIGHT_END}, MaxFragments=2, MaxWords=18, MinWords=6, FragmentDelimiter=" … "`})`
    : sql`left(n.body, 200)`;

  // Ordena e limita primeiro; o trecho (ts_headline, caro) só é calculado para os resultados finais.
  const result = await db.execute<{
    path: string;
    title: string;
    type: string;
    tags: string[];
    snippet: string;
    rank: number;
  }>(sql`
    with top as (
      select n.path, ${rank} as rank
      from notes n
      where ${textMatch} ${tagFilter} ${typeFilter} ${folderFilter}
      order by rank desc, n.title asc
      limit ${limit}
    )
    select n.path, n.title, n.type, n.tags, ${headline} as snippet, top.rank::float8 as rank
    from top join notes n on n.path = top.path
    order by top.rank desc, n.title asc
  `);
  return result.rows.map((row) => ({ ...row, rank: Number(row.rank) }));
}

export interface Backlink {
  sourcePath: string;
  sourceTitle: string;
  line: number;
  context: string;
}

/** Notas que apontam para `path`, com a linha onde o link aparece. */
export async function backlinksTo(db: Database, path: string): Promise<Backlink[]> {
  const result = await db.execute<{
    source_path: string;
    title: string;
    line: number;
    context: string;
  }>(sql`
    select l.source_path, n.title, l.line, l.context
    from links l join notes n on n.path = l.source_path
    where l.target_path = ${path} and l.source_path <> ${path}
    order by n.title asc, l.line asc
    limit 200
  `);
  return result.rows.map((row) => ({
    sourcePath: row.source_path,
    sourceTitle: row.title,
    line: row.line,
    context: row.context,
  }));
}

/** Notas que apontam para `path` (para renomear/mover atualizar as referências). */
export async function referencingNotes(db: Database, path: string): Promise<string[]> {
  const result = await db.execute<{ source_path: string }>(sql`
    select distinct source_path from links where target_path = ${path} and source_path <> ${path}
  `);
  return result.rows.map((row) => row.source_path);
}

export interface TagCount {
  tag: string;
  count: number;
}

/** Tags do vault (sem diferenciar maiúsculas), da mais usada para a menos usada. */
export async function listTags(db: Database): Promise<TagCount[]> {
  const result = await db.execute<{ tag: string; count: number }>(sql`
    select min(t) as tag, count(distinct n.path)::int as count
    from notes n, unnest(n.tags) t
    group by lower(t)
    order by count desc, lower(min(t)) asc
  `);
  return result.rows.map((row) => ({ tag: row.tag, count: Number(row.count) }));
}

export interface BrokenLink {
  sourcePath: string;
  targetRaw: string;
  line: number;
}

/** Links quebrados em todo o vault (para o Início). */
export async function brokenLinks(db: Database, limit = 50): Promise<BrokenLink[]> {
  const result = await db.execute<{ source_path: string; target_raw: string; line: number }>(sql`
    select source_path, target_raw, line from links
    where target_path is null and target_raw <> ''
    order by source_path, line limit ${limit}
  `);
  return result.rows.map((row) => ({
    sourcePath: row.source_path,
    targetRaw: row.target_raw,
    line: row.line,
  }));
}

/** Notas sem nenhum link de entrada nem de saída. */
export async function orphanNotes(db: Database, limit = 50): Promise<string[]> {
  const result = await db.execute<{ path: string }>(sql`
    select n.path from notes n
    where not exists (select 1 from links l where l.source_path = n.path and l.target_path is not null)
      and not exists (select 1 from links l where l.target_path = n.path and l.source_path <> n.path)
    order by n.path limit ${limit}
  `);
  return result.rows.map((row) => row.path);
}
