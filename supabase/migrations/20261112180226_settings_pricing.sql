CREATE TYPE "public"."pricing_scope" AS ENUM('supplier', 'category');--> statement-breakpoint
CREATE TABLE "pricing_rules" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"scope" "pricing_scope" NOT NULL,
	"target_id" uuid NOT NULL,
	"multiplier" numeric(6, 3) NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" uuid,
	CONSTRAINT "pricing_rules_scope_target_key" UNIQUE("scope","target_id")
);
--> statement-breakpoint
CREATE TABLE "site_settings" (
	"id" integer PRIMARY KEY DEFAULT 1 NOT NULL,
	"data" jsonb NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" uuid
);
--> statement-breakpoint
ALTER TABLE "product_families" ADD COLUMN "min_list_usd" numeric(12, 2);--> statement-breakpoint
ALTER TABLE "product_families" ADD COLUMN "max_list_usd" numeric(12, 2);--> statement-breakpoint
ALTER TABLE "variants" ADD COLUMN "markup" numeric(6, 3);--> statement-breakpoint
ALTER TABLE "pricing_rules" ADD CONSTRAINT "pricing_rules_updated_by_profiles_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."profiles"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "site_settings" ADD CONSTRAINT "site_settings_updated_by_profiles_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."profiles"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "product_families_min_list_usd_idx" ON "product_families" USING btree ("min_list_usd");--> statement-breakpoint
ALTER TABLE "site_settings" ADD CONSTRAINT "site_settings_one_row" CHECK ("id" = 1);--> statement-breakpoint
ALTER TABLE "pricing_rules" ADD CONSTRAINT "pricing_rules_multiplier_range" CHECK ("multiplier" >= 1 AND "multiplier" <= 5);--> statement-breakpoint
-- Today's values (src/lib/business.ts was all null; MARKUP = 1.6), so nothing changes on the site until the admin edits them.
INSERT INTO "site_settings" ("id", "data") VALUES (1, '{"business":{"quoteLeadBusinessDays":null,"legalName":null,"companyNumber":null,"email":null,"phone":null,"whatsapp":null,"pickupAddress":null,"pickupHours":null,"handlingFee":null,"priceIncludes":null,"leadTimes":{"andymark":null,"wcp":null,"ctre":null,"ttb":null},"returnPolicy":null,"quoteValidDays":null,"paymentTerms":null},"pricing":{"markup":1.6,"rateOverride":null,"roundTo":1,"minIls":null}}'::jsonb) ON CONFLICT ("id") DO NOTHING;--> statement-breakpoint
UPDATE "variants" SET "markup" = 1.6;--> statement-breakpoint
UPDATE "product_families" SET "min_list_usd" = round("min_price_usd" * 1.6, 2), "max_list_usd" = round("max_price_usd" * 1.6, 2);--> statement-breakpoint
-- Written and read only by the server (admin settings actions, the regroup); no client policies.
ALTER TABLE "site_settings" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "pricing_rules" ENABLE ROW LEVEL SECURITY;
