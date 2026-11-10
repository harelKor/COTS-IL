import "server-only";
import { attachDatabasePool } from "@vercel/functions";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "./schema";

/**
 * Direct Postgres connection. It bypasses Row Level Security, so use it only
 * in server code that has already checked the caller's permissions (admin
 * actions, sign-up checks, scripts). User-facing reads go through the
 * Supabase client in `@/lib/supabase/server`, where RLS applies.
 *
 * node-postgres with `attachDatabasePool`, not postgres.js (Nov 10, 2026): on
 * Fluid compute an instance is frozen between requests, and a connection left
 * open across the freeze can come back dead. postgres.js kept sending queries
 * down such a socket and they never answered (`/admin/purchasing` hung for its
 * full 30 s while the database had nothing running). `attachDatabasePool` keeps
 * the instance alive until idle connections are closed, and `query_timeout`
 * fails any query that still gets no answer.
 *
 * Every limit is short on purpose: a request that can't get a connection or
 * whose query runs long fails within seconds and shows an error, instead of
 * holding a Vercel function for its full `maxDuration`.
 */
export const DB_LIMITS = {
  /** Connections per server instance. Vercel runs many instances, and the pooler has its own limit. */
  max: 5,
  /** Close a connection after 5 s unused, so a suspended instance holds none. */
  idleTimeoutMillis: 5_000,
  /** Give up getting a connection (opening one or waiting for a free one) after 10 s. */
  connectionTimeoutMillis: 10_000,
  /** Postgres cancels any statement that runs longer than this (ms). */
  statement_timeout: 8_000,
  /** The client gives up on a query with no answer after this (ms), e.g. on a dead socket. */
  query_timeout: 10_000,
} as const;

/**
 * The connection string without `sslmode`, and the TLS setting it asked for. postgres.js
 * read `sslmode=require` as "encrypt, don't verify"; newer pg reads it as "verify the
 * certificate", which the Supabase pooler's chain fails. Keep postgres.js's meaning.
 */
function connection(url: string) {
  const parsed = new URL(url);
  const mode = parsed.searchParams.get("sslmode");
  parsed.searchParams.delete("sslmode");
  const ssl = mode && mode !== "disable" ? { rejectUnauthorized: false } : undefined;
  return { connectionString: parsed.toString(), ssl };
}

const globalForDb = globalThis as unknown as { pgPool?: Pool };

const pool =
  globalForDb.pgPool ??
  new Pool({
    ...connection(process.env.DATABASE_URL!),
    max: DB_LIMITS.max,
    idleTimeoutMillis: DB_LIMITS.idleTimeoutMillis,
    connectionTimeoutMillis: DB_LIMITS.connectionTimeoutMillis,
    statement_timeout: DB_LIMITS.statement_timeout,
    query_timeout: DB_LIMITS.query_timeout,
    application_name: "cots-il-web",
  });
if (!globalForDb.pgPool) {
  // A connection that drops while idle is removed from the pool; never let it crash the process.
  pool.on("error", (err) => console.error("[db] idle connection error", err.message));
  attachDatabasePool(pool);
}
if (process.env.NODE_ENV !== "production") globalForDb.pgPool = pool;

export const db = drizzle(pool, { schema });
export { schema };
