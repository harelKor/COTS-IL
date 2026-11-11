CREATE TABLE "product_overrides" (
	"product_id" uuid PRIMARY KEY NOT NULL,
	"hidden" boolean DEFAULT false NOT NULL,
	"images" text[],
	"category_id" uuid,
	"alone" boolean DEFAULT false NOT NULL,
	"merge_key" text,
	"pin_rank" integer,
	"note" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" uuid
);
--> statement-breakpoint
CREATE TABLE "variant_overrides" (
	"variant_id" uuid PRIMARY KEY NOT NULL,
	"price_usd" numeric(10, 2) NOT NULL,
	"note" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" uuid
);
--> statement-breakpoint
ALTER TABLE "product_families" ADD COLUMN "pinned_rank" integer;--> statement-breakpoint
ALTER TABLE "variants" ADD COLUMN "supplier_price_usd" numeric(10, 2);--> statement-breakpoint
ALTER TABLE "product_overrides" ADD CONSTRAINT "product_overrides_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_overrides" ADD CONSTRAINT "product_overrides_category_id_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."categories"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_overrides" ADD CONSTRAINT "product_overrides_updated_by_profiles_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."profiles"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "variant_overrides" ADD CONSTRAINT "variant_overrides_variant_id_variants_id_fk" FOREIGN KEY ("variant_id") REFERENCES "public"."variants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "variant_overrides" ADD CONSTRAINT "variant_overrides_updated_by_profiles_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."profiles"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
-- The store's price is what price_usd held until now (no overrides existed).
UPDATE "variants" SET "supplier_price_usd" = "price_usd";--> statement-breakpoint
-- Written and read only by the server (admin catalog actions, the sync); no client policies.
ALTER TABLE "product_overrides" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "variant_overrides" ENABLE ROW LEVEL SECURITY;
