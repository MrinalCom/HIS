import { pool } from "../../../config/db.js";

export async function logConciergeExchange(input: {
  patientId?: string;
  message: string;
  reply: string;
  degraded: boolean;
}): Promise<void> {
  await pool.query(
    `INSERT INTO ai_concierge_logs (patient_id, message, reply, degraded) VALUES ($1, $2, $3, $4)`,
    [input.patientId ?? null, input.message, input.reply, input.degraded]
  );
}
