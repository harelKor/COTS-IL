-- Catalog access, search index and reference data.
--
-- The catalog is public: anyone can browse published products. As with the rest
-- of the app, writes go through the server (the sync job and server actions), so
-- there are no insert/update/delete policies.

CREATE EXTENSION IF NOT EXISTS pg_trgm WITH SCHEMA extensions;--> statement-breakpoint

CREATE INDEX "products_search_text_trgm_idx" ON "public"."products"
  USING gin ("search_text" extensions.gin_trgm_ops);--> statement-breakpoint

ALTER TABLE public.categories ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE public.variants ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE public.price_history ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE public.sync_jobs ENABLE ROW LEVEL SECURITY;--> statement-breakpoint

DROP POLICY "suppliers_select" ON public.suppliers;--> statement-breakpoint
CREATE POLICY "suppliers_select" ON public.suppliers FOR SELECT TO anon, authenticated USING (true);--> statement-breakpoint

CREATE POLICY "categories_select" ON public.categories FOR SELECT TO anon, authenticated USING (true);--> statement-breakpoint

CREATE POLICY "products_select" ON public.products FOR SELECT TO anon, authenticated USING (
  status = 'published' OR (SELECT public.is_admin())
);--> statement-breakpoint

CREATE POLICY "variants_select" ON public.variants FOR SELECT TO anon, authenticated USING (
  EXISTS (SELECT 1 FROM public.products p WHERE p.id = variants.product_id)
);--> statement-breakpoint

CREATE POLICY "price_history_select" ON public.price_history FOR SELECT TO authenticated USING (
  (SELECT public.is_admin())
);--> statement-breakpoint

CREATE POLICY "sync_jobs_select" ON public.sync_jobs FOR SELECT TO authenticated USING (
  (SELECT public.is_admin())
);--> statement-breakpoint

INSERT INTO public.suppliers (code, name, base_url, platform, programs) VALUES
  ('andymark', 'AndyMark', 'https://andymark.com', 'shopify', '{FRC,FTC}'),
  ('rev', 'REV Robotics', 'https://www.revrobotics.com', 'bigcommerce', '{FRC,FTC}'),
  ('wcp', 'WCP', 'https://wcproducts.com', 'shopify', '{FRC}'),
  ('ctre', 'CTR Electronics', 'https://store.ctr-electronics.com', 'shopify', '{FRC}'),
  ('gobilda', 'goBILDA', 'https://www.gobilda.com', 'bigcommerce', '{FTC}'),
  ('ttb', 'The Thrifty Bot', 'https://thethriftybot.com', 'shopify', '{FRC}')
ON CONFLICT (code) DO NOTHING;--> statement-breakpoint

INSERT INTO public.categories (slug, name, sort_order) VALUES
  ('motors', 'מנועים ובקרים', 10),
  ('electronics', 'אלקטרוניקה וחיווט', 20),
  ('sensors', 'חיישנים ובקרה', 30),
  ('drivetrain', 'הנעה ושלדה', 40),
  ('mechanisms', 'מנגנונים', 45),
  ('gearboxes', 'תיבות הילוכים', 50),
  ('gears', 'גלגלי שיניים', 60),
  ('belts-chain', 'רצועות, גלגלות ושרשראות', 70),
  ('wheels', 'גלגלים ורולרים', 80),
  ('bearings', 'מיסבים', 90),
  ('shafts', 'צירים, רכזות וטבעות', 100),
  ('structure', 'פרופילים ומבנה', 110),
  ('fasteners', 'ברגים וחומרי חיבור', 120),
  ('pneumatics', 'פניאומטיקה', 130),
  ('tools', 'כלים', 140),
  ('other', 'שונות', 150);
