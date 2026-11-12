ALTER TABLE "ledger" ADD COLUMN "currency" text DEFAULT 'sol' NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "play_credits" bigint DEFAULT 0 NOT NULL;