import { ChatAnthropic } from "@langchain/anthropic";
import { createReactAgent } from "@langchain/langgraph/prebuilt";
import { AIMessage } from "@langchain/core/messages";
import { createTriageTools, TriageAssessment } from "./tools.js";
import { detectRedFlags } from "./redFlags.js";
import { TriageResult } from "./fallback.service.js";

const MODEL = process.env.ANTHROPIC_MODEL || "claude-sonnet-5";

// Constructed lazily (not at module load) because ChatAnthropic throws
// immediately if no API key is set — routes only call this when a key is
// present, but the import itself must stay safe when it isn't.
function getLlm() {
  return new ChatAnthropic({
    model: MODEL,
    apiKey: process.env.ANTHROPIC_API_KEY,
    temperature: 0.2,
  });
}

const SYSTEM_PROMPT = `You are a symptom-checker assistant for a hospital's patient portal. You are NOT a
doctor and must never provide a diagnosis — only general guidance and a recommendation for the
right next step (self-care, book a routine appointment, seek urgent care, or seek emergency care).
Ask at most one or two clarifying questions before recommending a next step; don't drag the
conversation out. Whenever the patient describes anything that could be serious, call
check_red_flags to confirm. Always end your final turn by calling finalize_triage_assessment
exactly once with your structured read on the whole conversation so far. Keep your natural-language
reply to 2-4 short sentences, plain language, no medical jargon.`;

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

/**
 * Multi-turn ReAct agent for the conversational reply, layered with an
 * independent deterministic safety net: detectRedFlags() runs again here on
 * the full conversation text regardless of what the agent concluded, and if
 * it finds anything, the recommendation is forced to 'emergency' — so a
 * critical trigger never depends solely on the model noticing it.
 */
export async function runTriageAgent(messages: ChatMessage[]): Promise<TriageResult> {
  const capture: { assessment?: TriageAssessment } = {};
  const agent = createReactAgent({
    llm: getLlm(),
    tools: createTriageTools(capture),
    prompt: SYSTEM_PROMPT,
  });

  const result = await agent.invoke({
    messages: messages.map((m) => ({ role: m.role, content: m.content })),
  });

  const last = [...result.messages].reverse().find((m): m is AIMessage => m.getType() === "ai");
  const reply = typeof last?.content === "string" && last.content.length > 0
    ? last.content
    : capture.assessment?.reasoning ?? "Based on what you've shared, here's my recommendation.";

  const fullText = messages.map((m) => m.content).join(" ");
  const deterministicFlags = detectRedFlags(fullText);
  const modelFlags = capture.assessment?.redFlags ?? [];
  const redFlags = Array.from(new Set([...modelFlags, ...deterministicFlags]));
  const recommendedAction =
    deterministicFlags.length > 0 ? "emergency" : capture.assessment?.recommendedAction ?? "book_appointment";

  return { reply, redFlags, recommendedAction, degraded: false };
}
