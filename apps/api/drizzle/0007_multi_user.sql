-- Multiusuário: todo dado passa a ter dono (users). Escrita à mão (o SQL do
-- drizzle-kit não preenche o user_id dos dados que já existem). O estado final
-- é o mesmo do snapshot 0007.
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"keycloak_id" text,
	"username" text,
	"name" text,
	"email" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_keycloak_id_unique" UNIQUE("keycloak_id")
);
--> statement-breakpoint
CREATE TABLE "mcp_tokens" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"token_hash" text NOT NULL,
	"hint" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_used_at" timestamp with time zone,
	CONSTRAINT "mcp_tokens_token_hash_unique" UNIQUE("token_hash")
);
--> statement-breakpoint
-- Dono dos dados de antes: quem salvou as configurações (sub do Keycloak) ou,
-- sem configuração salva, ninguém ainda (o primeiro login assume, ver
-- UsersService). Só é criado se já houver algum dado.
INSERT INTO "users" ("keycloak_id")
SELECT coalesce(
	(SELECT "user_id" FROM "pluggy_settings" LIMIT 1),
	(SELECT "user_id" FROM "anthropic_settings" LIMIT 1)
)
WHERE EXISTS (SELECT 1 FROM "connections")
	OR EXISTS (SELECT 1 FROM "sync_runs")
	OR EXISTS (SELECT 1 FROM "budget_categories")
	OR EXISTS (SELECT 1 FROM "commitments")
	OR EXISTS (SELECT 1 FROM "goals")
	OR EXISTS (SELECT 1 FROM "analysis_reports")
	OR EXISTS (SELECT 1 FROM "analysis_runs")
	OR EXISTS (SELECT 1 FROM "pluggy_settings")
	OR EXISTS (SELECT 1 FROM "anthropic_settings");
