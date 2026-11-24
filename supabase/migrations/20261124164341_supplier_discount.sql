ALTER TABLE "team_order_items" ADD COLUMN "list_price_ils" integer;--> statement-breakpoint
ALTER TABLE "team_order_items" ADD COLUMN "discount_label" text;--> statement-breakpoint
ALTER TABLE "variants" ADD COLUMN "discount" numeric(4, 3);--> statement-breakpoint
-- A fraction (0.25) off the supplier's price, written by each regroup (applyDiscounts).
ALTER TABLE "variants" ADD CONSTRAINT "variants_discount_range" CHECK ("discount" > 0 AND "discount" < 1);
