-- Supplier orders hold purchase costs and mix several teams' lines, so only admins
-- can read them. Writes go through server actions, so there are no write policies.

ALTER TABLE public.supplier_pos ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE public.po_lines ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE public.po_allocations ENABLE ROW LEVEL SECURITY;--> statement-breakpoint

CREATE POLICY "supplier_pos_select" ON public.supplier_pos FOR SELECT TO authenticated USING (
  (SELECT public.is_admin())
);--> statement-breakpoint

CREATE POLICY "po_lines_select" ON public.po_lines FOR SELECT TO authenticated USING (
  (SELECT public.is_admin())
);--> statement-breakpoint

CREATE POLICY "po_allocations_select" ON public.po_allocations FOR SELECT TO authenticated USING (
  (SELECT public.is_admin())
);
