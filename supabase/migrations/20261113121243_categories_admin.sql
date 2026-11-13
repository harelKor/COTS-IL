ALTER TABLE "categories" ADD COLUMN "group_id" text DEFAULT 'misc' NOT NULL;--> statement-breakpoint
ALTER TABLE "categories" ADD COLUMN "hidden" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "categories" ADD COLUMN "home_image" text;--> statement-breakpoint
-- S16d: seed each category's group from the map that lived in src/domain/category-groups.ts.
UPDATE "categories" SET "group_id" = CASE
  WHEN "slug" IN ('motors', 'electronics', 'sensors') THEN 'electrical'
  WHEN "slug" IN ('drivetrain', 'gearboxes', 'gears', 'belts-chain', 'wheels') THEN 'motion'
  WHEN "slug" IN ('bearings', 'shafts', 'structure', 'fasteners') THEN 'structure'
  WHEN "slug" IN ('mechanisms', 'pneumatics') THEN 'mechanisms'
  ELSE 'misc' END;
