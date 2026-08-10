import { ChatAnthropic } from "@langchain/anthropic";
import { createReactAgent } from "@langchain/langgraph/prebuilt";
import { AIMessage } from "@langchain/core/messages";
import { createConciergeTools } from "./tools.js";

const MODEL = process.env.ANTHROPIC_MODEL || "claude-sonnet-5";

// Constructed lazily (not at module load) because ChatAnthropic throws
// immediately if no API key is set — routes only call this when a key is
// present, but the import itself must stay safe when it isn't.
function getLlm() {
  return new ChatAnthropic({
    model: MODEL,
    apiKey: process.env.ANTHROPIC_API_KEY,
    temperature: 0.3,
  });
}

const SYSTEM_PROMPT = `You are the front-desk booking concierge for a hospital's patient portal. You help
with general questions (hours, departments, cancellation policy) and with booking appointments.
Always use your tools rather than guessing: list_departments/list_services/list_practitioners to
find options, check_availability before proposing a specific time, and book_appointment only once
the patient has confirmed a specific doctor, service, and time slot. If book_appointment reports the
visitor isn't logged in with a patient profile, tell them to log in and complete their profile, then
try again. Keep replies to 2-4 concise, friendly sentences.`;

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

export async function runConciergeAgent(
  messages: ChatMessage[],
  patientId: string | undefined
): Promise<{ reply: string }> {
  const agent = createReactAgent({
    llm: getLlm(),
    tools: createConciergeTools(patientId),
    prompt: SYSTEM_PROMPT,
  });

  const result = await agent.invoke({
    messages: messages.map((m) => ({ role: m.role, content: m.content })),
  });

  const last = [...result.messages].reverse().find((m): m is AIMessage => m.getType() === "ai");
  return { reply: typeof last?.content === "string" ? last.content : "" };
}
