CREATE TABLE "loans" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"connection_id" uuid NOT NULL,
	"provider" text NOT NULL,
	"external_id" text NOT NULL,
	"product_name" text NOT NULL,
	"type" text,
	"contract_number" text,
	"contracted_amount" bigint,
	"outstanding_balance" bigint,
	"currency" text NOT NULL,
	"contract_date" date,
	"final_due_date" date,
	"first_installment_due_date" date,
	"periodicity" text,
	"periodicity_label" text,
	"installments_total" integer,
	"installments_paid" integer,
	"installments_remaining" integer,
	"installments_overdue" integer,
	"installment_amount" bigint,
	"scheduled_installments" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"interest_rate_annual" double precision,
	"cet_annual" double precision,
	"raw" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "loans" ADD CONSTRAINT "loans_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "loans" ADD CONSTRAINT "loans_connection_id_user_id_fkey" FOREIGN KEY ("connection_id","user_id") REFERENCES "public"."connections"("id","user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "loans_user_id_provider_external_id_key" ON "loans" USING btree ("user_id","provider","external_id");--> statement-breakpoint
CREATE INDEX "loans_connection_id_idx" ON "loans" USING btree ("connection_id");