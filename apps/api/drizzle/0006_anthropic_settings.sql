CREATE TABLE "anthropic_settings" (
	"id" integer PRIMARY KEY DEFAULT 1 NOT NULL,
	"user_id" text NOT NULL,
	"api_key" text NOT NULL,
	"model" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "anthropic_settings_singleton" CHECK ("anthropic_settings"."id" = 1)
);
