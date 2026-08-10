import { pool } from "../../../config/db.js";
import { ChatMessage } from "./agent.js";

export interface TriageSession {
  id: string;
  patient_id: string | null;
  session_data: unknown;
  red_flags: string[];
  recommended_action: string;
  disclaimer_shown: boolean;
  degraded: boolean;
  created_at: string;
}

export async function recordTriageSession(input: {
  patientId?: string;
  messages: ChatMessage[];
  redFlags: string[];
  recommendedAction: string;
  degraded: boolean;
}): Promise<TriageSession> {
  const result = await pool.query<TriageSession>(
    `INSERT INTO ai_triage_sessions (patient_id, session_data, red_flags, recommended_action, degraded)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING *`,
    [
      input.patientId ?? null,
      JSON.stringify(input.messages),
      JSON.stringify(input.redFlags),
      input.recommendedAction,
      input.degraded,
    ]
  );
  return result.rows[0];
}
