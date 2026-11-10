CREATE TABLE "exchange_rates" (
	"currency" text NOT NULL,
	"rate_date" date NOT NULL,
	"rate" numeric(10, 4) NOT NULL,
	"fetched_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "exchange_rates_currency_rate_date_pk" PRIMARY KEY("currency","rate_date")
);
--> statement-breakpoint
ALTER TABLE "sync_jobs" ADD COLUMN "usd_ils_rate" numeric(10, 4);--> statement-breakpoint
ALTER TABLE "team_order_items" ADD COLUMN "usd_ils_rate" numeric(10, 4);--> statement-breakpoint
ALTER TABLE "exchange_rates" ADD CONSTRAINT "exchange_rates_rate_positive" CHECK ("rate" > 0);--> statement-breakpoint
-- Read only by the server; no client policies.
ALTER TABLE "exchange_rates" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
-- Bank of Israel representative rate published Nov 9, 2026, so prices are right before the first sync fetches one.
INSERT INTO "exchange_rates" ("currency", "rate_date", "rate") VALUES ('USD', '2026-11-09', 3.171) ON CONFLICT DO NOTHING;
