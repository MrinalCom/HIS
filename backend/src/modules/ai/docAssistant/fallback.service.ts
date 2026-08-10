import { EncounterContext, SoapNote } from "./claude.service.js";

// Deterministic SOAP-template filler — same shape as the live Claude draft,
// just concatenated from the structured data instead of written by a model.
export function fallbackDraftNote(context: EncounterContext): SoapNote {
  return {
    subjective: context.chiefComplaint
      ? `Patient reports: ${context.chiefComplaint}.`
      : "No chief complaint recorded.",
    objective:
      context.observations.length > 0
        ? context.observations.map((o) => `${o.display}: ${o.value}`).join("; ") + "."
        : "No vitals or observations recorded for this encounter.",
    assessment:
      context.conditions.length > 0 ? context.conditions.join(", ") + "." : "No diagnoses recorded.",
    plan:
      context.medications.length > 0
        ? "Continue: " + context.medications.map((m) => `${m.display} (${m.dosage})`).join(", ") + "."
        : "No medications prescribed during this encounter.",
  };
}
