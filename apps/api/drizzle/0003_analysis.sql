CREATE TYPE "public"."analysis_source" AS ENUM('MCP', 'APP');--> statement-breakpoint
CREATE TABLE "analysis_reports" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"generated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"source" "analysis_source" NOT NULL,
	"model" text,
	"period_from" date NOT NULL,
	"period_to" date NOT NULL,
	"report" jsonb NOT NULL
);
--> statement-breakpoint
CREATE INDEX "analysis_reports_generated_at_idx" ON "analysis_reports" USING btree ("generated_at");