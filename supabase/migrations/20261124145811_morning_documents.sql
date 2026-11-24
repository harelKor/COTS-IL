CREATE TYPE "public"."billing_document_kind" AS ENUM('quote', 'deal', 'invoice_receipt', 'credit');--> statement-breakpoint
CREATE TYPE "public"."billing_document_status" AS ENUM('pending', 'issued', 'failed');--> statement-breakpoint
CREATE TABLE "billing_documents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"order_id" uuid,
	"order_number" integer,
	"team_id" uuid NOT NULL,
	"quote_id" uuid,
	"payment_id" uuid,
	"credits_id" uuid,
	"kind" "billing_document_kind" NOT NULL,
	"status" "billing_document_status" DEFAULT 'pending' NOT NULL,
	"env" text NOT NULL,
	"payload" jsonb NOT NULL,
	"amount_ils" numeric(12, 2) NOT NULL,
	"morning_id" text,
	"number" text,
	"issued_at" timestamp with time zone,
	"pdf_url_he" text,
	"pdf_url_en" text,
	"error" text,
	"attempts" integer DEFAULT 0 NOT NULL,
	"attempt_at" timestamp with time zone,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "teams" ADD COLUMN "billing_name" text;--> statement-breakpoint
ALTER TABLE "teams" ADD COLUMN "billing_tax_id" text;--> statement-breakpoint
ALTER TABLE "teams" ADD COLUMN "billing_email" text;--> statement-breakpoint
ALTER TABLE "teams" ADD COLUMN "billing_address" text;--> statement-breakpoint
ALTER TABLE "teams" ADD COLUMN "morning_client_id" text;--> statement-breakpoint
ALTER TABLE "billing_documents" ADD CONSTRAINT "billing_documents_order_id_team_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."team_orders"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "billing_documents" ADD CONSTRAINT "billing_documents_team_id_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "billing_documents" ADD CONSTRAINT "billing_documents_quote_id_quotes_id_fk" FOREIGN KEY ("quote_id") REFERENCES "public"."quotes"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "billing_documents" ADD CONSTRAINT "billing_documents_payment_id_payments_id_fk" FOREIGN KEY ("payment_id") REFERENCES "public"."payments"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "billing_documents" ADD CONSTRAINT "billing_documents_credits_id_billing_documents_id_fk" FOREIGN KEY ("credits_id") REFERENCES "public"."billing_documents"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "billing_documents" ADD CONSTRAINT "billing_documents_created_by_profiles_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."profiles"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "billing_documents_order_id_idx" ON "billing_documents" USING btree ("order_id");--> statement-breakpoint
CREATE INDEX "billing_documents_team_id_idx" ON "billing_documents" USING btree ("team_id");--> statement-breakpoint
CREATE UNIQUE INDEX "billing_documents_quote_kind_key" ON "billing_documents" USING btree ("quote_id","kind") WHERE "billing_documents"."kind" IN ('quote', 'deal');--> statement-breakpoint
CREATE UNIQUE INDEX "billing_documents_payment_key" ON "billing_documents" USING btree ("payment_id") WHERE "billing_documents"."kind" = 'invoice_receipt';--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_document_id_billing_documents_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."billing_documents"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
-- P3: the app writes through its own DB connection; RLS with no policy keeps documents away from the browser's API keys.
ALTER TABLE "billing_documents" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "billing_documents" ADD CONSTRAINT "billing_documents_env" CHECK ("env" IN ('sandbox', 'production'));--> statement-breakpoint
ALTER TABLE "billing_documents" ADD CONSTRAINT "billing_documents_amount_positive" CHECK ("amount_ils" > 0);--> statement-breakpoint
ALTER TABLE "billing_documents" ADD CONSTRAINT "billing_documents_number_digits" CHECK ("number" ~ '^[0-9]{1,12}$');--> statement-breakpoint
ALTER TABLE "billing_documents" ADD CONSTRAINT "billing_documents_issued" CHECK ("status" <> 'issued' OR ("morning_id" IS NOT NULL AND "number" IS NOT NULL AND "issued_at" IS NOT NULL));--> statement-breakpoint
ALTER TABLE "billing_documents" ADD CONSTRAINT "billing_documents_links" CHECK (
  ("kind" <> 'invoice_receipt' OR "payment_id" IS NOT NULL) AND ("kind" <> 'credit' OR "credits_id" IS NOT NULL));--> statement-breakpoint
-- An issued document is a legal record: never deleted, and what it says never changes. Its order and
-- quote may go (an order deleted after its documents were credited), its team may be merged into another,
-- and fresh PDF links may be stored.
CREATE FUNCTION public.billing_documents_issued_fixed() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD.status = 'issued' OR OLD.status = 'pending' THEN
      RAISE EXCEPTION 'an issued document is never deleted: credit it';
    END IF;
    RETURN OLD;
  END IF;
  IF OLD.status = 'issued' AND (NEW.status IS DISTINCT FROM OLD.status OR NEW.kind IS DISTINCT FROM OLD.kind OR NEW.env IS DISTINCT FROM OLD.env
    OR NEW.morning_id IS DISTINCT FROM OLD.morning_id OR NEW.number IS DISTINCT FROM OLD.number OR NEW.amount_ils IS DISTINCT FROM OLD.amount_ils
    OR NEW.issued_at IS DISTINCT FROM OLD.issued_at OR NEW.payment_id IS DISTINCT FROM OLD.payment_id
    OR NEW.credits_id IS DISTINCT FROM OLD.credits_id OR NEW.payload IS DISTINCT FROM OLD.payload
    OR (NEW.order_id IS NOT NULL AND NEW.order_id IS DISTINCT FROM OLD.order_id)
    OR (NEW.quote_id IS NOT NULL AND NEW.quote_id IS DISTINCT FROM OLD.quote_id)) THEN
    RAISE EXCEPTION 'an issued document is not edited: credit it';
  END IF;
  RETURN NEW;
END $$;--> statement-breakpoint
CREATE TRIGGER billing_documents_issued_fixed BEFORE UPDATE OR DELETE ON "billing_documents" FOR EACH ROW EXECUTE FUNCTION public.billing_documents_issued_fixed();
