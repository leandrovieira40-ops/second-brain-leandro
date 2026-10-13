CREATE TABLE "links" (
	"id" serial PRIMARY KEY NOT NULL,
	"source_path" text NOT NULL,
	"target_raw" text NOT NULL,
	"target_path" text,
	"subpath" text,
	"embed" boolean DEFAULT false NOT NULL,
	"line" integer NOT NULL,
	"context" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "notes" (
	"path" text PRIMARY KEY NOT NULL,
	"blob_sha" text NOT NULL,
	"title" text NOT NULL,
	"type" text NOT NULL,
	"note_id" text,
	"tags" text[] DEFAULT '{}'::text[] NOT NULL,
	"aliases" text[] DEFAULT '{}'::text[] NOT NULL,
	"keywords" text DEFAULT '' NOT NULL,
	"frontmatter" jsonb,
	"body" text NOT NULL,
	"search" "tsvector" GENERATED ALWAYS AS (setweight(to_tsvector('sb_pt', coalesce(title, '')), 'A') || setweight(to_tsvector('sb_pt', coalesce(keywords, '')), 'B') || setweight(to_tsvector('sb_pt', coalesce(body, '')), 'C')) STORED,
	"indexed_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sync_state" (
	"id" integer PRIMARY KEY NOT NULL,
	"fingerprint" text,
	"note_count" integer DEFAULT 0 NOT NULL,
	"indexed_at" timestamp with time zone,
	"last_error" text
);
--> statement-breakpoint
ALTER TABLE "links" ADD CONSTRAINT "links_source_path_notes_path_fk" FOREIGN KEY ("source_path") REFERENCES "public"."notes"("path") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
CREATE INDEX "links_target_idx" ON "links" USING btree ("target_path");--> statement-breakpoint
CREATE INDEX "links_source_idx" ON "links" USING btree ("source_path");--> statement-breakpoint
CREATE INDEX "notes_search_idx" ON "notes" USING gin ("search");--> statement-breakpoint
CREATE INDEX "notes_title_trgm_idx" ON "notes" USING gin ("title" gin_trgm_ops);--> statement-breakpoint
CREATE INDEX "notes_tags_idx" ON "notes" USING gin ("tags");