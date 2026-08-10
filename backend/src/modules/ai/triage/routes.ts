import { Router } from "express";
import { z } from "zod";
import { optionalAuth, AuthedRequest } from "../../../middleware/auth.js";
import { findPatientByUserId } from "../../patients/service.js";
import { runTriageAgent } from "./agent.js";
import { fallbackTriage } from "./fallback.service.js";
import { recordTriageSession } from "./service.js";

export const triageRouter = Router();

const DISCLAIMER =
  "This tool provides general guidance only and is not a medical diagnosis. If this is a medical emergency, call your local emergency number immediately.";

const chatSchema = z.object({
  messages: z
    .array(z.object({ role: z.enum(["user", "assistant"]), content: z.string().min(1) }))
    .min(1),
});

// Public: works for anonymous visitors (a symptom checker before login is a
// normal hospital-website feature) and for logged-in patients, in which case
// the session is linked to their patient record.
triageRouter.post("/chat", optionalAuth, async (req: AuthedRequest, res) => {
  const parsed = chatSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  let patientId: string | undefined;
  if (req.user?.role === "patient") {
    const patient = await findPatientByUserId(req.user.id);
    patientId = patient?.id;
  }

  const fullText = parsed.data.messages.map((m) => m.content).join(" ");
  let result;
  if (process.env.ANTHROPIC_API_KEY) {
    try {
      result = await runTriageAgent(parsed.data.messages);
    } catch {
      result = fallbackTriage(fullText);
    }
  } else {
    result = fallbackTriage(fullText);
  }

  const session = await recordTriageSession({
    patientId,
    messages: parsed.data.messages,
    redFlags: result.redFlags,
    recommendedAction: result.recommendedAction,
    degraded: result.degraded,
  });

  res.json({ ...result, disclaimer: DISCLAIMER, sessionId: session.id });
});
