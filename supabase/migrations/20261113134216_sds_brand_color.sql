-- Swerve Drive Specialties (added in the admin): its brand is the black logo on a slate site.
-- Only when no colour was set, so the admin's choice wins.
UPDATE "suppliers" SET "accent_color" = '#202223', "accent_color_2" = '#96a4b6'
WHERE "base_url" ILIKE '%swervedrivespecialties%' AND "accent_color" IS NULL;
