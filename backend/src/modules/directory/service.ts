import { pool } from "../../config/db.js";

export interface Department {
  id: string;
  name: string;
}

export interface HealthcareService {
  id: string;
  department_id: string;
  name: string;
  duration_minutes: number;
}

export interface Practitioner {
  id: string;
  user_id: string;
  specialty: string;
  department_id: string | null;
  license_number: string | null;
  name?: string;
}

export async function listDepartments(): Promise<Department[]> {
  const result = await pool.query<Department>("SELECT id, name FROM departments ORDER BY name");
  return result.rows;
}

export async function listHealthcareServices(departmentId?: string): Promise<HealthcareService[]> {
  if (departmentId) {
    const result = await pool.query<HealthcareService>(
      "SELECT * FROM healthcare_services WHERE department_id = $1 ORDER BY name",
      [departmentId]
    );
    return result.rows;
  }
  const result = await pool.query<HealthcareService>("SELECT * FROM healthcare_services ORDER BY name");
  return result.rows;
}

export async function listPractitioners(departmentId?: string): Promise<Practitioner[]> {
  const base = `
    SELECT p.id, p.user_id, p.specialty, p.department_id, p.license_number, u.name
    FROM practitioners p
    JOIN users u ON u.id = p.user_id
  `;
  if (departmentId) {
    const result = await pool.query<Practitioner>(`${base} WHERE p.department_id = $1 ORDER BY u.name`, [
      departmentId,
    ]);
    return result.rows;
  }
  const result = await pool.query<Practitioner>(`${base} ORDER BY u.name`);
  return result.rows;
}

export async function findPractitionerByUserId(userId: string): Promise<Practitioner | undefined> {
  const result = await pool.query<Practitioner>("SELECT * FROM practitioners WHERE user_id = $1", [
    userId,
  ]);
  return result.rows[0];
}

export async function findPractitionerById(id: string): Promise<Practitioner | undefined> {
  const result = await pool.query<Practitioner>("SELECT * FROM practitioners WHERE id = $1", [id]);
  return result.rows[0];
}

export interface CreatePractitionerInput {
  userId: string;
  specialty: string;
  departmentId?: string;
  licenseNumber?: string;
}

export async function createPractitionerProfile(input: CreatePractitionerInput): Promise<Practitioner> {
  const result = await pool.query<Practitioner>(
    `INSERT INTO practitioners (user_id, specialty, department_id, license_number)
     VALUES ($1, $2, $3, $4)
     RETURNING *`,
    [input.userId, input.specialty, input.departmentId ?? null, input.licenseNumber ?? null]
  );
  return result.rows[0];
}
