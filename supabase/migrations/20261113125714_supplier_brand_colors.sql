ALTER TABLE "suppliers" ADD COLUMN "accent_color_2" text;--> statement-breakpoint
UPDATE "suppliers" AS s SET "accent_color" = v.c1, "accent_color_2" = v.c2
FROM (VALUES ('andymark', '#bb2025', NULL, '#dc2626'), ('wcp', '#0075c9', NULL, '#16a34a'), ('ctre', '#97d700', '#111111', '#2563eb'), ('ttb', '#00aa00', '#ffffff', '#ea580c')) AS v(code, c1, c2, old)
WHERE s."code" = v.code AND (s."accent_color" IS NULL OR s."accent_color" = v.old);
