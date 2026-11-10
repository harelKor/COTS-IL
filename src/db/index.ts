import "server-only";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

/**
 * Direct Postgres connection. It bypasses Row Level Security, so use it only
 * in server code that has already checked the caller's permissions (admin
 * actions, sign-up checks, scripts). User-facing reads go through the
 * Supabase client in `@/lib/supabase/server`, where RLS applies.
 *
 * Every limit is short on purpose: a request that can't get a connection or
 * whose query runs long fails within seconds and shows an error, instead of
 * holding a Vercel function for its full `maxDuration` (the 300 s `/catalog`
 * hangs of Nov 9 and 10, 2026).
 */
export const DB_LIMITS = {
  /** Connections per server instance. Vercel runs many instances, and the pooler has its own limit. */
  max: 5,
  /** Close a connection after 20 s unused, so frozen instances don't hold pooler slots. */
  idle_timeout: 20,
  /** Give up connecting after 10 s. */
  connect_timeout: 10,
  /** Give up waiting for a free connection after 10 s. */
  queue_timeout: 10,
  /** Postgres cancels any statement that runs longer than this (ms). */
  statement_timeout: 8_000,
} as const;

const globalForDb = globalThis as unknown as { pg?: ReturnType<typeof postgres> };

const client =
  globalForDb.pg ??
  postgres(process.env.DATABASE_URL!, {
    prepare: false,
    max: DB_LIMITS.max,
    idle_timeout: DB_LIMITS.idle_timeout,
    connect_timeout: DB_LIMITS.connect_timeout,
    queue_timeout: DB_LIMITS.queue_timeout,
    connection: { statement_timeout: DB_LIMITS.statement_timeout, application_name: "cots-il-web" },
  });
if (process.env.NODE_ENV !== "production") globalForDb.pg = client;

export const db = drizzle(client, { schema });
export { schema };
