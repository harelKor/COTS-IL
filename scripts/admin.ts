/**
 * Grant or revoke the admin (the Israeli supplier) for a signed-in user.
 *
 *   npm run admin -- list
 *   npm run admin -- add someone@example.com
 *   npm run admin -- remove someone@example.com
 *
 * The person must have signed in once (email code, link or Google), which creates their profile.
 * Uses DATABASE_URL from .env.local (the local stack). For production, run it with the production
 * DATABASE_URL in the environment instead: DATABASE_URL="postgres://…" npm run admin -- add …
 * Every change is written to audit_log.
 */
import { config } from "dotenv";
import postgres from "postgres";

config({ path: ".env.local", override: false });
const url = process.env.DATABASE_URL;
if (!url) throw new Error("DATABASE_URL is not set");
if (/:543\d\d\//.test(url)) throw new Error("Refusing: port 543xx belongs to another project (COTS-IL local is 544xx)");

const [command, rawEmail] = process.argv.slice(2);
const email = rawEmail?.trim().toLowerCase();
const sql = postgres(url, { prepare: false, max: 1 });
const where = new URL(url).hostname;

async function main() {
  if (command === "list") {
    const rows = await sql`SELECT email FROM profiles WHERE is_admin ORDER BY email`;
    console.log(`Admins on ${where}:`);
    for (const r of rows) console.log(`  ${r.email}`);
    if (rows.length === 0) console.log("  (none)");
    return;
  }
  if ((command !== "add" && command !== "remove") || !email || !email.includes("@")) {
    console.log("Usage: npm run admin -- list | add <email> | remove <email>");
    process.exitCode = 1;
    return;
  }
  const makeAdmin = command === "add";
  await sql.begin(async (tx) => {
    const [profile] = await tx`SELECT id, is_admin FROM profiles WHERE lower(email) = ${email} FOR UPDATE`;
    if (!profile) throw new Error(`No profile for ${email}. They need to sign in to the site once first.`);
    if (profile.is_admin === makeAdmin) {
      console.log(`${email} is already ${makeAdmin ? "an admin" : "not an admin"} on ${where}.`);
      return;
    }
    if (!makeAdmin) {
      const [{ n }] = await tx`SELECT count(*)::int AS n FROM profiles WHERE is_admin`;
      if (n <= 1) throw new Error("Refusing: this is the last admin.");
    }
    await tx`UPDATE profiles SET is_admin = ${makeAdmin} WHERE id = ${profile.id}`;
    await tx`INSERT INTO audit_log (entity, entity_id, action, before, after)
             VALUES ('profile', ${profile.id}, ${makeAdmin ? "grant_admin" : "revoke_admin"},
                     ${sql.json({ isAdmin: !makeAdmin })}, ${sql.json({ isAdmin: makeAdmin, by: "scripts/admin.ts" })})`;
    console.log(`${email} ${makeAdmin ? "is now an admin" : "is no longer an admin"} on ${where}.`);
  });
}

main()
  .catch((e) => {
    console.error(e instanceof Error ? e.message : e);
    process.exitCode = 1;
  })
  .finally(() => sql.end());
