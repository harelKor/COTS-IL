-- Product families: access, search index, and a first family per product.
--
-- Families are public like products. Spec values follow their family. The
-- grouping review list is for admins. As elsewhere, writes go through the server
-- (the sync and `npm run regroup`), so there are no write policies.

CREATE INDEX "product_families_search_text_trgm_idx" ON "public"."product_families"
  USING gin ("search_text" extensions.gin_trgm_ops);--> statement-breakpoint

ALTER TABLE public.product_families ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE public.spec_values ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE public.grouping_issues ENABLE ROW LEVEL SECURITY;--> statement-breakpoint

CREATE POLICY "product_families_select" ON public.product_families FOR SELECT TO anon, authenticated USING (
  status = 'published' OR (SELECT public.is_admin())
);--> statement-breakpoint

CREATE POLICY "spec_values_select" ON public.spec_values FOR SELECT TO anon, authenticated USING (
  EXISTS (SELECT 1 FROM public.product_families f WHERE f.id = spec_values.family_id)
);--> statement-breakpoint

CREATE POLICY "grouping_issues_select" ON public.grouping_issues FOR SELECT TO authenticated USING (
  (SELECT public.is_admin())
);--> statement-breakpoint

-- Until the first `npm run regroup` (or sync), every product is a family of one,
-- so the catalog, which now lists families, is never empty after this deploys.
WITH ranked AS (
  SELECT p.*, s.code AS supplier_code,
    row_number() OVER (PARTITION BY p.handle ORDER BY p.missing_since NULLS FIRST, s.code, p.created_at) AS rn
  FROM public.products p
  JOIN public.suppliers s ON s.id = p.supplier_id
)
INSERT INTO public.product_families (
  key, slug, title, category_id, grouping, primary_product_id, supplier_codes, programs, images,
  description_html, variant_count, min_price_usd, max_price_usd, available, status, search_text,
  last_seen_at, missing_since
)
SELECT
  'p:' || r.id,
  CASE WHEN r.rn = 1 THEN r.handle ELSE r.handle || '-' || r.supplier_code || '-' || r.rn END,
  r.title, r.category_id,
  (CASE WHEN (SELECT count(*) FROM public.variants v WHERE v.product_id = r.id) > 1 THEN 'supplier' ELSE 'single' END)::family_grouping,
  r.id, ARRAY[r.supplier_code], r.programs, r.images, r.description_html,
  (SELECT count(*) FROM public.variants v WHERE v.product_id = r.id AND v.missing_since IS NULL)::int,
  r.min_price_usd, r.max_price_usd, r.available, r.status, r.search_text, r.last_seen_at, r.missing_since
FROM ranked r;--> statement-breakpoint

UPDATE public.variants v SET family_id = f.id
FROM public.product_families f
WHERE f.key = 'p:' || v.product_id;--> statement-breakpoint

UPDATE public.variants v SET family_options = coalesce(
  (SELECT jsonb_object_agg(lower(o->>'name'), o->>'value') FROM jsonb_array_elements(v.options) o),
  '{}'::jsonb
);
