import { Router } from "express";
import { z } from "zod";
import { requireAuth, requirePermission, requireMfaEnrolled, AuthedRequest } from "../../middleware/auth.js";
import { auditResource } from "../../middleware/audit.js";
import { listVehicles, dispatchAmbulance, listActiveDispatches, findDispatchById, updateDispatchStatus } from "./service.js";

export const ambulanceRouter = Router();

ambulanceRouter.get("/vehicles", requireAuth, requirePermission("ambulance:manage"), async (_req, res) => {
  res.json({ vehicles: await listVehicles() });
});

ambulanceRouter.get("/dispatches", requireAuth, requirePermission("ambulance:manage"), async (_req, res) => {
  res.json({ dispatches: await listActiveDispatches() });
});

const dispatchSchema = z.object({
  vehicleId: z.string().uuid(),
  patientId: z.string().uuid().optional(),
  pickupLocation: z.string().min(1),
});

ambulanceRouter.post(
  "/dispatches",
  requireAuth,
  requirePermission("ambulance:manage"),
  requireMfaEnrolled,
  auditResource("ambulance_dispatch"),
  async (req: AuthedRequest, res) => {
    const parsed = dispatchSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
    try {
      const dispatch = await dispatchAmbulance({ ...parsed.data, requestedBy: req.user!.id });
      res.locals.auditResourceId = dispatch.id;
      res.status(201).json({ dispatch });
    } catch (err) {
      res.status(409).json({ error: (err as Error).message });
    }
  }
);

const statusSchema = z.object({ status: z.enum(["en_route", "arrived", "completed", "cancelled"]) });

ambulanceRouter.patch(
  "/dispatches/:id/status",
  requireAuth,
  requirePermission("ambulance:manage"),
  auditResource("ambulance_dispatch"),
  async (req: AuthedRequest, res) => {
    const existing = await findDispatchById(req.params.id);
    if (!existing) return res.status(404).json({ error: "Dispatch not found" });
    const parsed = statusSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
    const dispatch = await updateDispatchStatus(req.params.id, parsed.data.status);
    res.locals.auditResourceId = req.params.id;
    res.json({ dispatch });
  }
);
