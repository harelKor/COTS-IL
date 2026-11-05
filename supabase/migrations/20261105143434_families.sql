CREATE TYPE "public"."family_grouping" AS ENUM('title', 'supplier', 'single');--> statement-breakpoint
CREATE TYPE "public"."grouping_issue_reason" AS ENUM('reference-page', 'duplicate-options', 'no-size');--> statement-breakpoint
CREATE TABLE "grouping_issues" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"product_id" uuid NOT NULL,
	"reason" "grouping_issue_reason" NOT NULL,
	"detail" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "grouping_issues_product_reason_key" UNIQUE("product_id","reason")
);
--> statement-breakpoint
CREATE TABLE "product_families" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"key" text NOT NULL,
	"slug" text NOT NULL,
	"title" text NOT NULL,
	"category_id" uuid,
	"grouping" "family_grouping" NOT NULL,
	"primary_product_id" uuid,
	"supplier_codes" text[] DEFAULT '{}' NOT NULL,
	"programs" "program"[] DEFAULT '{}' NOT NULL,
	"images" text[] DEFAULT '{}' NOT NULL,
	"description_html" text,
	"option_keys" text[] DEFAULT '{}' NOT NULL,
	"variant_count" integer DEFAULT 0 NOT NULL,
	"min_price_usd" numeric(10, 2),
	"max_price_usd" numeric(10, 2),
	"available" boolean,
	"status" "product_status" DEFAULT 'published' NOT NULL,
	"search_text" text NOT NULL,
	"last_seen_at" timestamp with time zone NOT NULL,
	"missing_since" timestamp with time zone,
	CONSTRAINT "product_families_key_unique" UNIQUE("key"),
	CONSTRAINT "product_families_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "spec_values" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"family_id" uuid NOT NULL,
	"variant_id" uuid,
	"key" text NOT NULL,
	"value" text NOT NULL,
	"num" numeric(12, 4),
	"unit" text
);
--> statement-breakpoint
ALTER TABLE "variants" ADD COLUMN "family_id" uuid;--> statement-breakpoint
ALTER TABLE "variants" ADD COLUMN "family_options" jsonb DEFAULT '{}'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "grouping_issues" ADD CONSTRAINT "grouping_issues_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_families" ADD CONSTRAINT "product_families_category_id_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."categories"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_families" ADD CONSTRAINT "product_families_primary_product_id_products_id_fk" FOREIGN KEY ("primary_product_id") REFERENCES "public"."products"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "spec_values" ADD CONSTRAINT "spec_values_family_id_product_families_id_fk" FOREIGN KEY ("family_id") REFERENCES "public"."product_families"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "spec_values" ADD CONSTRAINT "spec_values_variant_id_variants_id_fk" FOREIGN KEY ("variant_id") REFERENCES "public"."variants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "product_families_category_id_idx" ON "product_families" USING btree ("category_id");--> statement-breakpoint
CREATE INDEX "product_families_min_price_usd_idx" ON "product_families" USING btree ("min_price_usd");--> statement-breakpoint
CREATE INDEX "spec_values_family_id_idx" ON "spec_values" USING btree ("family_id");--> statement-breakpoint
CREATE INDEX "spec_values_key_value_idx" ON "spec_values" USING btree ("key","value");--> statement-breakpoint
ALTER TABLE "variants" ADD CONSTRAINT "variants_family_id_product_families_id_fk" FOREIGN KEY ("family_id") REFERENCES "public"."product_families"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "variants_family_id_idx" ON "variants" USING btree ("family_id");