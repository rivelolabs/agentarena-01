ALTER TABLE "agents" ADD COLUMN "memory" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "agents" ADD COLUMN "learn" boolean DEFAULT true NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "ledger_stake_tx_idx" ON "ledger" USING btree ("tx_sig") WHERE kind = 'stake' and tx_sig is not null;