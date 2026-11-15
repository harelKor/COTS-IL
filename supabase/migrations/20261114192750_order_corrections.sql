ALTER TABLE "team_order_items" ADD COLUMN "unavailable_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "team_orders" ADD COLUMN "cancel_reason" text;