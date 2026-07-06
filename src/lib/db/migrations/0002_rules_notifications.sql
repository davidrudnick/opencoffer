CREATE TABLE "category_rules" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"field" text NOT NULL,
	"match_type" text NOT NULL,
	"pattern" text NOT NULL,
	"category" text NOT NULL,
	"subcategory" text,
	"enabled" boolean DEFAULT true NOT NULL,
	"applied_count" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "notification_channels" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"kind" text NOT NULL,
	"label" text NOT NULL,
	"config_cipher" text NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"last_success_at" timestamp,
	"last_error" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "alerts" ADD COLUMN "notified_at" timestamp;--> statement-breakpoint
ALTER TABLE "category_rules" ADD CONSTRAINT "category_rules_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notification_channels" ADD CONSTRAINT "notification_channels_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "category_rules_user_idx" ON "category_rules" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "notification_channels_user_idx" ON "notification_channels" USING btree ("user_id");