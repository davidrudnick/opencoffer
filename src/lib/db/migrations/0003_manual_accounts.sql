ALTER TABLE "financial_accounts" ALTER COLUMN "connection_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "financial_accounts" ADD COLUMN "source" text DEFAULT 'simplefin' NOT NULL;
