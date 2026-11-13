ALTER TYPE "public"."supplier_platform" ADD VALUE 'manual';--> statement-breakpoint
ALTER TABLE "suppliers" ADD COLUMN "logo_url" text;--> statement-breakpoint
ALTER TABLE "suppliers" ADD COLUMN "free_shipping_usd" numeric(10, 2);--> statement-breakpoint
ALTER TABLE "suppliers" ADD COLUMN "notes" text;--> statement-breakpoint
ALTER TABLE "suppliers" ADD COLUMN "sync_enabled" boolean DEFAULT true NOT NULL;--> statement-breakpoint
-- The admin's notes stay out of the public API: the site reads suppliers through the server only.
REVOKE SELECT ON public.suppliers FROM anon, authenticated;--> statement-breakpoint
GRANT SELECT (id, code, name, base_url, platform, programs, active, logo_url, created_at) ON public.suppliers TO anon, authenticated;--> statement-breakpoint
-- Supplier logos uploaded in /admin/settings/suppliers: public to read, only an admin writes.
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('supplier-logos', 'supplier-logos', true, 1048576, ARRAY['image/png', 'image/jpeg', 'image/webp'])
ON CONFLICT (id) DO NOTHING;--> statement-breakpoint
CREATE POLICY "supplier_logos_admin_insert" ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id = 'supplier-logos' AND (SELECT public.is_admin()));--> statement-breakpoint
CREATE POLICY "supplier_logos_admin_update" ON storage.objects FOR UPDATE TO authenticated USING (bucket_id = 'supplier-logos' AND (SELECT public.is_admin()));--> statement-breakpoint
CREATE POLICY "supplier_logos_admin_delete" ON storage.objects FOR DELETE TO authenticated USING (bucket_id = 'supplier-logos' AND (SELECT public.is_admin()));
