-- Every order and quote page asks audit_log for an entity's latest action of a kind (the change
-- request, the undo window: src/lib/orders.ts). Without an index each one scanned the whole log.
CREATE INDEX IF NOT EXISTS "audit_log_entity_action_at_idx" ON "audit_log" USING btree ("entity","entity_id","action","at");
