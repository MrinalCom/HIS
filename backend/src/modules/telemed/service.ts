import { randomUUID } from "crypto";
import { pool } from "../../config/db.js";

export interface TelemedSession {
  id: string;
  appointment_id: string;
  room_token: string;
  status: string;
  started_at: string | null;
  ended_at: string | null;
}

export async function findSessionByAppointmentId(appointmentId: string): Promise<TelemedSession | undefined> {
  const result = await pool.query<TelemedSession>("SELECT * FROM telemed_sessions WHERE appointment_id = $1", [
    appointmentId,
  ]);
  return result.rows[0];
}

export async function createOrGetSession(appointmentId: string): Promise<TelemedSession> {
  const existing = await findSessionByAppointmentId(appointmentId);
  if (existing) return existing;

  const result = await pool.query<TelemedSession>(
    "INSERT INTO telemed_sessions (appointment_id, room_token) VALUES ($1, $2) RETURNING *",
    [appointmentId, randomUUID()]
  );
  return result.rows[0];
}

export async function markSessionActive(id: string): Promise<void> {
  await pool.query(
    "UPDATE telemed_sessions SET status = 'active', started_at = COALESCE(started_at, now()) WHERE id = $1",
    [id]
  );
}

export async function markSessionEnded(id: string): Promise<void> {
  await pool.query("UPDATE telemed_sessions SET status = 'ended', ended_at = now() WHERE id = $1", [id]);
}
