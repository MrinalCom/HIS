import { Router } from "express";
import { z } from "zod";
import { requireAuth, requireRole, requirePermission, requireMfaEnrolled, AuthedRequest } from "../../middleware/auth.js";
import { auditResource } from "../../middleware/audit.js";
import { ROLE_CAPABILITIES } from "../identity/permissions.js";
import { findPatientById } from "../patients/service.js";
import { findPractitionerByUserId } from "../directory/service.js";
import { findAppointmentById } from "../scheduling/service.js";
import { findUserById } from "../identity/service.js";
import { sendEmail } from "../notifications/service.js";
import {
  createEncounter,
  findEncounterById,
  findEncounterByAppointmentId,
  completeEncounter,
  addObservation,
  addCondition,
  addAllergy,
  addMedicationRequest,
  createClinicalNote,
  findNoteById,
  signClinicalNote,
  getPatientSummary,
} from "./service.js";

export const ehrRouter = Router();

const codeableConcept = z.object({
  system: z.string().min(1),
  code: z.string().min(1),
  display: z.string().min(1),
});

async function canAccessPatientChart(req: AuthedRequest, patientId: string): Promise<boolean> {
  if (ROLE_CAPABILITIES[req.user!.role].has("ehr:read:any")) return true;
  const patient = await findPatientById(patientId);
  return !!patient && patient.user_id === req.user!.id;
}

// Resolves the doctor's own practitioner row and 404s early if their profile
// isn't set up yet — every write route below needs this, so it's shared.
async function requireOwnPractitioner(req: AuthedRequest, res: import("express").Response) {
  const practitioner = await findPractitionerByUserId(req.user!.id);
  if (!practitioner) {
    res.status(400).json({ error: "Complete your practitioner profile first" });
    return undefined;
  }
  return practitioner;
}

const startEncounterSchema = z.object({
  appointmentId: z.string().uuid().optional(),
  patientId: z.string().uuid().optional(),
  chiefComplaint: z.string().optional(),
  encounterClass: z.enum(["ambulatory", "emergency", "inpatient", "virtual"]).optional(),
});

ehrRouter.post(
  "/encounters",
  requireAuth,
  requirePermission("ehr:write"),
  auditResource("encounter"),
  async (req: AuthedRequest, res) => {
    const parsed = startEncounterSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

    const practitioner = await requireOwnPractitioner(req, res);
    if (!practitioner) return;

    let patientId = parsed.data.patientId;
    if (parsed.data.appointmentId) {
      const appt = await findAppointmentById(parsed.data.appointmentId);
      if (!appt) return res.status(404).json({ error: "Appointment not found" });
      if (appt.practitioner_id !== practitioner.id) {
        return res.status(403).json({ error: "Not your appointment" });
      }
      const existing = await findEncounterByAppointmentId(appt.id);
      if (existing) return res.status(200).json({ encounter: existing });
      patientId = appt.patient_id;
    }
    if (!patientId) return res.status(400).json({ error: "patientId or appointmentId is required" });

    const encounter = await createEncounter({
      patientId,
      practitionerId: practitioner.id,
      appointmentId: parsed.data.appointmentId,
      chiefComplaint: parsed.data.chiefComplaint,
      encounterClass: parsed.data.encounterClass,
    });
    res.locals.auditResourceId = encounter.id;
    res.status(201).json({ encounter });
  }
);

ehrRouter.get("/encounters/:id", requireAuth, async (req: AuthedRequest, res) => {
  const encounter = await findEncounterById(req.params.id);
  if (!encounter) return res.status(404).json({ error: "Encounter not found" });
  if (!(await canAccessPatientChart(req, encounter.patient_id))) {
    return res.status(403).json({ error: "Insufficient permissions" });
  }
  res.json({ encounter });
});

ehrRouter.post(
  "/encounters/:id/complete",
  requireAuth,
  requirePermission("ehr:write"),
  auditResource("encounter"),
  async (req: AuthedRequest, res) => {
    const encounter = await findEncounterById(req.params.id);
    if (!encounter) return res.status(404).json({ error: "Encounter not found" });
    const practitioner = await requireOwnPractitioner(req, res);
    if (!practitioner) return;
    if (encounter.practitioner_id !== practitioner.id) {
      return res.status(403).json({ error: "Not your encounter" });
    }
    const updated = await completeEncounter(req.params.id);
    res.locals.auditResourceId = req.params.id;
    res.json({ encounter: updated });
  }
);

ehrRouter.get("/patients/:patientId/summary", requireAuth, async (req: AuthedRequest, res) => {
  if (!(await canAccessPatientChart(req, req.params.patientId))) {
    return res.status(403).json({ error: "Insufficient permissions" });
  }
  const onlySignedNotes = !ROLE_CAPABILITIES[req.user!.role].has("ehr:read:any");
  const summary = await getPatientSummary(req.params.patientId, onlySignedNotes);
  res.json({ summary });
});

