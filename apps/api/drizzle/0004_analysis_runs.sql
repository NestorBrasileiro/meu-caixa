CREATE TYPE "public"."analysis_run_status" AS ENUM('RUNNING', 'SUCCEEDED', 'FAILED');--> statement-breakpoint
CREATE TABLE "analysis_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"status" "analysis_run_status" NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone,
	"error" text,
	"report_id" uuid,
	"model" text,
	"usage" jsonb
);
--> statement-breakpoint
ALTER TABLE "analysis_runs" ADD CONSTRAINT "analysis_runs_report_id_analysis_reports_id_fk" FOREIGN KEY ("report_id") REFERENCES "public"."analysis_reports"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "analysis_runs_started_at_idx" ON "analysis_runs" USING btree ("started_at");--> statement-breakpoint
CREATE UNIQUE INDEX "analysis_runs_single_running_key" ON "analysis_runs" USING btree ("status") WHERE "analysis_runs"."status" = 'RUNNING';