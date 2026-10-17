CREATE TYPE "public"."budget_category_kind" AS ENUM('ESSENTIAL', 'DISCRETIONARY');--> statement-breakpoint
CREATE TABLE "budget_categories" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"kind" "budget_category_kind" NOT NULL,
	"source_categories" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"monthly_budget" bigint,
	"position" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "commitments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"amount" bigint NOT NULL,
	"day_of_month" integer NOT NULL,
	"payment_method" "payment_method" NOT NULL,
	"category_id" uuid,
	"starts_on" date NOT NULL,
	"ends_on" date,
	"installments_total" integer,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "goals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"target" bigint NOT NULL,
	"saved" bigint DEFAULT 0 NOT NULL,
	"target_date" date NOT NULL,
	"monthly_contribution" bigint NOT NULL,
	"account_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "transactions" ADD COLUMN "user_category" text;--> statement-breakpoint
ALTER TABLE "commitments" ADD CONSTRAINT "commitments_category_id_budget_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."budget_categories"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "goals" ADD CONSTRAINT "goals_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "commitments_category_id_idx" ON "commitments" USING btree ("category_id");