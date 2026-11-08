CREATE TYPE "public"."subscription_preference_kind" AS ENUM('SUBSCRIPTION', 'IGNORED');--> statement-breakpoint
CREATE TABLE "subscription_preferences" (
	"user_id" uuid NOT NULL,
	"key" text NOT NULL,
	"kind" "subscription_preference_kind",
	"name" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "subscription_preferences_user_id_key_pk" PRIMARY KEY("user_id","key")
);
--> statement-breakpoint
ALTER TABLE "subscription_preferences" ADD CONSTRAINT "subscription_preferences_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;