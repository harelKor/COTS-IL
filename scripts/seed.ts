/**
 * Local development seed: an admin (the mentor), one approved FRC team and one
 * pending FTC team. Safe to run more than once. Suppliers and categories come
 * from the migrations, and products from `npm run sync`.
 * All seeded users share SEED_PASSWORD from .env.local.
 */
import { config } from "dotenv";
import { createClient } from "@supabase/supabase-js";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "../src/db/schema";

config({ path: ".env.local" });

const password = process.env.SEED_PASSWORD;
if (!password) throw new Error("SEED_PASSWORD missing: run `npm run env:local` first");

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SECRET_KEY!, {
  auth: { persistSession: false },
});
const sql = postgres(process.env.DATABASE_URL!);
const db = drizzle(sql, { schema });

type SeedUser = { email: string; meta: Record<string, unknown>; isAdmin?: boolean; teamStatus?: "active" };

const users: SeedUser[] = [
  { email: "mentor@beniadam.test", meta: { full_name: "המנטור" }, isAdmin: true },
  {
    email: "frc1690@beniadam.test",
    meta: {
      full_name: "מנהלת קבוצה",
      phone: "050-0000001",
      program: "FRC",
      team_number: 1690,
      team_name: "Orbit",
    },
    teamStatus: "active",
  },
  {
    email: "ftc20001@beniadam.test",
    meta: { full_name: "מנהל קבוצה", phone: "050-0000002", program: "FTC", team_number: 20001, team_name: "Demo FTC" },
  },
];

async function main() {
  const { data: list, error: listError } = await supabase.auth.admin.listUsers({ perPage: 1000 });
  if (listError) throw listError;

  for (const u of users) {
    let id = list.users.find((x) => x.email === u.email)?.id;
    if (!id) {
      const { data, error } = await supabase.auth.admin.createUser({
        email: u.email,
        password,
        email_confirm: true,
        user_metadata: u.meta,
      });
      if (error) throw error;
      id = data.user.id;
      console.log(`created ${u.email}`);
    }
    if (u.isAdmin) await db.update(schema.profiles).set({ isAdmin: true }).where(eq(schema.profiles.id, id));
    if (u.teamStatus) {
      const [m] = await db.select().from(schema.memberships).where(eq(schema.memberships.userId, id));
      if (m) await db.update(schema.teams).set({ status: u.teamStatus }).where(eq(schema.teams.id, m.teamId));
    }
  }

  console.log(`seeded ${users.length} users`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => sql.end());
