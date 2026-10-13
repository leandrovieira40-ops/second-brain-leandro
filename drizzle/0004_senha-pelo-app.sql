CREATE TABLE "auth_credentials" (
	"id" integer PRIMARY KEY NOT NULL,
	"password_hash" text NOT NULL,
	"changed_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
-- Mesma defesa da 0003: nada acessível pela API REST pública de provedores como o Supabase.
ALTER TABLE "auth_credentials" ENABLE ROW LEVEL SECURITY;
