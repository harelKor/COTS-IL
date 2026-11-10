ALTER TABLE "supplier_pos" ADD COLUMN "shipping_usd" numeric(10, 2);--> statement-breakpoint
ALTER TABLE "supplier_pos" ADD COLUMN "tax_usd" numeric(10, 2);--> statement-breakpoint
ALTER TABLE "supplier_pos" ADD COLUMN "total_charged_usd" numeric(10, 2);--> statement-breakpoint
ALTER TABLE "supplier_pos" ADD COLUMN "card_label" text;--> statement-breakpoint
ALTER TABLE "supplier_pos" ADD COLUMN "tracking" text;