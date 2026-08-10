import { pool } from "../../config/db.js";
import type { CodeableConcept } from "../ehr/service.js";

export interface LabOrder {
  id: string;
  patient_id: string;
  encounter_id: string | null;
  ordered_by: string;
  test_code: CodeableConcept;
  status: string;
  ordered_at: string;
}

export interface LabOrderWithPatient extends LabOrder {
  patient_first_name: string;
  patient_last_name: string;
  patient_mrn: string;
}

export async function createLabOrder(input: {
  patientId: string;
  encounterId?: string;
  orderedBy: string;
  testCode: CodeableConcept;
}): Promise<LabOrder> {
  const result = await pool.query<LabOrder>(
    `INSERT INTO lab_orders (patient_id, encounter_id, ordered_by, test_code)
     VALUES ($1, $2, $3, $4)
     RETURNING *`,
    [input.patientId, input.encounterId ?? null, input.orderedBy, JSON.stringify(input.testCode)]
  );
  return result.rows[0];
}

export async function listLabOrders(status?: string): Promise<LabOrderWithPatient[]> {
  const clause = status ? "WHERE lo.status = $1" : "";
  const params = status ? [status] : [];
  const result = await pool.query<LabOrderWithPatient>(
    `SELECT lo.*, p.first_name AS patient_first_name, p.last_name AS patient_last_name, p.mrn AS patient_mrn
     FROM lab_orders lo
     JOIN patients p ON p.id = lo.patient_id
     ${clause}
     ORDER BY lo.ordered_at ASC`,
    params
  );
  return result.rows;
}

export async function findLabOrderById(id: string): Promise<LabOrder | undefined> {
  const result = await pool.query<LabOrder>("SELECT * FROM lab_orders WHERE id = $1", [id]);
  return result.rows[0];
}

export async function updateLabOrderStatus(id: string, status: string): Promise<LabOrder | undefined> {
  const result = await pool.query<LabOrder>(
    "UPDATE lab_orders SET status = $1::lab_order_status WHERE id = $2 RETURNING *",
    [status, id]
  );
  return result.rows[0];
}

export interface DiagnosticReport {
  id: string;
  lab_order_id: string;
  patient_id: string;
  result_text: string | null;
  result_data: unknown;
  reported_by: string;
  reported_at: string;
}

export async function submitDiagnosticReport(input: {
  labOrderId: string;
  patientId: string;
  resultText?: string;
  resultData?: unknown;
  reportedBy: string;
}): Promise<DiagnosticReport> {
  const result = await pool.query<DiagnosticReport>(
    `INSERT INTO diagnostic_reports (lab_order_id, patient_id, result_text, result_data, reported_by)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING *`,
    [
      input.labOrderId,
      input.patientId,
      input.resultText ?? null,
      input.resultData ? JSON.stringify(input.resultData) : null,
      input.reportedBy,
    ]
  );
  await updateLabOrderStatus(input.labOrderId, "resulted");
  return result.rows[0];
}

export async function listDiagnosticReportsForPatient(patientId: string): Promise<DiagnosticReport[]> {
  const result = await pool.query<DiagnosticReport>(
    "SELECT * FROM diagnostic_reports WHERE patient_id = $1 ORDER BY reported_at DESC",
    [patientId]
  );
  return result.rows;
}
