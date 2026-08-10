import { pool } from "../../config/db.js";

export interface Consent {
  id: string;
  patient_id: string;
  consent_type: string;
  granted_at: string;
  revoked_at: string | null;
  created_at: string;
}

export async function grantConsent(patientId: string, consentType: string): Promise<Consent> {
  const existing = await pool.query<Consent>(
    "SELECT * FROM consents WHERE patient_id = $1 AND consent_type = $2 AND revoked_at IS NULL",
    [patientId, consentType]
  );
  if (existing.rows[0]) return existing.rows[0];

  const result = await pool.query<Consent>(
    "INSERT INTO consents (patient_id, consent_type) VALUES ($1, $2) RETURNING *",
    [patientId, consentType]
  );
  return result.rows[0];
}

export async function listConsentsForPatient(patientId: string): Promise<Consent[]> {
  const result = await pool.query<Consent>(
    "SELECT * FROM consents WHERE patient_id = $1 ORDER BY created_at DESC",
    [patientId]
  );
  return result.rows;
}

// Consent is revocable, never hard-deleted — the historical grant/revoke
// record must survive for audit purposes even after revocation.
export async function revokeConsent(id: string, patientId: string): Promise<Consent | undefined> {
  const result = await pool.query<Consent>(
    "UPDATE consents SET revoked_at = now() WHERE id = $1 AND patient_id = $2 AND revoked_at IS NULL RETURNING *",
    [id, patientId]
  );
  return result.rows[0];
}
