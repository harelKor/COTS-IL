/**
 * Local development seed: an admin (the Israeli supplier), one approved FRC team
 * with two sign-in emails on its account (D11: both are equal) and one pending FTC
 * team. Safe to run more than once. Suppliers and categories come
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

type SeedUser = {
  email: string;
  meta: Record<string, unknown>;
  isAdmin?: boolean;
  teamStatus?: "active";
  /** Adds this email to the account of the team that this other seeded email created. */
  joinTeamOf?: string;
};

const users: SeedUser[] = [
  { email: "mentor@beniadam.test", meta: { full_name: "הספק הישראלי" }, isAdmin: true },
  {
    email: "frc1690@beniadam.test",
    meta: {
      full_name: "Orbit 1690",
      phone: "050-0000001",
      program: "FRC",
      team_number: 1690,
      team_name: "Orbit",
    },
    teamStatus: "active",
  },
  { email: "frc1690-2@beniadam.test", meta: { full_name: "Orbit 1690, כתובת שנייה" }, joinTeamOf: "frc1690@beniadam.test" },
  {
    email: "ftc20001@beniadam.test",
    meta: { full_name: "Demo FTC", phone: "050-0000002", program: "FTC", team_number: 20001, team_name: "Demo FTC" },
  },
];

async function main() {
  const { data: list, error: listError } = await supabase.auth.admin.listUsers({ perPage: 1000 });
  if (listError) throw listError;

  const ids = new Map<string, string>();
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
    } else {
      await supabase.auth.admin.updateUserById(id, { password }); // keeps logins working after `npm run env:local`
    }
    ids.set(u.email, id);
    if (u.isAdmin) await db.update(schema.profiles).set({ isAdmin: true }).where(eq(schema.profiles.id, id));
    if (u.teamStatus) {
      const [m] = await db.select().from(schema.memberships).where(eq(schema.memberships.userId, id));
      if (m) await db.update(schema.teams).set({ status: u.teamStatus }).where(eq(schema.teams.id, m.teamId));
    }
    const owner = u.joinTeamOf && ids.get(u.joinTeamOf);
    if (owner) {
      const [m] = await db.select().from(schema.memberships).where(eq(schema.memberships.userId, owner));
      if (m) await db.insert(schema.memberships).values({ teamId: m.teamId, userId: id }).onConflictDoNothing();
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
