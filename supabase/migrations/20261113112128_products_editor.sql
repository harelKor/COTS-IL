CREATE TYPE "public"."product_source" AS ENUM('synced', 'custom');--> statement-breakpoint
ALTER TABLE "variant_overrides" ALTER COLUMN "price_usd" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "product_overrides" ADD COLUMN "title" text;--> statement-breakpoint
ALTER TABLE "product_overrides" ADD COLUMN "description_html" text;--> statement-breakpoint
ALTER TABLE "product_overrides" ADD COLUMN "available" boolean;--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "source" "product_source" DEFAULT 'synced' NOT NULL;--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "store_title" text;--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "store_description_html" text;--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "store_images" text[];--> statement-breakpoint
ALTER TABLE "variant_overrides" ADD COLUMN "fixed_ils" numeric(10, 2);--> statement-breakpoint
ALTER TABLE "variant_overrides" ADD COLUMN "sku" text;--> statement-breakpoint
ALTER TABLE "variant_overrides" ADD COLUMN "options" jsonb;--> statement-breakpoint
ALTER TABLE "variant_overrides" ADD COLUMN "hidden" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "variants" ADD COLUMN "fixed_ils" numeric(10, 2);--> statement-breakpoint
ALTER TABLE "variants" ADD COLUMN "store_sku" text;--> statement-breakpoint
ALTER TABLE "variants" ADD COLUMN "store_options" jsonb;--> statement-breakpoint
ALTER TABLE "variants" ADD COLUMN "store_available" boolean;--> statement-breakpoint
-- The store's values as they are today: no override changed products or variants in place before S16c.
UPDATE "products" SET "store_title" = "title", "store_description_html" = "description_html", "store_images" = "images";--> statement-breakpoint
UPDATE "variants" SET "store_sku" = "supplier_sku", "store_options" = "options", "store_available" = "available";--> statement-breakpoint
-- Photos uploaded in /admin/settings/products: public to read, only an admin writes.
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('product-images', 'product-images', true, 1048576, ARRAY['image/png', 'image/jpeg', 'image/webp'])
ON CONFLICT (id) DO NOTHING;--> statement-breakpoint
CREATE POLICY "product_images_admin_insert" ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id = 'product-images' AND (SELECT public.is_admin()));--> statement-breakpoint
CREATE POLICY "product_images_admin_update" ON storage.objects FOR UPDATE TO authenticated USING (bucket_id = 'product-images' AND (SELECT public.is_admin()));--> statement-breakpoint
CREATE POLICY "product_images_admin_delete" ON storage.objects FOR DELETE TO authenticated USING (bucket_id = 'product-images' AND (SELECT public.is_admin()));
