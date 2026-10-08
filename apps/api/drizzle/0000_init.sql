CREATE TYPE "public"."account_type" AS ENUM('CHECKING', 'SAVINGS', 'CREDIT_CARD', 'OTHER');--> statement-breakpoint
CREATE TYPE "public"."connection_status" AS ENUM('ACTIVE', 'UPDATING', 'ACTION_REQUIRED', 'ERROR');--> statement-breakpoint
CREATE TYPE "public"."payment_method" AS ENUM('PIX', 'TED', 'DOC', 'BOLETO', 'CARD', 'OTHER');--> statement-breakpoint
CREATE TYPE "public"."sync_run_status" AS ENUM('RUNNING', 'SUCCEEDED', 'PARTIAL', 'FAILED');--> statement-breakpoint
CREATE TYPE "public"."sync_trigger" AS ENUM('SCHEDULED', 'STARTUP', 'MANUAL');--> statement-breakpoint
CREATE TYPE "public"."transaction_status" AS ENUM('POSTED', 'PENDING');--> statement-breakpoint
CREATE TABLE "accounts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"connection_id" uuid NOT NULL,
	"provider" text NOT NULL,
	"external_id" text NOT NULL,
	"type" "account_type" NOT NULL,
	"name" text NOT NULL,
	"number" text,
	"currency" text NOT NULL,
	"balance" bigint NOT NULL,
	"credit_limit" bigint,
	"available_credit" bigint,
	"transactions_synced_through" date,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "connections" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"provider" text NOT NULL,
	"external_id" text NOT NULL,
	"institution_name" text NOT NULL,
	"institution_logo_url" text,
	"status" "connection_status" NOT NULL,
	"last_refreshed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "invoices" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"account_id" uuid NOT NULL,
	"provider" text NOT NULL,
	"external_id" text NOT NULL,
	"due_date" date NOT NULL,
	"closing_date" date,
	"total" bigint NOT NULL,
	"minimum_payment" bigint,
	"currency" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sync_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"provider" text NOT NULL,
	"trigger" "sync_trigger" NOT NULL,
	"status" "sync_run_status" NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone,
	"stats" jsonb,
	"errors" jsonb DEFAULT '[]'::jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "transactions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"account_id" uuid NOT NULL,
	"provider" text NOT NULL,
	"external_id" text NOT NULL,
	"date" date NOT NULL,
	"description" text NOT NULL,
	"amount" bigint NOT NULL,
	"status" "transaction_status" NOT NULL,
	"category" text,
	"payment_method" "payment_method",
	"counterparty_name" text,
	"installment_number" integer,
	"installment_total" integer,
	"invoice_external_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "accounts" ADD CONSTRAINT "accounts_connection_id_connections_id_fk" FOREIGN KEY ("connection_id") REFERENCES "public"."connections"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "accounts_provider_external_id_key" ON "accounts" USING btree ("provider","external_id");--> statement-breakpoint
CREATE INDEX "accounts_connection_id_idx" ON "accounts" USING btree ("connection_id");--> statement-breakpoint
CREATE UNIQUE INDEX "connections_provider_external_id_key" ON "connections" USING btree ("provider","external_id");--> statement-breakpoint
CREATE UNIQUE INDEX "invoices_provider_external_id_key" ON "invoices" USING btree ("provider","external_id");--> statement-breakpoint
CREATE INDEX "invoices_account_id_due_date_idx" ON "invoices" USING btree ("account_id","due_date");--> statement-breakpoint
CREATE INDEX "sync_runs_started_at_idx" ON "sync_runs" USING btree ("started_at");--> statement-breakpoint
CREATE UNIQUE INDEX "transactions_provider_external_id_key" ON "transactions" USING btree ("provider","external_id");--> statement-breakpoint
CREATE INDEX "transactions_account_id_date_idx" ON "transactions" USING btree ("account_id","date");--> statement-breakpoint
CREATE INDEX "transactions_date_idx" ON "transactions" USING btree ("date");