import { Router } from "express";
import { z } from "zod";
import { optionalAuth, AuthedRequest } from "../../../middleware/auth.js";
import { findPatientByUserId } from "../../patients/service.js";
import { runConciergeAgent } from "./agent.js";
import { answerWithFallback } from "./fallback.service.js";
import { logConciergeExchange } from "./service.js";

export const conciergeRouter = Router();

const chatSchema = z.object({
  messages: z
    .array(z.object({ role: z.enum(["user", "assistant"]), content: z.string().min(1) }))
    .min(1),
});

conciergeRouter.post("/chat", optionalAuth, async (req: AuthedRequest, res) => {
  const parsed = chatSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  let patientId: string | undefined;
  if (req.user?.role === "patient") {
    const patient = await findPatientByUserId(req.user.id);
    patientId = patient?.id;
  }

  const lastMessage = parsed.data.messages[parsed.data.messages.length - 1]?.content ?? "";
  let result: { reply: string; degraded: boolean };
  if (process.env.ANTHROPIC_API_KEY) {
    try {
      const agentResult = await runConciergeAgent(parsed.data.messages, patientId);
      result = { ...agentResult, degraded: false };
    } catch {
      result = answerWithFallback(lastMessage);
    }
  } else {
    result = answerWithFallback(lastMessage);
  }

  await logConciergeExchange({ patientId, message: lastMessage, reply: result.reply, degraded: result.degraded });
  res.json(result);
});
