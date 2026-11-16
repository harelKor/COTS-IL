/**
 * Records a background job's outcome in job_runs, for the health list on /admin (M1).
 *
 *   npm run job-report -- revalidate failed "curl exit 22"
 *   npm run job-report -- daily_digest ok
 *
 * The GitHub workflows call it when a step's outcome can't be recorded by the app itself (the
 * site didn't answer). Uses DATABASE_URL from the environment (or .env.local on the local stack).
 * Exits 0 even when the write fails, so a report never fails the job it reports on.
 */
import { config } from "dotenv";
import postgres from "postgres";

config({ path: ".env.local", override: false });

const JOBS = ["backup", "revalidate", "daily_digest", "watchdog"];
const [job, outcome, message] = process.argv.slice(2);

async function main() {
  if (!JOBS.includes(job) || (outcome !== "ok" && outcome !== "failed")) {
    console.log(`Usage: npm run job-report -- <${JOBS.join("|")}> <ok|failed> [message]`);
    process.exitCode = 1;
    return;
  }
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error("DATABASE_URL is not set; not recorded");
    return;
  }
  if (/:543\d\d\//.test(url)) throw new Error("Refusing: port 543xx belongs to another project (this project's local stack is 544xx)");
  const sql = postgres(url, { prepare: false, max: 1 });
  try {
    const detail = { source: "github", ...(message ? { error: message.slice(0, 300) } : {}), ...(process.env.GITHUB_RUN_ID ? { run: process.env.GITHUB_RUN_ID } : {}) };
    await sql`INSERT INTO job_runs (job, ok, detail) VALUES (${job}, ${outcome === "ok"}, ${sql.json(detail)})`;
    console.log(`Recorded ${job}: ${outcome}`);
  } catch (error) {
    console.error(`Could not record ${job}:`, error);
  } finally {
    await sql.end();
  }
}

main();
