CREATE TABLE "family_member_snapshots" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"member_id" uuid NOT NULL,
	"user_id" text NOT NULL,
	"snapshot_date" timestamp NOT NULL,
	"value" numeric(19, 4) NOT NULL,
	"by_group" jsonb NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "family_members" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"name" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "financial_accounts" ADD COLUMN "held_for_id" uuid;--> statement-breakpoint
ALTER TABLE "family_member_snapshots" ADD CONSTRAINT "family_member_snapshots_member_id_family_members_id_fk" FOREIGN KEY ("member_id") REFERENCES "public"."family_members"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "family_member_snapshots" ADD CONSTRAINT "family_member_snapshots_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "family_members" ADD CONSTRAINT "family_members_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "fm_snap_member_day_idx" ON "family_member_snapshots" USING btree ("member_id","snapshot_date");--> statement-breakpoint
CREATE INDEX "fm_snap_user_idx" ON "family_member_snapshots" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "family_members_user_idx" ON "family_members" USING btree ("user_id");--> statement-breakpoint
ALTER TABLE "financial_accounts" ADD CONSTRAINT "financial_accounts_held_for_id_family_members_id_fk" FOREIGN KEY ("held_for_id") REFERENCES "public"."family_members"("id") ON DELETE set null ON UPDATE no action;