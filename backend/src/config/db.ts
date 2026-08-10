import { Pool } from "pg";

// Runs as the least-privilege his_app role (no DDL, cannot UPDATE/DELETE
// audit_log) — see backend/src/db/migrations/0001_identity.cjs.
export const pool = new Pool({
  connectionString: process.env.APP_DATABASE_URL || process.env.DATABASE_URL,
});
