import { pool } from "../../config/db.js";

export interface Patient {
  id: string;
  user_id: string;
  mrn: string;
  first_name: string;
  last_name: string;
  dob: string;
  gender: string;
  blood_type: string;
  address: unknown;
  phone: string | null;
  emergency_contact: unknown;
  created_at: string;
}

export async function findPatientByUserId(userId: string): Promise<Patient | undefined> {
  const result = await pool.query<Patient>("SELECT * FROM patients WHERE user_id = $1", [userId]);
  return result.rows[0];
}

export async function findPatientById(id: string): Promise<Patient | undefined> {
  const result = await pool.query<Patient>("SELECT * FROM patients WHERE id = $1", [id]);
  return result.rows[0];
}

export interface CreatePatientInput {
  userId: string;
  firstName: string;
  lastName: string;
  dob: string;
  gender: string;
  bloodType: string;
  phone?: string;
  address?: unknown;
  emergencyContact?: unknown;
}

export async function createPatientProfile(input: CreatePatientInput): Promise<Patient> {
  const result = await pool.query<Patient>(
    `INSERT INTO patients (user_id, first_name, last_name, dob, gender, blood_type, phone, address, emergency_contact)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
     RETURNING *`,
    [
      input.userId,
      input.firstName,
      input.lastName,
      input.dob,
      input.gender,
      input.bloodType,
      input.phone ?? null,
      input.address ? JSON.stringify(input.address) : null,
      input.emergencyContact ? JSON.stringify(input.emergencyContact) : null,
    ]
  );
  return result.rows[0];
}

export async function searchPatients(query: string | undefined, limit = 25): Promise<Patient[]> {
  if (!query) {
    const result = await pool.query<Patient>(
      "SELECT * FROM patients ORDER BY created_at DESC LIMIT $1",
      [limit]
    );
    return result.rows;
  }
  const result = await pool.query<Patient>(
    `SELECT * FROM patients
     WHERE mrn ILIKE $1 OR first_name ILIKE $1 OR last_name ILIKE $1
     ORDER BY created_at DESC LIMIT $2`,
    [`%${query}%`, limit]
  );
  return result.rows;
}
