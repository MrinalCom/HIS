import { Router } from "express";
import { requireAuth, requirePermission, AuthedRequest } from "../../../middleware/auth.js";
import { auditResource } from "../../../middleware/audit.js";
import {
  findEncounterById,
  listObservationsForEncounter,
  listConditionsForEncounter,
  listMedicationsForEncounter,
  createClinicalNote,
} from "../../ehr/service.js";
import { draftClinicalNote, EncounterContext, SoapNote } from "./claude.service.js";
import { fallbackDraftNote } from "./fallback.service.js";

export const docAssistantRouter = Router();

function formatSoapNote(soap: SoapNote): string {
  return `Subjective: ${soap.subjective}\n\nObjective: ${soap.objective}\n\nAssessment: ${soap.assessment}\n\nPlan: ${soap.plan}`;
}

docAssistantRouter.post(
  "/encounters/:id/draft-note",
  requireAuth,
  requirePermission("ehr:write"),
  auditResource("clinical_note"),
  async (req: AuthedRequest, res) => {
    const encounter = await findEncounterById(req.params.id);
    if (!encounter) return res.status(404).json({ error: "Encounter not found" });

    const [observations, conditions, medications] = await Promise.all([
      listObservationsForEncounter(encounter.id),
      listConditionsForEncounter(encounter.id),
      listMedicationsForEncounter(encounter.id),
    ]);

    const context: EncounterContext = {
      chiefComplaint: encounter.chief_complaint,
      observations: observations.map((o) => ({
        display: o.code.display,
        value: `${o.value_numeric ?? o.value_text ?? ""} ${o.unit ?? ""}`.trim(),
      })),
      conditions: conditions.map((c) => c.code.display),
      medications: medications.map((m) => ({ display: m.medication_code.display, dosage: m.dosage_text })),
    };

    let soap: SoapNote;
    let degraded = false;
    if (process.env.ANTHROPIC_API_KEY) {
      try {
        soap = await draftClinicalNote(context);
      } catch {
        soap = fallbackDraftNote(context);
        degraded = true;
      }
    } else {
      soap = fallbackDraftNote(context);
      degraded = true;
    }

    // Hard rule (see docs/compliance-checklist.md): AI-drafted notes are
    // never auto-signed. ai_generated=true + status defaults to 'draft', so
    // this note only appears in the patient's own view once a doctor signs it.
    const note = await createClinicalNote({
      encounterId: encounter.id,
      patientId: encounter.patient_id,
      noteType: "ai_draft",
      content: formatSoapNote(soap),
      aiGenerated: true,
      authoredBy: req.user!.id,
    });
    res.locals.auditResourceId = note.id;
    res.status(201).json({ note, degraded });
  }
);
