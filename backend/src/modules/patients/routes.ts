import { Router } from "express";
import { z } from "zod";
import { requireAuth, requireRole, requirePermission, AuthedRequest } from "../../middleware/auth.js";
import { auditResource } from "../../middleware/audit.js";
import { ROLE_CAPABILITIES } from "../identity/permissions.js";
import {
  findPatientByUserId,
  findPatientById,
  createPatientProfile,
  searchPatients,
} from "./service.js";

export const patientsRouter = Router();

patientsRouter.get("/me", requireAuth, requireRole("patient"), async (req: AuthedRequest, res) => {
  const patient = await findPatientByUserId(req.user!.id);
  if (!patient) return res.status(404).json({ error: "Profile not created yet" });
  res.json({ patient });
});

const createProfileSchema = z.object({
  firstName: z.string().min(1),
  lastName: z.string().min(1),
  dob: z.string().min(1),
  gender: z.enum(["female", "male", "other", "unknown"]).optional().default("unknown"),
  bloodType: z
    .enum(["A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-", "unknown"])
    .optional()
    .default("unknown"),
  phone: z.string().optional(),
  address: z.record(z.string(), z.unknown()).optional(),
  emergencyContact: z.record(z.string(), z.unknown()).optional(),
});

patientsRouter.post(
  "/me",
  requireAuth,
  requireRole("patient"),
  auditResource("patient"),
  async (req: AuthedRequest, res) => {
    const existing = await findPatientByUserId(req.user!.id);
    if (existing) return res.status(409).json({ error: "Profile already exists" });

    const parsed = createProfileSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

    const patient = await createPatientProfile({ userId: req.user!.id, ...parsed.data });
    res.locals.auditResourceId = patient.id;
    res.status(201).json({ patient });
  }
);

patientsRouter.get(
  "/",
  requireAuth,
  requirePermission("patients:read:any"),
  async (req: AuthedRequest, res) => {
    const q = typeof req.query.q === "string" ? req.query.q : undefined;
    const patients = await searchPatients(q);
    res.json({ patients });
  }
);

patientsRouter.get("/:id", requireAuth, async (req: AuthedRequest, res) => {
  const patient = await findPatientById(req.params.id);
  if (!patient) return res.status(404).json({ error: "Patient not found" });

  const canReadAny = ROLE_CAPABILITIES[req.user!.role].has("patients:read:any");
  if (!canReadAny && patient.user_id !== req.user!.id) {
    return res.status(403).json({ error: "Insufficient permissions" });
  }
  res.json({ patient });
});
