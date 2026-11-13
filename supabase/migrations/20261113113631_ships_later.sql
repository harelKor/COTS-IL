ALTER TABLE "product_families" ADD COLUMN "ships_later" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "source_updated_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "stock_checked_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "variants" ADD COLUMN "ships_later" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "variants" ADD COLUMN "ships_later_eta" text;