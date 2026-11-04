import "server-only";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

/**
 * Direct Postgres connection. It bypasses Row Level Security, so use it only
 * in server code that has already checked the caller's permissions (admin
 * actions, sign-up checks, scripts). User-facing reads go through the
 * Supabase client in `@/lib/supabase/server`, where RLS applies.
 */
const globalForDb = globalThis as unknown as { pg?: ReturnType<typeof postgres> };

const client = globalForDb.pg ?? postgres(process.env.DATABASE_URL!, { prepare: false });
if (process.env.NODE_ENV !== "production") globalForDb.pg = client;

export const db = drizzle(client, { schema });
export { schema };
