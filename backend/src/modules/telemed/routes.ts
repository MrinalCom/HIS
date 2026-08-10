import { Router } from "express";
import { requireAuth, AuthedRequest } from "../../middleware/auth.js";
import { findAppointmentById } from "../scheduling/service.js";
import { findPatientByUserId } from "../patients/service.js";
import { findPractitionerByUserId } from "../directory/service.js";
import { listConsentsForPatient } from "../consent/service.js";
import { createOrGetSession } from "./service.js";

export const telemedRouter = Router();

async function isParticipant(req: AuthedRequest, appointmentId: string): Promise<boolean> {
  const appt = await findAppointmentById(appointmentId);
  if (!appt) return false;
  if (req.user!.role === "patient") {
    const patient = await findPatientByUserId(req.user!.id);
    return !!patient && patient.id === appt.patient_id;
  }
  if (req.user!.role === "doctor") {
    const practitioner = await findPractitionerByUserId(req.user!.id);
    return !!practitioner && practitioner.id === appt.practitioner_id;
  }
  return ["receptionist", "admin"].includes(req.user!.role);
}

// Only the patient/doctor on this specific appointment (or staff) can create
// or join the room — the room_token itself is never guessable from outside.
telemedRouter.post("/appointments/:id/session", requireAuth, async (req: AuthedRequest, res) => {
  const appt = await findAppointmentById(req.params.id);
  if (!appt) return res.status(404).json({ error: "Appointment not found" });
  if (appt.appointment_type !== "telemedicine") {
    return res.status(400).json({ error: "Not a telemedicine appointment" });
  }
  if (!(await isParticipant(req, req.params.id))) {
    return res.status(403).json({ error: "Insufficient permissions" });
  }

  // Consent gate: a telemedicine session can't start until the patient has
  // an active 'telemedicine' consent on file (docs/compliance-checklist.md).
  const consents = await listConsentsForPatient(appt.patient_id);
  const hasTelemedConsent = consents.some((c) => c.consent_type === "telemedicine" && !c.revoked_at);
  if (!hasTelemedConsent) {
    return res.status(403).json({
      error: "The patient must grant telemedicine consent before this session can start.",
    });
  }

  const session = await createOrGetSession(req.params.id);
  res.status(201).json({ session });
});
