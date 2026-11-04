-- Team isolation for carts, orders and quotes (spec §3, AT-02).
--
-- Members read their own team's rows and admins read everything. Writes go through
-- server actions that check permissions, so there are no write policies.

ALTER TABLE public.cart_items ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE public.team_orders ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE public.team_order_items ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE public.quotes ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE public.quote_lines ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE public.quote_approvals ENABLE ROW LEVEL SECURITY;--> statement-breakpoint

CREATE POLICY "cart_items_select" ON public.cart_items FOR SELECT TO authenticated USING (
  (SELECT public.is_team_member(team_id)) OR (SELECT public.is_admin())
);--> statement-breakpoint

CREATE POLICY "team_orders_select" ON public.team_orders FOR SELECT TO authenticated USING (
  (SELECT public.is_team_member(team_id)) OR (SELECT public.is_admin())
);--> statement-breakpoint

-- The rest follow the order: if RLS hides the order, the EXISTS finds nothing.
CREATE POLICY "team_order_items_select" ON public.team_order_items FOR SELECT TO authenticated USING (
  EXISTS (SELECT 1 FROM public.team_orders o WHERE o.id = team_order_items.order_id)
);--> statement-breakpoint

CREATE POLICY "quotes_select" ON public.quotes FOR SELECT TO authenticated USING (
  EXISTS (SELECT 1 FROM public.team_orders o WHERE o.id = quotes.order_id)
);--> statement-breakpoint

CREATE POLICY "quote_lines_select" ON public.quote_lines FOR SELECT TO authenticated USING (
  EXISTS (SELECT 1 FROM public.quotes q WHERE q.id = quote_lines.quote_id)
);--> statement-breakpoint

CREATE POLICY "quote_approvals_select" ON public.quote_approvals FOR SELECT TO authenticated USING (
  EXISTS (SELECT 1 FROM public.quotes q WHERE q.id = quote_approvals.quote_id)
);
