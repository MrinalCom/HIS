import Anthropic from "@anthropic-ai/sdk";

const MODEL = process.env.ANTHROPIC_MODEL || "claude-sonnet-5";

export interface SoapNote {
  subjective: string;
  objective: string;
  assessment: string;
  plan: string;
}

const DRAFT_NOTE_TOOL = {
  name: "draft_clinical_note",
  description: "Draft a structured SOAP note from the encounter's chief complaint, vitals, diagnoses, and medications.",
  input_schema: {
    type: "object" as const,
    properties: {
      subjective: { type: "string", description: "Patient-reported chief complaint and history, in clinical prose" },
      objective: { type: "string", description: "Vitals/observations recorded during the encounter, in clinical prose" },
      assessment: { type: "string", description: "Diagnoses/clinical impression" },
      plan: { type: "string", description: "Treatment plan including medications prescribed" },
    },
    required: ["subjective", "objective", "assessment", "plan"],
  },
};

export interface EncounterContext {
  chiefComplaint: string | null;
  observations: { display: string; value: string }[];
  conditions: string[];
  medications: { display: string; dosage: string }[];
}

// Forced tool_choice keeps the output structured (mirrors RestroHub's
// claude.service.ts pattern) — this is a single-shot draft, not a
// conversation, so a ReAct agent would be overkill here.
export async function draftClinicalNote(context: EncounterContext): Promise<SoapNote> {
  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  const prompt = `Encounter details:
Chief complaint: ${context.chiefComplaint ?? "not recorded"}
Vitals/observations: ${context.observations.map((o) => `${o.display}: ${o.value}`).join(", ") || "none recorded"}
Diagnoses: ${context.conditions.join(", ") || "none recorded"}
Medications: ${context.medications.map((m) => `${m.display} (${m.dosage})`).join(", ") || "none recorded"}

Draft a SOAP note from this. Do not invent findings not implied by the data above.`;

  const response = await anthropic.messages.create({
    model: MODEL,
    max_tokens: 800,
    tools: [DRAFT_NOTE_TOOL],
    tool_choice: { type: "tool", name: "draft_clinical_note" },
    messages: [{ role: "user", content: prompt }],
  });

  const toolUse = response.content.find(
    (block): block is Anthropic.ToolUseBlock => block.type === "tool_use"
  );
  if (!toolUse) throw new Error("Claude did not return a structured SOAP note");
  return toolUse.input as SoapNote;
}
