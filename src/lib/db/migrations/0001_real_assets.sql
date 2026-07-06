CREATE TABLE "real_assets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"kind" text NOT NULL,
	"name" text NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"valuation_mode" text DEFAULT 'manual' NOT NULL,
	"purchase_price" numeric(19, 4),
	"purchase_date" timestamp,
	"iso_currency_code" text DEFAULT 'USD' NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "real_asset_values" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"asset_id" uuid NOT NULL,
	"user_id" text NOT NULL,
	"value" numeric(19, 4) NOT NULL,
	"iso_currency_code" text DEFAULT 'USD' NOT NULL,
	"source" text NOT NULL,
	"source_kind" text NOT NULL,
	"as_of" timestamp NOT NULL,
	"confidence" numeric(5, 4),
	"range_low" numeric(19, 4),
	"range_high" numeric(19, 4),
	"notes" text,
	"raw" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "real_assets" ADD CONSTRAINT "real_assets_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "real_asset_values" ADD CONSTRAINT "real_asset_values_asset_id_real_assets_id_fk" FOREIGN KEY ("asset_id") REFERENCES "public"."real_assets"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "real_asset_values" ADD CONSTRAINT "real_asset_values_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX "real_assets_user_status_idx" ON "real_assets" USING btree ("user_id","status");
--> statement-breakpoint
CREATE INDEX "real_asset_values_asset_asof_idx" ON "real_asset_values" USING btree ("asset_id","as_of");
