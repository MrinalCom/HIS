import { pool } from "../../config/db.js";
import { setMedicationRequestStatus } from "../ehr/service.js";

export interface Drug {
  id: string;
  name: string;
  form: string | null;
  strength: string | null;
}

export async function listDrugs(): Promise<Drug[]> {
  const result = await pool.query<Drug>("SELECT * FROM drugs ORDER BY name");
  return result.rows;
}

export async function addDrug(input: { name: string; form?: string; strength?: string }): Promise<Drug> {
  const result = await pool.query<Drug>(
    "INSERT INTO drugs (name, form, strength) VALUES ($1, $2, $3) RETURNING *",
    [input.name, input.form ?? null, input.strength ?? null]
  );
  return result.rows[0];
}

export interface InventoryBatch {
  id: string;
  drug_id: string;
  drug_name: string;
  batch_no: string;
  expiry_date: string;
  quantity: number;
  reorder_threshold: number;
}

export async function listInventory(): Promise<InventoryBatch[]> {
  const result = await pool.query<InventoryBatch>(
    `SELECT pi.*, d.name AS drug_name
     FROM pharmacy_inventory pi
     JOIN drugs d ON d.id = pi.drug_id
     ORDER BY d.name, pi.expiry_date`
  );
  return result.rows;
}

export async function addInventoryBatch(input: {
  drugId: string;
  batchNo: string;
  expiryDate: string;
  quantity: number;
  reorderThreshold?: number;
}): Promise<InventoryBatch> {
  const result = await pool.query(
    `INSERT INTO pharmacy_inventory (drug_id, batch_no, expiry_date, quantity, reorder_threshold)
     VALUES ($1, $2, $3, $4, COALESCE($5, 10))
     RETURNING *`,
    [input.drugId, input.batchNo, input.expiryDate, input.quantity, input.reorderThreshold ?? null]
  );
  return result.rows[0];
}

export interface Dispense {
  id: string;
  medication_request_id: string;
  drug_id: string;
  quantity: number;
  status: string;
  dispensed_by: string | null;
  dispensed_at: string | null;
  created_at: string;
}

// Picks the earliest-expiring batch with enough stock and atomically
// decrements it, then marks the source prescription completed via the ehr
// module's own service export (never touching medication_requests directly).
export async function dispenseMedication(input: {
  medicationRequestId: string;
  drugId: string;
  quantity: number;
  dispensedBy: string;
}): Promise<Dispense> {
  const batches = await pool.query<{ id: string; quantity: number }>(
    `SELECT id, quantity FROM pharmacy_inventory WHERE drug_id = $1 AND quantity >= $2 ORDER BY expiry_date ASC LIMIT 1`,
    [input.drugId, input.quantity]
  );
  const batch = batches.rows[0];
  if (!batch) throw new Error("Insufficient stock for this drug");

  await pool.query("UPDATE pharmacy_inventory SET quantity = quantity - $1 WHERE id = $2", [
    input.quantity,
    batch.id,
  ]);

  const result = await pool.query<Dispense>(
    `INSERT INTO dispenses (medication_request_id, drug_id, quantity, status, dispensed_by, dispensed_at)
     VALUES ($1, $2, $3, 'dispensed', $4, now())
     RETURNING *`,
    [input.medicationRequestId, input.drugId, input.quantity, input.dispensedBy]
  );

  await setMedicationRequestStatus(input.medicationRequestId, "completed");
  return result.rows[0];
}