--> statement-breakpoint
-- Configurações: de linha única (id = 1, user_id = sub) para uma por usuário.
ALTER TABLE "pluggy_settings" DROP CONSTRAINT "pluggy_settings_singleton";--> statement-breakpoint
ALTER TABLE "pluggy_settings" RENAME COLUMN "user_id" TO "saved_by";--> statement-breakpoint
ALTER TABLE "pluggy_settings" ADD COLUMN "user_id" uuid;--> statement-breakpoint
UPDATE "pluggy_settings" SET "user_id" = (SELECT "id" FROM "users" LIMIT 1);--> statement-breakpoint
ALTER TABLE "pluggy_settings" DROP COLUMN "saved_by";--> statement-breakpoint
ALTER TABLE "pluggy_settings" DROP COLUMN "id";--> statement-breakpoint
ALTER TABLE "pluggy_settings" ALTER COLUMN "user_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "pluggy_settings" ADD PRIMARY KEY ("user_id");--> statement-breakpoint
ALTER TABLE "anthropic_settings" DROP CONSTRAINT "anthropic_settings_singleton";--> statement-breakpoint
ALTER TABLE "anthropic_settings" RENAME COLUMN "user_id" TO "saved_by";--> statement-breakpoint
ALTER TABLE "anthropic_settings" ADD COLUMN "user_id" uuid;--> statement-breakpoint
UPDATE "anthropic_settings" SET "user_id" = (SELECT "id" FROM "users" LIMIT 1);--> statement-breakpoint
ALTER TABLE "anthropic_settings" DROP COLUMN "saved_by";--> statement-breakpoint
ALTER TABLE "anthropic_settings" DROP COLUMN "id";--> statement-breakpoint
ALTER TABLE "anthropic_settings" ALTER COLUMN "user_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "anthropic_settings" ADD PRIMARY KEY ("user_id");--> statement-breakpoint
-- user_id nos dados: adiciona, preenche com o dono de antes e só então exige.
ALTER TABLE "connections" ADD COLUMN "user_id" uuid;--> statement-breakpoint
ALTER TABLE "accounts" ADD COLUMN "user_id" uuid;--> statement-breakpoint
ALTER TABLE "transactions" ADD COLUMN "user_id" uuid;--> statement-breakpoint
ALTER TABLE "invoices" ADD COLUMN "user_id" uuid;--> statement-breakpoint
ALTER TABLE "sync_runs" ADD COLUMN "user_id" uuid;--> statement-breakpoint
ALTER TABLE "budget_categories" ADD COLUMN "user_id" uuid;--> statement-breakpoint
ALTER TABLE "commitments" ADD COLUMN "user_id" uuid;--> statement-breakpoint
ALTER TABLE "goals" ADD COLUMN "user_id" uuid;--> statement-breakpoint
ALTER TABLE "analysis_reports" ADD COLUMN "user_id" uuid;--> statement-breakpoint
ALTER TABLE "analysis_runs" ADD COLUMN "user_id" uuid;--> statement-breakpoint
UPDATE "connections" SET "user_id" = (SELECT "id" FROM "users" LIMIT 1);--> statement-breakpoint
UPDATE "accounts" SET "user_id" = (SELECT "id" FROM "users" LIMIT 1);--> statement-breakpoint
UPDATE "transactions" SET "user_id" = (SELECT "id" FROM "users" LIMIT 1);--> statement-breakpoint
UPDATE "invoices" SET "user_id" = (SELECT "id" FROM "users" LIMIT 1);--> statement-breakpoint
UPDATE "sync_runs" SET "user_id" = (SELECT "id" FROM "users" LIMIT 1);--> statement-breakpoint
UPDATE "budget_categories" SET "user_id" = (SELECT "id" FROM "users" LIMIT 1);--> statement-breakpoint
UPDATE "commitments" SET "user_id" = (SELECT "id" FROM "users" LIMIT 1);--> statement-breakpoint
UPDATE "goals" SET "user_id" = (SELECT "id" FROM "users" LIMIT 1);--> statement-breakpoint
UPDATE "analysis_reports" SET "user_id" = (SELECT "id" FROM "users" LIMIT 1);--> statement-breakpoint
UPDATE "analysis_runs" SET "user_id" = (SELECT "id" FROM "users" LIMIT 1);--> statement-breakpoint
ALTER TABLE "connections" ALTER COLUMN "user_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "accounts" ALTER COLUMN "user_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "transactions" ALTER COLUMN "user_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "invoices" ALTER COLUMN "user_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "sync_runs" ALTER COLUMN "user_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "budget_categories" ALTER COLUMN "user_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "commitments" ALTER COLUMN "user_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "goals" ALTER COLUMN "user_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "analysis_reports" ALTER COLUMN "user_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "analysis_runs" ALTER COLUMN "user_id" SET NOT NULL;--> statement-breakpoint
-- Chaves e índices: o que era único no app passa a ser único por usuário.
ALTER TABLE "accounts" DROP CONSTRAINT "accounts_connection_id_connections_id_fk";--> statement-breakpoint
ALTER TABLE "invoices" DROP CONSTRAINT "invoices_account_id_accounts_id_fk";--> statement-breakpoint
ALTER TABLE "transactions" DROP CONSTRAINT "transactions_account_id_accounts_id_fk";--> statement-breakpoint
DROP INDEX "accounts_provider_external_id_key";--> statement-breakpoint
DROP INDEX "analysis_reports_generated_at_idx";--> statement-breakpoint
DROP INDEX "analysis_runs_started_at_idx";--> statement-breakpoint
DROP INDEX "connections_provider_external_id_key";--> statement-breakpoint
DROP INDEX "invoices_provider_external_id_key";--> statement-breakpoint
DROP INDEX "sync_runs_started_at_idx";--> statement-breakpoint
DROP INDEX "transactions_provider_external_id_key";--> statement-breakpoint
DROP INDEX "transactions_date_idx";--> statement-breakpoint
DROP INDEX "analysis_runs_single_running_key";--> statement-breakpoint
ALTER TABLE "connections" ADD CONSTRAINT "connections_id_user_id_key" UNIQUE("id","user_id");--> statement-breakpoint
ALTER TABLE "accounts" ADD CONSTRAINT "accounts_id_user_id_key" UNIQUE("id","user_id");--> statement-breakpoint
ALTER TABLE "mcp_tokens" ADD CONSTRAINT "mcp_tokens_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pluggy_settings" ADD CONSTRAINT "pluggy_settings_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "anthropic_settings" ADD CONSTRAINT "anthropic_settings_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "connections" ADD CONSTRAINT "connections_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "accounts" ADD CONSTRAINT "accounts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "accounts" ADD CONSTRAINT "accounts_connection_id_user_id_fkey" FOREIGN KEY ("connection_id","user_id") REFERENCES "public"."connections"("id","user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_account_id_user_id_fkey" FOREIGN KEY ("account_id","user_id") REFERENCES "public"."accounts"("id","user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_account_id_user_id_fkey" FOREIGN KEY ("account_id","user_id") REFERENCES "public"."accounts"("id","user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sync_runs" ADD CONSTRAINT "sync_runs_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "budget_categories" ADD CONSTRAINT "budget_categories_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "commitments" ADD CONSTRAINT "commitments_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "goals" ADD CONSTRAINT "goals_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "analysis_reports" ADD CONSTRAINT "analysis_reports_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "analysis_runs" ADD CONSTRAINT "analysis_runs_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "connections_user_id_provider_external_id_key" ON "connections" USING btree ("user_id","provider","external_id");--> statement-breakpoint
CREATE UNIQUE INDEX "accounts_user_id_provider_external_id_key" ON "accounts" USING btree ("user_id","provider","external_id");--> statement-breakpoint
CREATE UNIQUE INDEX "transactions_user_id_provider_external_id_key" ON "transactions" USING btree ("user_id","provider","external_id");--> statement-breakpoint
CREATE INDEX "transactions_user_id_date_idx" ON "transactions" USING btree ("user_id","date");--> statement-breakpoint
CREATE UNIQUE INDEX "invoices_user_id_provider_external_id_key" ON "invoices" USING btree ("user_id","provider","external_id");--> statement-breakpoint
CREATE INDEX "sync_runs_user_id_started_at_idx" ON "sync_runs" USING btree ("user_id","started_at");--> statement-breakpoint
CREATE INDEX "commitments_user_id_idx" ON "commitments" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "analysis_reports_user_id_generated_at_idx" ON "analysis_reports" USING btree ("user_id","generated_at");--> statement-breakpoint
CREATE INDEX "analysis_runs_user_id_started_at_idx" ON "analysis_runs" USING btree ("user_id","started_at");--> statement-breakpoint
CREATE UNIQUE INDEX "analysis_runs_single_running_key" ON "analysis_runs" USING btree ("user_id") WHERE "analysis_runs"."status" = 'RUNNING';
