import { pool } from "../../config/db.js";
import { env } from "../../config/env.js";

export interface StaffProfile {
  id: string;
  user_id: string;
  name: string;
  department_id: string | null;
  job_title: string;
  hourly_rate: string;
  has_bank_details: boolean;
}

export async function createStaffProfile(input: {
  userId: string;
  departmentId?: string;
  jobTitle: string;
  hourlyRate: number;
  bankDetails?: unknown;
}): Promise<{ id: string }> {
  const result = await pool.query<{ id: string }>(
    `INSERT INTO staff_profiles (user_id, department_id, job_title, hourly_rate, bank_details_enc)
     VALUES ($1, $2, $3, $4, CASE WHEN $5::text IS NULL THEN NULL ELSE pgp_sym_encrypt($5::text, $6) END)
     RETURNING id`,
    [
      input.userId,
      input.departmentId ?? null,
      input.jobTitle,
      input.hourlyRate,
      input.bankDetails ? JSON.stringify(input.bankDetails) : null,
      env.hrEncryptionKey,
    ]
  );
  return result.rows[0];
}

// Never returns decrypted bank details in a list view — data minimization.
// A dedicated endpoint would be needed to decrypt one record at a time, and
// none is exposed yet since no workflow in this portfolio project needs it.
export async function listStaffProfiles(): Promise<StaffProfile[]> {
  const result = await pool.query<StaffProfile>(
    `SELECT sp.id, sp.user_id, u.name, sp.department_id, sp.job_title, sp.hourly_rate,
            (sp.bank_details_enc IS NOT NULL) AS has_bank_details
     FROM staff_profiles sp
     JOIN users u ON u.id = sp.user_id
     ORDER BY u.name`
  );
  return result.rows;
}

export async function findStaffProfileById(id: string): Promise<{ id: string; hourly_rate: string } | undefined> {
  const result = await pool.query<{ id: string; hourly_rate: string }>(
    "SELECT id, hourly_rate FROM staff_profiles WHERE id = $1",
    [id]
  );
  return result.rows[0];
}

export interface EligibleUser {
  id: string;
  name: string;
  role: string;
}

// Staff accounts that don't have a staff_profile yet, for the "create staff
// profile" picker — avoids needing a separate user-directory endpoint.
export async function listEligibleStaffUsers(): Promise<EligibleUser[]> {
  const result = await pool.query<EligibleUser>(
    `SELECT u.id, u.name, u.role FROM users u
     WHERE u.role != 'patient'
       AND NOT EXISTS (SELECT 1 FROM staff_profiles sp WHERE sp.user_id = u.id)
     ORDER BY u.name`
  );
  return result.rows;
}

export interface Shift {
  id: string;
  staff_profile_id: string;
  starts_at: string;
  ends_at: string;
}

export async function addShift(input: { staffProfileId: string; startsAt: string; endsAt: string }): Promise<Shift> {
  const result = await pool.query<Shift>(
    "INSERT INTO shifts (staff_profile_id, starts_at, ends_at) VALUES ($1, $2, $3) RETURNING *",
    [input.staffProfileId, input.startsAt, input.endsAt]
  );
  return result.rows[0];
}

export async function listShiftsForStaff(staffProfileId: string): Promise<Shift[]> {
  const result = await pool.query<Shift>(
    "SELECT * FROM shifts WHERE staff_profile_id = $1 ORDER BY starts_at",
    [staffProfileId]
  );
  return result.rows;
}

export interface PayrollRun {
  id: string;
  period_start: string;
  period_end: string;
  created_at: string;
}

export interface Payslip {
  id: string;
  payroll_run_id: string;
  staff_profile_id: string;
  staff_name: string;
  hours_worked: string;
  gross_amount: string;
  net_amount: string;
}

// Illustrative payroll only (see scope-trim list): hours are summed from
// recorded shifts in the period, gross = hours * hourly_rate, net applies a
// flat mock 20% deduction. No real tax engine or bank transfer involved.
export async function runPayroll(input: { periodStart: string; periodEnd: string }): Promise<{
  run: PayrollRun;
  payslips: Payslip[];
}> {
  const runResult = await pool.query<PayrollRun>(
    "INSERT INTO payroll_runs (period_start, period_end) VALUES ($1, $2) RETURNING *",
    [input.periodStart, input.periodEnd]
  );
  const run = runResult.rows[0];

  const staffHours = await pool.query<{ staff_profile_id: string; hourly_rate: string; hours: string }>(
    `SELECT sp.id AS staff_profile_id, sp.hourly_rate,
            COALESCE(SUM(EXTRACT(EPOCH FROM (s.ends_at - s.starts_at)) / 3600), 0) AS hours
     FROM staff_profiles sp
     LEFT JOIN shifts s ON s.staff_profile_id = sp.id
       AND s.starts_at >= $1::date AND s.starts_at < ($2::date + interval '1 day')
     GROUP BY sp.id, sp.hourly_rate`,
    [input.periodStart, input.periodEnd]
  );

  const payslips: Payslip[] = [];
  for (const row of staffHours.rows) {
    const hours = Number(row.hours);
    if (hours <= 0) continue;
    const gross = hours * Number(row.hourly_rate);
    const net = gross * 0.8;
    const result = await pool.query<Payslip>(
      `INSERT INTO payslips (payroll_run_id, staff_profile_id, hours_worked, gross_amount, net_amount)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id, payroll_run_id, staff_profile_id, hours_worked, gross_amount, net_amount, '' AS staff_name`,
      [run.id, row.staff_profile_id, hours, gross, net]
    );
    payslips.push(result.rows[0]);
  }

  return { run, payslips };
}

export async function listPayrollRuns(): Promise<PayrollRun[]> {
  const result = await pool.query<PayrollRun>("SELECT * FROM payroll_runs ORDER BY created_at DESC");
  return result.rows;
}

export async function listPayslipsForRun(payrollRunId: string): Promise<Payslip[]> {
  const result = await pool.query<Payslip>(
    `SELECT ps.*, u.name AS staff_name
     FROM payslips ps
     JOIN staff_profiles sp ON sp.id = ps.staff_profile_id
     JOIN users u ON u.id = sp.user_id
     WHERE ps.payroll_run_id = $1
     ORDER BY u.name`,
    [payrollRunId]
  );
  return result.rows;
}
