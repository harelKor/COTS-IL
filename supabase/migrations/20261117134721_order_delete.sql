ALTER TABLE "po_allocations" DROP CONSTRAINT "po_allocations_po_line_id_order_item_id_pk";--> statement-breakpoint
ALTER TABLE "po_allocations" ALTER COLUMN "order_item_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "stock_allocations" ALTER COLUMN "order_item_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "po_allocations" ADD COLUMN "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL;--> statement-breakpoint
ALTER TABLE "po_allocations" ADD CONSTRAINT "po_allocations_line_item_key" UNIQUE("po_line_id","order_item_id");