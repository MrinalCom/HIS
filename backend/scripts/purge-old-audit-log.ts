/**
 * Illustrative retention purge for audit_log — see docs/retention-policy.md.
 *
 * Deliberately NOT scheduled anywhere and NOT reachable via any API route.
 * Connects with DATABASE_URL (the migrator/superuser connection), not
 * APP_DATABASE_URL, because his_app has no DELETE privilege on audit_log by
 * design (WORM — see backend/src/db/migrations/0001_identity.cjs). Defaults
 * to a dry run; pass --confirm to actually delete.
 *
 * Usage:
 *   npx tsx scripts/purge-old-audit-log.ts --olderThanDays=2555
 *   npx tsx scripts/purge-old-audit-log.ts --olderThanDays=2555 --confirm
 */
import "dotenv/config";
import { Pool } from "pg";

function parseArgs() {
  const args = process.argv.slice(2);
  const olderThanDaysArg = args.find((a) => a.startsWith("--olderThanDays="));
  const olderThanDays = olderThanDaysArg ? Number(olderThanDaysArg.split("=")[1]) : undefined;
  const confirm = args.includes("--confirm");
  return { olderThanDays, confirm };
}

async function main() {
  const { olderThanDays, confirm } = parseArgs();
  if (!olderThanDays || olderThanDays <= 0) {
    console.error("Usage: purge-old-audit-log.ts --olderThanDays=<N> [--confirm]");
    process.exit(1);
  }

  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    console.error("DATABASE_URL (migrator/superuser connection) is required — APP_DATABASE_URL cannot DELETE.");
    process.exit(1);
  }

  const pool = new Pool({ connectionString });
  try {
    const cutoff = `now() - interval '${olderThanDays} days'`;
    const countResult = await pool.query(`SELECT count(*) FROM audit_log WHERE occurred_at < ${cutoff}`);
    const count = Number(countResult.rows[0].count);

    console.log(`${count} audit_log row(s) older than ${olderThanDays} days.`);

    if (!confirm) {
      console.log("Dry run only — re-run with --confirm to actually delete.");
      return;
    }

    const deleteResult = await pool.query(`DELETE FROM audit_log WHERE occurred_at < ${cutoff}`);
    console.log(`Deleted ${deleteResult.rowCount} row(s).`);
  } finally {
    await pool.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
