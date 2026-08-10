import { pool } from "../../config/db.js";

export interface Ward {
  id: string;
  name: string;
  department_id: string | null;
}

export interface Bed {
  id: string;
  ward_id: string;
  ward_name: string;
  label: string;
  status: string;
  patient_first_name?: string | null;
  patient_last_name?: string | null;
  admission_id?: string | null;
}

export async function listWards(): Promise<Ward[]> {
  const result = await pool.query<Ward>("SELECT * FROM wards ORDER BY name");
  return result.rows;
}

// Joins in the current occupant (if any) so the bed board can render
// patient names directly instead of a second round trip per bed.
export async function listBeds(): Promise<Bed[]> {
  const result = await pool.query<Bed>(
    `SELECT b.id, b.ward_id, w.name AS ward_name, b.label, b.status,
            p.first_name AS patient_first_name, p.last_name AS patient_last_name, a.id AS admission_id
     FROM beds b
     JOIN wards w ON w.id = b.ward_id
     LEFT JOIN admissions a ON a.bed_id = b.id AND a.status = 'admitted'
     LEFT JOIN patients p ON p.id = a.patient_id
     ORDER BY w.name, b.label`
  );
  return result.rows;
}

export async function findBedById(id: string): Promise<{ id: string; status: string } | undefined> {
  const result = await pool.query<{ id: string; status: string }>("SELECT id, status FROM beds WHERE id = $1", [
    id,
  ]);
  return result.rows[0];
}

export interface Admission {
  id: string;
  patient_id: string;
  bed_id: string;
  status: string;
  admitted_at: string;
  discharged_at: string | null;
}

export async function admitPatient(input: {
  patientId: string;
  bedId: string;
  encounterId?: string;
  admittedBy: string;
}): Promise<Admission> {
  const bed = await findBedById(input.bedId);
  if (!bed) throw new Error("Unknown bed");
  if (bed.status !== "available") throw new Error("Bed is not available");

  const result = await pool.query<Admission>(
    `INSERT INTO admissions (patient_id, bed_id, encounter_id, admitted_by)
     VALUES ($1, $2, $3, $4)
     RETURNING *`,
    [input.patientId, input.bedId, input.encounterId ?? null, input.admittedBy]
  );
  await pool.query("UPDATE beds SET status = 'occupied' WHERE id = $1", [input.bedId]);
  return result.rows[0];
}

export async function dischargeAdmission(id: string): Promise<Admission | undefined> {
  const result = await pool.query<Admission>(
    `UPDATE admissions SET status = 'discharged', discharged_at = now() WHERE id = $1 AND status = 'admitted' RETURNING *`,
    [id]
  );
  const admission = result.rows[0];
  if (admission) {
    await pool.query("UPDATE beds SET status = 'cleaning' WHERE id = $1", [admission.bed_id]);
  }
  return admission;
}

export async function setBedStatus(id: string, status: string): Promise<void> {
  await pool.query("UPDATE beds SET status = $1::bed_status WHERE id = $2", [status, id]);
}

export async function listAdmissionsForPatient(patientId: string): Promise<Admission[]> {
  const result = await pool.query<Admission>(
    "SELECT * FROM admissions WHERE patient_id = $1 ORDER BY admitted_at DESC",
    [patientId]
  );
  return result.rows;
}
