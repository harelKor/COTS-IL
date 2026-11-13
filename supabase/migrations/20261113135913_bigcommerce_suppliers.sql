-- goBILDA and REV sync by reading their BigCommerce pages (src/suppliers/bigcommerce.ts).
-- Brand colours from each store's theme (goBILDA yellow and black, REV orange and black),
-- only where the admin hasn't set any; both stay editable in הגדרות → ספקים.
UPDATE "suppliers" AS s SET "accent_color" = v.c1, "accent_color_2" = v.c2
FROM (VALUES ('gobilda', '#ffd000', '#111111'), ('rev', '#f05a28', '#111111')) AS v(code, c1, c2)
WHERE s."code" = v.code AND s."accent_color" IS NULL;--> statement-breakpoint
UPDATE "suppliers" SET "programs" = '{FTC}' WHERE "code" = 'gobilda' AND "platform" = 'bigcommerce';
--> statement-breakpoint
-- Their header logos, hot-linked like the other vendors'; the admin can upload a copy instead.
UPDATE "suppliers" AS s SET "logo_url" = v.logo
FROM (VALUES
  ('gobilda', 'https://cdn11.bigcommerce.com/s-x56mtydx1w/stencil/540ee6b0-c110-013f-92f3-0a850c090f91/img/goBILDA.svg'),
  ('rev', 'https://cdn11.bigcommerce.com/s-t3eo8vwp22/images/stencil/original/rev_logo-250x100px_1597946647__83857.original.png')
) AS v(code, logo)
WHERE s."code" = v.code AND s."logo_url" IS NULL;
