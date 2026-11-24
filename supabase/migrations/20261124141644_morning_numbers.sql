ALTER TABLE "payments" ADD COLUMN "morning_doc_no" text;--> statement-breakpoint
ALTER TABLE "quotes" ADD COLUMN "morning_quote_no" text;--> statement-breakpoint
ALTER TABLE "quotes" ADD COLUMN "morning_deal_no" text;--> statement-breakpoint
-- Morning numbers are typed by hand: digits only (src/domain/morning-numbers.ts checks the same).
ALTER TABLE "payments" ADD CONSTRAINT "payments_morning_doc_no_digits" CHECK ("morning_doc_no" ~ '^[0-9]{1,12}$');--> statement-breakpoint
ALTER TABLE "quotes" ADD CONSTRAINT "quotes_morning_quote_no_digits" CHECK ("morning_quote_no" ~ '^[0-9]{1,12}$');--> statement-breakpoint
ALTER TABLE "quotes" ADD CONSTRAINT "quotes_morning_deal_no_digits" CHECK ("morning_deal_no" ~ '^[0-9]{1,12}$');--> statement-breakpoint
-- Payments stay append-only. What may change: the typed Morning number (morning_doc_no), voiding (once),
-- the P3 document link, and the order and team when an order is deleted, moved or its team merged.
CREATE OR REPLACE FUNCTION public.payments_append_only() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'payments are never deleted: void them';
  END IF;
  IF NEW.id IS DISTINCT FROM OLD.id OR NEW.amount_ils IS DISTINCT FROM OLD.amount_ils OR NEW.paid_at IS DISTINCT FROM OLD.paid_at
    OR NEW.method IS DISTINCT FROM OLD.method OR NEW.reference IS DISTINCT FROM OLD.reference OR NEW.note IS DISTINCT FROM OLD.note
    OR NEW.created_by IS DISTINCT FROM OLD.created_by OR NEW.created_at IS DISTINCT FROM OLD.created_at
    OR (OLD.voided_at IS NOT NULL AND (NEW.voided_at IS DISTINCT FROM OLD.voided_at OR NEW.voided_by IS DISTINCT FROM OLD.voided_by
      OR NEW.void_reason IS DISTINCT FROM OLD.void_reason)) THEN
    RAISE EXCEPTION 'a payment is not edited: void it and record it again (only its Morning number may change)';
  END IF;
  RETURN NEW;
END $$;
