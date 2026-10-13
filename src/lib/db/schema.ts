import { sql } from 'drizzle-orm';
import {
  boolean,
  customType,
  index,
  integer,
  jsonb,
  pgTable,
  serial,
  text,
  timestamp,
} from 'drizzle-orm/pg-core';

/**
 * Índice DERIVADO do vault (ADR-0013). Tudo aqui pode ser apagado e reconstruído a partir dos
 * arquivos Markdown; nada é a única cópia de um dado.
 */
const tsvector = customType<{ data: string }>({ dataType: () => 'tsvector' });

export const notes = pgTable(
  'notes',
  {
    path: text('path').primaryKey(),
    blobSha: text('blob_sha').notNull(),
    title: text('title').notNull(),
    type: text('type').notNull(),
    noteId: text('note_id'),
    tags: text('tags')
      .array()
      .notNull()
      .default(sql`'{}'::text[]`),
    aliases: text('aliases')
      .array()
      .notNull()
      .default(sql`'{}'::text[]`),
    /** Aliases + tags em texto (array_to_string não é IMMUTABLE e não pode entrar na coluna gerada). */
    keywords: text('keywords').notNull().default(''),
    frontmatter: jsonb('frontmatter'),
    body: text('body').notNull(),
    search: tsvector('search').generatedAlwaysAs(
      sql`setweight(to_tsvector('sb_pt', coalesce(title, '')), 'A') || setweight(to_tsvector('sb_pt', coalesce(keywords, '')), 'B') || setweight(to_tsvector('sb_pt', coalesce(body, '')), 'C')`,
    ),
    indexedAt: timestamp('indexed_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('notes_search_idx').using('gin', table.search),
    index('notes_title_trgm_idx').using('gin', sql`${table.title} gin_trgm_ops`),
    index('notes_tags_idx').using('gin', table.tags),
  ],
);

export const links = pgTable(
  'links',
  {
    id: serial('id').primaryKey(),
    sourcePath: text('source_path')
      .notNull()
      .references(() => notes.path, { onDelete: 'cascade', onUpdate: 'cascade' }),
    targetRaw: text('target_raw').notNull(),
    /** Nota/arquivo para onde o link resolve; `null` = link quebrado. */
    targetPath: text('target_path'),
    subpath: text('subpath'),
    embed: boolean('embed').notNull().default(false),
    line: integer('line').notNull(),
    /** Linha onde o link aparece (para mostrar o contexto do backlink). */
    context: text('context').notNull(),
  },
  (table) => [
    index('links_target_idx').on(table.targetPath),
    index('links_source_idx').on(table.sourcePath),
  ],
);

/** Arquivos que não são notas (anexos) — necessários para resolver `![[embeds]]`. */
export const attachments = pgTable('attachments', {
  path: text('path').primaryKey(),
  blobSha: text('blob_sha').notNull(),
});

/** Uma única linha (id = 1) com o estado da última indexação. */
export const syncState = pgTable('sync_state', {
  id: integer('id').primaryKey(),
  /** Hash de todos os pares caminho:SHA indexados — muda quando o vault muda. */
  fingerprint: text('fingerprint'),
  noteCount: integer('note_count').notNull().default(0),
  indexedAt: timestamp('indexed_at', { withTimezone: true }),
  lastError: text('last_error'),
});

/**
 * Senha trocada pela própria aplicação (uma linha, id = 1). Sem linha, vale `AUTH_PASSWORD_HASH`.
 * Guarda só o hash scrypt — nunca a senha.
 */
export const authCredentials = pgTable('auth_credentials', {
  id: integer('id').primaryKey(),
  passwordHash: text('password_hash').notNull(),
  changedAt: timestamp('changed_at', { withTimezone: true }).notNull().defaultNow(),
});
