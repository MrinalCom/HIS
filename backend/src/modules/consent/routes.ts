import { Router } from "express";
import { z } from "zod";
import { requireAuth, requireRole, AuthedRequest } from "../../middleware/auth.js";
import { auditResource } from "../../middleware/audit.js";
import { findPatientByUserId } from "../patients/service.js";
import { grantConsent, listConsentsForPatient, revokeConsent } from "./service.js";

export const consentRouter = Router();

consentRouter.get("/me", requireAuth, requireRole("patient"), async (req: AuthedRequest, res) => {
  const patient = await findPatientByUserId(req.user!.id);
  if (!patient) return res.json({ consents: [] });
  res.json({ consents: await listConsentsForPatient(patient.id) });
});

const grantSchema = z.object({
  consentType: z.enum(["treatment", "data_processing", "telemedicine"]),
});

consentRouter.post(
  "/me",
  requireAuth,
  requireRole("patient"),
  auditResource("consent"),
  async (req: AuthedRequest, res) => {
    const patient = await findPatientByUserId(req.user!.id);
    if (!patient) return res.status(400).json({ error: "Complete your patient profile first" });
    const parsed = grantSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

    const consent = await grantConsent(patient.id, parsed.data.consentType);
    res.locals.auditResourceId = consent.id;
    res.status(201).json({ consent });
  }
);

consentRouter.post(
  "/me/:id/revoke",
  requireAuth,
  requireRole("patient"),
  auditResource("consent"),
  async (req: AuthedRequest, res) => {
    const patient = await findPatientByUserId(req.user!.id);
    if (!patient) return res.status(400).json({ error: "Complete your patient profile first" });

    const consent = await revokeConsent(req.params.id, patient.id);
    if (!consent) return res.status(404).json({ error: "Consent not found or already revoked" });
    res.locals.auditResourceId = consent.id;
    res.json({ consent });
  }
);
