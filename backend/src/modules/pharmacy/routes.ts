import { Router } from "express";
import { z } from "zod";
import { requireAuth, requirePermission, requireMfaEnrolled, AuthedRequest } from "../../middleware/auth.js";
import { auditResource } from "../../middleware/audit.js";
import { listActiveMedicationRequests } from "../ehr/service.js";
import { listDrugs, addDrug, listInventory, addInventoryBatch, dispenseMedication } from "./service.js";

export const pharmacyRouter = Router();

pharmacyRouter.get("/drugs", requireAuth, requirePermission("pharmacy:dispense"), async (_req, res) => {
  res.json({ drugs: await listDrugs() });
});

const drugSchema = z.object({ name: z.string().min(1), form: z.string().optional(), strength: z.string().optional() });

pharmacyRouter.post(
  "/drugs",
  requireAuth,
  requirePermission("pharmacy:manage"),
  auditResource("drug"),
  async (req: AuthedRequest, res) => {
    const parsed = drugSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
    const drug = await addDrug(parsed.data);
    res.locals.auditResourceId = drug.id;
    res.status(201).json({ drug });
  }
);

pharmacyRouter.get("/inventory", requireAuth, requirePermission("pharmacy:manage"), async (_req, res) => {
  res.json({ inventory: await listInventory() });
});

const batchSchema = z.object({
  drugId: z.string().uuid(),
  batchNo: z.string().min(1),
  expiryDate: z.string().min(1),
  quantity: z.number().int().positive(),
  reorderThreshold: z.number().int().positive().optional(),
});

pharmacyRouter.post(
  "/inventory",
  requireAuth,
  requirePermission("pharmacy:manage"),
  auditResource("pharmacy_inventory"),
  async (req: AuthedRequest, res) => {
    const parsed = batchSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
    const batch = await addInventoryBatch(parsed.data);
    res.locals.auditResourceId = batch.id;
    res.status(201).json({ batch });
  }
);

pharmacyRouter.get(
  "/prescriptions/pending",
  requireAuth,
  requirePermission("pharmacy:dispense"),
  async (_req, res) => {
    res.json({ prescriptions: await listActiveMedicationRequests() });
  }
);

const dispenseSchema = z.object({
  medicationRequestId: z.string().uuid(),
  drugId: z.string().uuid(),
  quantity: z.number().int().positive(),
});

pharmacyRouter.post(
  "/dispenses",
  requireAuth,
  requirePermission("pharmacy:dispense"),
  requireMfaEnrolled,
  auditResource("dispense"),
  async (req: AuthedRequest, res) => {
    const parsed = dispenseSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
    try {
      const dispense = await dispenseMedication({ ...parsed.data, dispensedBy: req.user!.id });
      res.locals.auditResourceId = dispense.id;
      res.status(201).json({ dispense });
    } catch (err) {
      res.status(409).json({ error: (err as Error).message });
    }
  }
);
