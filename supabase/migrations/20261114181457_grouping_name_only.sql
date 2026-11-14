-- The grouping report's new reason (src/domain/families/group.ts): two suppliers' parts with the same
-- name and nothing else in common (no shared SKU, price or maker), kept apart for the admin to look at.
ALTER TYPE "public"."grouping_issue_reason" ADD VALUE 'name-only';