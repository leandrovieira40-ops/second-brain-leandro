-- Defesa em profundidade: em provedores que expõem o schema "public" por uma API REST (ex.: Supabase),
-- RLS ligada e SEM políticas nega todo acesso por essa API. A aplicação conecta como dono das tabelas
-- e não é afetada. No PostgreSQL comum, não muda nada.
ALTER TABLE "notes" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "links" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "attachments" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "sync_state" ENABLE ROW LEVEL SECURITY;
