import { Router } from "express";
import { Server } from "socket.io";
import { z } from "zod";
import { requireAuth, requirePermission, requireMfaEnrolled, AuthedRequest } from "../../middleware/auth.js";
import { auditResource } from "../../middleware/audit.js";
import { listWards, listBeds, admitPatient, dischargeAdmission, setBedStatus } from "./service.js";

export const bedRouter = Router();

function broadcastBoard(req: AuthedRequest) {
  const io = req.app.get("io") as Server;
  io.to("beds:board").emit("beds:updated");
}

bedRouter.get("/wards", requireAuth, requirePermission("beds:manage"), async (_req, res) => {
  res.json({ wards: await listWards() });
});

bedRouter.get("/beds", requireAuth, requirePermission("beds:manage"), async (_req, res) => {
  res.json({ beds: await listBeds() });
});

const admitSchema = z.object({
  patientId: z.string().uuid(),
  bedId: z.string().uuid(),
  encounterId: z.string().uuid().optional(),
});

bedRouter.post(
  "/admissions",
  requireAuth,
  requirePermission("beds:manage"),
  requireMfaEnrolled,
  auditResource("admission"),
  async (req: AuthedRequest, res) => {
    const parsed = admitSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
    try {
      const admission = await admitPatient({ ...parsed.data, admittedBy: req.user!.id });
      res.locals.auditResourceId = admission.id;
      broadcastBoard(req);
      res.status(201).json({ admission });
    } catch (err) {
      res.status(409).json({ error: (err as Error).message });
    }
  }
);

bedRouter.post(
  "/admissions/:id/discharge",
  requireAuth,
  requirePermission("beds:manage"),
  requireMfaEnrolled,
  auditResource("admission"),
  async (req: AuthedRequest, res) => {
    const admission = await dischargeAdmission(req.params.id);
    if (!admission) return res.status(404).json({ error: "Active admission not found" });
    res.locals.auditResourceId = admission.id;
    broadcastBoard(req);
    res.json({ admission });
  }
);

const bedStatusSchema = z.object({ status: z.enum(["available", "cleaning", "maintenance"]) });

bedRouter.patch(
  "/beds/:id/status",
  requireAuth,
  requirePermission("beds:manage"),
  auditResource("bed"),
  async (req: AuthedRequest, res) => {
    const parsed = bedStatusSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
    await setBedStatus(req.params.id, parsed.data.status);
    res.locals.auditResourceId = req.params.id;
    broadcastBoard(req);
    res.json({ ok: true });
  }
);
