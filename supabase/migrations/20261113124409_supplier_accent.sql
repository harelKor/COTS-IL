ALTER TABLE "suppliers" ADD COLUMN "accent_color" text;--> statement-breakpoint
UPDATE "suppliers" SET "accent_color" = CASE "code" WHEN 'andymark' THEN '#dc2626' WHEN 'wcp' THEN '#16a34a' WHEN 'ctre' THEN '#2563eb' WHEN 'ttb' THEN '#ea580c' END WHERE "code" IN ('andymark', 'wcp', 'ctre', 'ttb') AND "accent_color" IS NULL;
