import { Router } from "express";
import { z } from "zod";
import { requireAuth, requirePermission, AuthedRequest } from "../../middleware/auth.js";
import { auditResource } from "../../middleware/audit.js";
import { ROLE_CAPABILITIES } from "../identity/permissions.js";
import { findPatientById } from "../patients/service.js";
import {
  createLabOrder,
  listLabOrders,
  findLabOrderById,
  updateLabOrderStatus,
  submitDiagnosticReport,
  listDiagnosticReportsForPatient,
} from "./service.js";

export const labRouter = Router();

const codeableConcept = z.object({
  system: z.string().min(1),
  code: z.string().min(1),
  display: z.string().min(1),
});

const orderSchema = z.object({
  patientId: z.string().uuid(),
  encounterId: z.string().uuid().optional(),
  testCode: codeableConcept,
});

labRouter.post(
  "/orders",
  requireAuth,
  requirePermission("lab:order"),
  auditResource("lab_order"),
  async (req: AuthedRequest, res) => {
    const parsed = orderSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
    const order = await createLabOrder({ ...parsed.data, orderedBy: req.user!.id });
    res.locals.auditResourceId = order.id;
    res.status(201).json({ order });
  }
);

labRouter.get("/orders", requireAuth, requirePermission("lab:manage"), async (req: AuthedRequest, res) => {
  const status = typeof req.query.status === "string" ? req.query.status : undefined;
  res.json({ orders: await listLabOrders(status) });
});

const statusSchema = z.object({ status: z.enum(["sample_collected", "in_progress", "cancelled"]) });

labRouter.patch(
  "/orders/:id/status",
  requireAuth,
  requirePermission("lab:manage"),
  auditResource("lab_order"),
  async (req: AuthedRequest, res) => {
    const parsed = statusSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
    const order = await findLabOrderById(req.params.id);
    if (!order) return res.status(404).json({ error: "Lab order not found" });
    const updated = await updateLabOrderStatus(req.params.id, parsed.data.status);
    res.locals.auditResourceId = req.params.id;
    res.json({ order: updated });
  }
);

const reportSchema = z.object({
  resultText: z.string().optional(),
  resultData: z.record(z.string(), z.unknown()).optional(),
});

labRouter.post(
  "/orders/:id/report",
  requireAuth,
  requirePermission("lab:manage"),
  auditResource("diagnostic_report"),
  async (req: AuthedRequest, res) => {
    const order = await findLabOrderById(req.params.id);
    if (!order) return res.status(404).json({ error: "Lab order not found" });
    const parsed = reportSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

    const report = await submitDiagnosticReport({
      labOrderId: order.id,
      patientId: order.patient_id,
      ...parsed.data,
      reportedBy: req.user!.id,
    });
    res.locals.auditResourceId = report.id;
    res.status(201).json({ report });
  }
);

labRouter.get("/patients/:patientId/results", requireAuth, async (req: AuthedRequest, res) => {
  const canReadAny =
    ROLE_CAPABILITIES[req.user!.role].has("ehr:read:any") || ROLE_CAPABILITIES[req.user!.role].has("lab:manage");
  if (!canReadAny) {
    const patient = await findPatientById(req.params.patientId);
    if (!patient || patient.user_id !== req.user!.id) {
      return res.status(403).json({ error: "Insufficient permissions" });
    }
  }
  res.json({ results: await listDiagnosticReportsForPatient(req.params.patientId) });
});