const observationSchema = z.object({
  category: z.enum(["vital-signs", "laboratory", "exam"]).optional(),
  code: codeableConcept,
  valueText: z.string().optional(),
  valueNumeric: z.number().optional(),
  unit: z.string().optional(),
});

ehrRouter.post(
  "/encounters/:id/observations",
  requireAuth,
  requirePermission("ehr:write"),
  auditResource("observation"),
  async (req: AuthedRequest, res) => {
    const encounter = await findEncounterById(req.params.id);
    if (!encounter) return res.status(404).json({ error: "Encounter not found" });
    const parsed = observationSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

    const observation = await addObservation({
      encounterId: encounter.id,
      patientId: encounter.patient_id,
      ...parsed.data,
      recordedBy: req.user!.id,
    });
    res.locals.auditResourceId = observation.id;
    res.status(201).json({ observation });
  }
);

const conditionSchema = z.object({
  code: codeableConcept,
  clinicalStatus: z.enum(["active", "resolved", "inactive"]).optional(),
  onsetDate: z.string().optional(),
});

ehrRouter.post(
  "/encounters/:id/conditions",
  requireAuth,
  requirePermission("ehr:write"),
  auditResource("condition"),
  async (req: AuthedRequest, res) => {
    const encounter = await findEncounterById(req.params.id);
    if (!encounter) return res.status(404).json({ error: "Encounter not found" });
    const parsed = conditionSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

    const condition = await addCondition({
      patientId: encounter.patient_id,
      encounterId: encounter.id,
      ...parsed.data,
      recordedBy: req.user!.id,
    });
    res.locals.auditResourceId = condition.id;
    res.status(201).json({ condition });
  }
);

const allergySchema = z.object({
  substance: z.string().min(1),
  reaction: z.string().optional(),
  severity: z.string().optional(),
});

ehrRouter.post(
  "/patients/:patientId/allergies",
  requireAuth,
  requirePermission("ehr:write"),
  auditResource("allergy"),
  async (req: AuthedRequest, res) => {
    const parsed = allergySchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

    const allergy = await addAllergy({
      patientId: req.params.patientId,
      ...parsed.data,
      recordedBy: req.user!.id,
    });
    res.locals.auditResourceId = allergy.id;
    res.status(201).json({ allergy });
  }
);

const medicationSchema = z.object({
  medicationCode: codeableConcept,
  dosageText: z.string().min(1),
});

ehrRouter.post(
  "/encounters/:id/medications",
  requireAuth,
  requirePermission("ehr:write"),
  auditResource("medication_request"),
  async (req: AuthedRequest, res) => {
    const encounter = await findEncounterById(req.params.id);
    if (!encounter) return res.status(404).json({ error: "Encounter not found" });
    const parsed = medicationSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

    const medication = await addMedicationRequest({
      patientId: encounter.patient_id,
      encounterId: encounter.id,
      ...parsed.data,
      prescribedBy: req.user!.id,
    });
    res.locals.auditResourceId = medication.id;
    res.status(201).json({ medication });
  }
);

const noteSchema = z.object({
  noteType: z.enum(["progress", "discharge_summary"]).optional(),
  content: z.string().min(1),
});

ehrRouter.post(
  "/encounters/:id/notes",
  requireAuth,
  requirePermission("ehr:write"),
  auditResource("clinical_note"),
  async (req: AuthedRequest, res) => {
    const encounter = await findEncounterById(req.params.id);
    if (!encounter) return res.status(404).json({ error: "Encounter not found" });
    const parsed = noteSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

    const note = await createClinicalNote({
      encounterId: encounter.id,
      patientId: encounter.patient_id,
      ...parsed.data,
      authoredBy: req.user!.id,
    });
    res.locals.auditResourceId = note.id;
    res.status(201).json({ note });
  }
);

ehrRouter.post(
  "/notes/:id/sign",
  requireAuth,
  requirePermission("notes:sign"),
  requireMfaEnrolled,
  auditResource("clinical_note"),
  async (req: AuthedRequest, res) => {
    const note = await findNoteById(req.params.id);
    if (!note) return res.status(404).json({ error: "Note not found" });
    if (note.status === "signed") return res.status(409).json({ error: "Already signed" });

    const encounter = await findEncounterById(note.encounter_id);
    const practitioner = await requireOwnPractitioner(req, res);
    if (!practitioner) return;
    if (encounter?.practitioner_id !== practitioner.id) {
      return res.status(403).json({ error: "Only the treating doctor can sign this note" });
    }

    const signed = await signClinicalNote(req.params.id, req.user!.id);
    res.locals.auditResourceId = req.params.id;

    const patient = await findPatientById(note.patient_id);
    if (patient) {
      const patientUser = await findUserById(patient.user_id);
      if (patientUser) {
        void sendEmail(
          patientUser.email,
          "A new note is available on your health record",
          "Your doctor has signed a new visit note. Log in to your patient dashboard to view it."
        );
      }
    }

    res.json({ note: signed });
  }
);
