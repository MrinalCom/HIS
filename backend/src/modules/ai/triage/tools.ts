import { tool } from "@langchain/core/tools";
import { z } from "zod";
import { detectRedFlags } from "./redFlags.js";
import { TriageResult } from "./fallback.service.js";

export type TriageAssessment = Omit<TriageResult, "reply" | "degraded"> & { reasoning: string };

// Tools are built per-request so finalize_triage_assessment can write into a
// closure the caller controls, mirroring RestroHub's per-request tool
// factory pattern (createConciergeTools closing over customerId).
export function createTriageTools(capture: { assessment?: TriageAssessment }) {
  const checkRedFlags = tool(
    async ({ symptoms }: { symptoms: string }) => {
      return JSON.stringify({ flags: detectRedFlags(symptoms) });
    },
    {
      name: "check_red_flags",
      description:
        "Deterministically checks a description of symptoms against a curated list of emergency red-flag phrases (chest pain, difficulty breathing, stroke signs, etc). Call this whenever the patient describes anything that could be serious.",
      schema: z.object({ symptoms: z.string().min(1) }),
    }
  );

  const finalize = tool(
    async (input: TriageAssessment) => {
      capture.assessment = input;
      return JSON.stringify({ recorded: true });
    },
    {
      name: "finalize_triage_assessment",
      description:
        "Call this exactly once, as your final action, to record your structured read on the conversation so far.",
      schema: z.object({
        redFlags: z.array(z.string()).describe("Any red-flag phrases identified, empty array if none"),
        recommendedAction: z
          .enum(["self_care", "book_appointment", "urgent_care", "emergency"])
          .describe("The single most appropriate next step for the patient"),
        reasoning: z.string().describe("One or two sentences explaining the recommendation"),
      }),
    }
  );

  return [checkRedFlags, finalize];
}
