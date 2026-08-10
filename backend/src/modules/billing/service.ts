import { pool } from "../../config/db.js";

export interface Invoice {
  id: string;
  patient_id: string;
  encounter_id: string | null;
  status: string;
  total_amount: string;
  created_by: string;
  created_at: string;
}

export interface InvoiceLineItem {
  id: string;
  invoice_id: string;
  description: string;
  code: string | null;
  amount: string;
}

export async function createInvoice(input: {
  patientId: string;
  encounterId?: string;
  lineItems: { description: string; code?: string; amount: number }[];
  createdBy: string;
}): Promise<Invoice> {
  const total = input.lineItems.reduce((sum, li) => sum + li.amount, 0);
  const result = await pool.query<Invoice>(
    `INSERT INTO invoices (patient_id, encounter_id, total_amount, created_by)
     VALUES ($1, $2, $3, $4)
     RETURNING *`,
    [input.patientId, input.encounterId ?? null, total, input.createdBy]
  );
  const invoice = result.rows[0];

  for (const li of input.lineItems) {
    await pool.query(
      "INSERT INTO invoice_line_items (invoice_id, description, code, amount) VALUES ($1, $2, $3, $4)",
      [invoice.id, li.description, li.code ?? null, li.amount]
    );
  }
  return invoice;
}

export async function listInvoices(filters: { status?: string; patientId?: string }): Promise<Invoice[]> {
  const clauses: string[] = [];
  const params: unknown[] = [];
  if (filters.status) {
    params.push(filters.status);
    clauses.push(`status = $${params.length}`);
  }
  if (filters.patientId) {
    params.push(filters.patientId);
    clauses.push(`patient_id = $${params.length}`);
  }
  const where = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";
  const result = await pool.query<Invoice>(`SELECT * FROM invoices ${where} ORDER BY created_at DESC`, params);
  return result.rows;
}

export async function findInvoiceById(id: string): Promise<Invoice | undefined> {
  const result = await pool.query<Invoice>("SELECT * FROM invoices WHERE id = $1", [id]);
  return result.rows[0];
}

export async function listLineItemsForInvoice(invoiceId: string): Promise<InvoiceLineItem[]> {
  const result = await pool.query<InvoiceLineItem>(
    "SELECT * FROM invoice_line_items WHERE invoice_id = $1 ORDER BY created_at",
    [invoiceId]
  );
  return result.rows;
}

export interface Payment {
  id: string;
  invoice_id: string;
  amount: string;
  method: string;
  paid_at: string;
}

export async function recordPayment(input: {
  invoiceId: string;
  amount: number;
  method: string;
}): Promise<Payment> {
  const result = await pool.query<Payment>(
    "INSERT INTO payments (invoice_id, amount, method) VALUES ($1, $2, $3) RETURNING *",
    [input.invoiceId, input.amount, input.method]
  );

  const totals = await pool.query<{ total_amount: string; paid: string }>(
    `SELECT i.total_amount, COALESCE(SUM(p.amount), 0) AS paid
     FROM invoices i LEFT JOIN payments p ON p.invoice_id = i.id
     WHERE i.id = $1 GROUP BY i.total_amount`,
    [input.invoiceId]
  );
  const row = totals.rows[0];
  if (row && Number(row.paid) >= Number(row.total_amount)) {
    await pool.query("UPDATE invoices SET status = 'paid' WHERE id = $1", [input.invoiceId]);
  }

  return result.rows[0];
}

export async function listPaymentsForInvoice(invoiceId: string): Promise<Payment[]> {
  const result = await pool.query<Payment>("SELECT * FROM payments WHERE invoice_id = $1 ORDER BY paid_at", [
    invoiceId,
  ]);
  return result.rows;
}

export interface InsurancePolicy {
  id: string;
  patient_id: string;
  payer_name: string;
  policy_number: string;
}

export async function addInsurancePolicy(input: {
  patientId: string;
  payerName: string;
  policyNumber: string;
}): Promise<InsurancePolicy> {
  const result = await pool.query<InsurancePolicy>(
    "INSERT INTO insurance_policies (patient_id, payer_name, policy_number) VALUES ($1, $2, $3) RETURNING *",
    [input.patientId, input.payerName, input.policyNumber]
  );
  return result.rows[0];
}

export async function listInsurancePoliciesForPatient(patientId: string): Promise<InsurancePolicy[]> {
  const result = await pool.query<InsurancePolicy>(
    "SELECT * FROM insurance_policies WHERE patient_id = $1 ORDER BY created_at DESC",
    [patientId]
  );
  return result.rows;
}

export interface Claim {
  id: string;
  invoice_id: string;
  insurance_policy_id: string;
  status: string;
  payer_response: unknown;
  submitted_at: string;
}

// Real clearinghouse/payer integration is out of scope for this portfolio
// project (see docs/compliance-checklist.md's scope-trim list) — submitting
// a claim immediately returns a mocked full-amount approval so the billing
// workflow still demos end to end.
export async function submitClaim(input: { invoiceId: string; insurancePolicyId: string }): Promise<Claim> {
  const invoice = await findInvoiceById(input.invoiceId);
  const payerResponse = { approved: true, approvedAmount: invoice?.total_amount ?? "0", note: "Mock payer auto-approval" };
  const result = await pool.query<Claim>(
    `INSERT INTO claims (invoice_id, insurance_policy_id, status, payer_response)
     VALUES ($1, $2, 'approved', $3)
     RETURNING *`,
    [input.invoiceId, input.insurancePolicyId, JSON.stringify(payerResponse)]
  );
  return result.rows[0];
}

export async function listClaimsForInvoice(invoiceId: string): Promise<Claim[]> {
  const result = await pool.query<Claim>("SELECT * FROM claims WHERE invoice_id = $1 ORDER BY submitted_at DESC", [
    invoiceId,
  ]);
  return result.rows;
}
