CREATE TYPE "public"."product_status" AS ENUM('published', 'review', 'hidden');--> statement-breakpoint
CREATE TYPE "public"."sync_status" AS ENUM('running', 'succeeded', 'failed');--> statement-breakpoint
CREATE TABLE "categories" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "categories_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "price_history" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"variant_id" uuid NOT NULL,
	"price_usd" numeric(10, 2),
	"compare_at_usd" numeric(10, 2),
	"available" boolean,
	"observed_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "products" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"supplier_id" uuid NOT NULL,
	"supplier_product_id" text NOT NULL,
	"handle" text NOT NULL,
	"title" text NOT NULL,
	"description_html" text,
	"url" text NOT NULL,
	"images" text[] DEFAULT '{}' NOT NULL,
	"product_type" text,
	"tags" text[] DEFAULT '{}' NOT NULL,
	"programs" "program"[] NOT NULL,
	"category_id" uuid,
	"status" "product_status" DEFAULT 'published' NOT NULL,
	"min_price_usd" numeric(10, 2),
	"max_price_usd" numeric(10, 2),
	"available" boolean,
	"search_text" text NOT NULL,
	"last_seen_at" timestamp with time zone NOT NULL,
	"missing_since" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "products_supplier_product_key" UNIQUE("supplier_id","supplier_product_id")
);
--> statement-breakpoint
CREATE TABLE "sync_jobs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"supplier_id" uuid NOT NULL,
	"status" "sync_status" DEFAULT 'running' NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone,
	"counts" jsonb,
	"error" text
);
--> statement-breakpoint
CREATE TABLE "variants" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"supplier_id" uuid NOT NULL,
	"product_id" uuid NOT NULL,
	"supplier_variant_id" text NOT NULL,
	"supplier_sku" text,
	"options" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	"grams" integer,
	"price_usd" numeric(10, 2),
	"compare_at_usd" numeric(10, 2),
	"available" boolean,
	"checked_at" timestamp with time zone NOT NULL,
	"missing_since" timestamp with time zone,
	CONSTRAINT "variants_supplier_variant_key" UNIQUE("supplier_id","supplier_variant_id")
);
--> statement-breakpoint
ALTER TABLE "price_history" ADD CONSTRAINT "price_history_variant_id_variants_id_fk" FOREIGN KEY ("variant_id") REFERENCES "public"."variants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "products" ADD CONSTRAINT "products_supplier_id_suppliers_id_fk" FOREIGN KEY ("supplier_id") REFERENCES "public"."suppliers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "products" ADD CONSTRAINT "products_category_id_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."categories"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sync_jobs" ADD CONSTRAINT "sync_jobs_supplier_id_suppliers_id_fk" FOREIGN KEY ("supplier_id") REFERENCES "public"."suppliers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "variants" ADD CONSTRAINT "variants_supplier_id_suppliers_id_fk" FOREIGN KEY ("supplier_id") REFERENCES "public"."suppliers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "variants" ADD CONSTRAINT "variants_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "price_history_variant_id_idx" ON "price_history" USING btree ("variant_id","observed_at");--> statement-breakpoint
CREATE INDEX "products_supplier_handle_idx" ON "products" USING btree ("supplier_id","handle");--> statement-breakpoint
CREATE INDEX "products_category_id_idx" ON "products" USING btree ("category_id");--> statement-breakpoint
CREATE INDEX "products_min_price_usd_idx" ON "products" USING btree ("min_price_usd");--> statement-breakpoint
CREATE INDEX "variants_product_id_idx" ON "variants" USING btree ("product_id");