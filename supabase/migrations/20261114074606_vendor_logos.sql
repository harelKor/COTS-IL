-- Each vendor's own header logo, shown in place of its name on the home boxes and its store.
-- Copies for light backgrounds live in public/vendors (white parts of logos made for dark headers
-- turned dark, white backgrounds made clear). An admin's upload (the supplier-logos bucket) wins;
-- any logo can be changed in הגדרות › ספקים.
UPDATE "suppliers" AS s SET "logo_url" = 'https://cots-il.vercel.app/vendors/' || v.file
FROM (VALUES
  ('wcp', 'wcp.png'),
  ('andymark', 'andymark.png'),
  ('ttb', 'ttb.png'),
  ('ctre', 'ctre.png'),
  ('gobilda', 'gobilda.svg'),
  ('rev', 'rev.png')
) AS v(code, file)
WHERE s."code" = v.code AND (s."logo_url" IS NULL OR s."logo_url" NOT LIKE '%/supplier-logos/%');--> statement-breakpoint
-- Swerve Drive Specialties was added in the admin, so its code isn't fixed: match its site.
UPDATE "suppliers" SET "logo_url" = 'https://cots-il.vercel.app/vendors/sds.png'
WHERE "base_url" ILIKE '%swervedrivespecialties%' AND ("logo_url" IS NULL OR "logo_url" NOT LIKE '%/supplier-logos/%');
