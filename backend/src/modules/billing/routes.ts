import { Router } from "express";
import { z } from "zod";
import { requireAuth, requireRole, requirePermission, requireMfaEnrolled, AuthedRequest } from "../../middleware/auth.js";
import { auditResource } from "../../middleware/audit.js";
import { findPatientByUserId, findPatientById } from "../patients/service.js";
import {
  createInvoice,
  listInvoices,
  findInvoiceById,
  listLineItemsForInvoice,
  recordPayment,
  listPaymentsForInvoice,
  addInsurancePolicy,
  listInsurancePoliciesForPatient,
  submitClaim,
  listClaimsForInvoice,
} from "./service.js";

export const billingRouter = Router();

async function canAccessInvoice(req: AuthedRequest, patientId: string): Promise<boolean> {
  if (req.user!.role === "billing_clerk" || req.user!.role === "admin") return true;
  const patient = await findPatientById(patientId);
  return !!patient && patient.user_id === req.user!.id;
}

const invoiceSchema = z.object({
  patientId: z.string().uuid(),
  encounterId: z.string().uuid().optional(),
  lineItems: z
    .array(z.object({ description: z.string().min(1), code: z.string().optional(), amount: z.number().positive() }))
    .min(1),
});

billingRouter.post(
  "/invoices",
  requireAuth,
  requirePermission("billing:manage"),
  auditResource("invoice"),
  async (req: AuthedRequest, res) => {
    const parsed = invoiceSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
    const invoice = await createInvoice({ ...parsed.data, createdBy: req.user!.id });
    res.locals.auditResourceId = invoice.id;
    res.status(201).json({ invoice });
  }
);

billingRouter.get("/invoices", requireAuth, requirePermission("billing:manage"), async (req: AuthedRequest, res) => {
  const status = typeof req.query.status === "string" ? req.query.status : undefined;
  res.json({ invoices: await listInvoices({ status }) });
});

billingRouter.get("/invoices/mine", requireAuth, requireRole("patient"), async (req: AuthedRequest, res) => {
  const patient = await findPatientByUserId(req.user!.id);
  if (!patient) return res.json({ invoices: [] });
  res.json({ invoices: await listInvoices({ patientId: patient.id }) });
});

billingRouter.get("/invoices/:id", requireAuth, async (req: AuthedRequest, res) => {
  const invoice = await findInvoiceById(req.params.id);
  if (!invoice) return res.status(404).json({ error: "Invoice not found" });
  if (!(await canAccessInvoice(req, invoice.patient_id))) {
    return res.status(403).json({ error: "Insufficient permissions" });
  }
  const [lineItems, payments, claims] = await Promise.all([
    listLineItemsForInvoice(invoice.id),
    listPaymentsForInvoice(invoice.id),
    listClaimsForInvoice(invoice.id),
  ]);
  res.json({ invoice, lineItems, payments, claims });
});

const paymentSchema = z.object({
  amount: z.number().positive(),
  method: z.enum(["cash", "card", "insurance"]).optional(),
});

billingRouter.post(
  "/invoices/:id/payments",
  requireAuth,
  requirePermission("billing:manage"),
  requireMfaEnrolled,
  auditResource("payment"),
  async (req: AuthedRequest, res) => {
    const invoice = await findInvoiceById(req.params.id);
    if (!invoice) return res.status(404).json({ error: "Invoice not found" });
    const parsed = paymentSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

    const payment = await recordPayment({
      invoiceId: invoice.id,
      amount: parsed.data.amount,
      method: parsed.data.method ?? "cash",
    });
    res.locals.auditResourceId = payment.id;
    res.status(201).json({ payment });
  }
);

const insuranceSchema = z.object({ payerName: z.string().min(1), policyNumber: z.string().min(1) });

billingRouter.get("/patients/:patientId/insurance", requireAuth, async (req: AuthedRequest, res) => {
  if (!(await canAccessInvoice(req, req.params.patientId))) {
    return res.status(403).json({ error: "Insufficient permissions" });
  }
  res.json({ policies: await listInsurancePoliciesForPatient(req.params.patientId) });
});

billingRouter.post("/patients/:patientId/insurance", requireAuth, async (req: AuthedRequest, res) => {
  if (!(await canAccessInvoice(req, req.params.patientId))) {
    return res.status(403).json({ error: "Insufficient permissions" });
  }
  const parsed = insuranceSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const policy = await addInsurancePolicy({ patientId: req.params.patientId, ...parsed.data });
  res.status(201).json({ policy });
});

const claimSchema = z.object({ insurancePolicyId: z.string().uuid() });

billingRouter.post(
  "/invoices/:id/claims",
  requireAuth,
  requirePermission("billing:manage"),
  requireMfaEnrolled,
  auditResource("claim"),
  async (req: AuthedRequest, res) => {
    const invoice = await findInvoiceById(req.params.id);
    if (!invoice) return res.status(404).json({ error: "Invoice not found" });
    const parsed = claimSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

    const claim = await submitClaim({ invoiceId: invoice.id, insurancePolicyId: parsed.data.insurancePolicyId });
    res.locals.auditResourceId = claim.id;
    res.status(201).json({ claim });
  }
);
