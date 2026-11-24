CREATE TYPE "public"."payment_method" AS ENUM('transfer', 'card', 'cheque', 'cash', 'other');--> statement-breakpoint
CREATE TABLE "payments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"order_id" uuid,
	"team_id" uuid NOT NULL,
	"amount_ils" numeric(12, 2) NOT NULL,
	"paid_at" date NOT NULL,
	"method" "payment_method" NOT NULL,
	"reference" text,
	"note" text,
	"document_id" uuid,
	"created_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"voided_at" timestamp with time zone,
	"voided_by" uuid,
	"void_reason" text
);
--> statement-breakpoint
ALTER TABLE "quotes" ADD COLUMN "vat_rate" numeric(5, 4);--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_order_id_team_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."team_orders"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_team_id_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_created_by_profiles_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."profiles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_voided_by_profiles_id_fk" FOREIGN KEY ("voided_by") REFERENCES "public"."profiles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "payments_order_id_idx" ON "payments" USING btree ("order_id");--> statement-breakpoint
CREATE INDEX "payments_team_id_idx" ON "payments" USING btree ("team_id");--> statement-breakpoint
-- P1: the app writes through its own DB connection; RLS with no policy keeps payments away from the browser's API keys.
ALTER TABLE "payments" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_amount_positive" CHECK ("amount_ils" > 0);--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_void_reason" CHECK ("voided_at" IS NULL OR "void_reason" IS NOT NULL);--> statement-breakpoint
-- Append-only: a payment is voided, never deleted, and what was paid never changes.
CREATE FUNCTION public.payments_append_only() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'payments are never deleted: void them';
  END IF;
  IF NEW.amount_ils IS DISTINCT FROM OLD.amount_ils OR NEW.paid_at IS DISTINCT FROM OLD.paid_at OR NEW.method IS DISTINCT FROM OLD.method
    OR NEW.reference IS DISTINCT FROM OLD.reference OR NEW.created_by IS DISTINCT FROM OLD.created_by OR NEW.created_at IS DISTINCT FROM OLD.created_at
    OR (OLD.voided_at IS NOT NULL AND NEW.voided_at IS DISTINCT FROM OLD.voided_at) THEN
    RAISE EXCEPTION 'a payment is not edited: void it and record it again';
  END IF;
  RETURN NEW;
END $$;--> statement-breakpoint
CREATE TRIGGER payments_append_only BEFORE UPDATE OR DELETE ON "payments" FOR EACH ROW EXECUTE FUNCTION public.payments_append_only();
