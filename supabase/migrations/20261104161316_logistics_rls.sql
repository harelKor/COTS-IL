-- Shipments, costs and receiving are the mentor's records, so only admins can read
-- them. Teams can read their own deliveries and which of their units were allocated.
-- Writes go through server actions, so there are no write policies.

ALTER TABLE public.shipments ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE public.shipment_items ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE public.import_costs ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE public.receipts ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE public.receipt_lines ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE public.stock_allocations ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE public.deliveries ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE public.delivery_items ENABLE ROW LEVEL SECURITY;--> statement-breakpoint

CREATE POLICY "shipments_select" ON public.shipments FOR SELECT TO authenticated USING ((SELECT public.is_admin()));--> statement-breakpoint
CREATE POLICY "shipment_items_select" ON public.shipment_items FOR SELECT TO authenticated USING ((SELECT public.is_admin()));--> statement-breakpoint
CREATE POLICY "import_costs_select" ON public.import_costs FOR SELECT TO authenticated USING ((SELECT public.is_admin()));--> statement-breakpoint
CREATE POLICY "receipts_select" ON public.receipts FOR SELECT TO authenticated USING ((SELECT public.is_admin()));--> statement-breakpoint
CREATE POLICY "receipt_lines_select" ON public.receipt_lines FOR SELECT TO authenticated USING ((SELECT public.is_admin()));--> statement-breakpoint

-- The rest follow the order or the team, as with orders and quotes.
CREATE POLICY "stock_allocations_select" ON public.stock_allocations FOR SELECT TO authenticated USING (
  EXISTS (SELECT 1 FROM public.team_order_items i WHERE i.id = stock_allocations.order_item_id)
);--> statement-breakpoint

CREATE POLICY "deliveries_select" ON public.deliveries FOR SELECT TO authenticated USING (
  (SELECT public.is_team_member(team_id)) OR (SELECT public.is_admin())
);--> statement-breakpoint

CREATE POLICY "delivery_items_select" ON public.delivery_items FOR SELECT TO authenticated USING (
  EXISTS (SELECT 1 FROM public.deliveries d WHERE d.id = delivery_items.delivery_id)
);
