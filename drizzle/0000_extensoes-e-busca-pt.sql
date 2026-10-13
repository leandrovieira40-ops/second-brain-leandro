-- Extensões usadas pela busca. Ambas existem no Neon, no Supabase e no PostgreSQL padrão (contrib).
CREATE EXTENSION IF NOT EXISTS unaccent;
--> statement-breakpoint
CREATE EXTENSION IF NOT EXISTS pg_trgm;
--> statement-breakpoint
-- Configuração de busca em português que ignora acentos ("acao" encontra "Ação").
-- to_tsvector('sb_pt', ...) é IMMUTABLE e pode ser usada em coluna gerada.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_ts_config WHERE cfgname = 'sb_pt') THEN
    CREATE TEXT SEARCH CONFIGURATION sb_pt (COPY = portuguese);
    ALTER TEXT SEARCH CONFIGURATION sb_pt
      ALTER MAPPING FOR hword, hword_part, word WITH unaccent, portuguese_stem;
  END IF;
END
$$;
