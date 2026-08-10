import { detectRedFlags } from "./redFlags.js";

export interface TriageResult {
  reply: string;
  redFlags: string[];
  recommendedAction: "self_care" | "book_appointment" | "urgent_care" | "emergency";
  degraded: boolean;
}

const URGENT_KEYWORDS = ["high fever", "persistent vomiting", "severe pain", "dehydrat", "won't eat", "lethargic"];
const MILD_KEYWORDS = ["mild", "runny nose", "sore throat", "minor", "small cut", "slight", "cough"];

// No-LLM keyword-bucket classifier, same output shape as the live agent so
// the frontend needs one rendering path. Red-flag detection runs first and
// always wins, exactly like the live path's independent safety net.
export function fallbackTriage(text: string): TriageResult {
  const redFlags = detectRedFlags(text);
  if (redFlags.length > 0) {
    return {
      reply:
        "Based on what you've described, this could be a medical emergency. Please call your local emergency number or go to the nearest emergency room right away.",
      redFlags,
      recommendedAction: "emergency",
      degraded: true,
    };
  }

  const lower = text.toLowerCase();
  if (URGENT_KEYWORDS.some((k) => lower.includes(k))) {
    return {
      reply:
        "These symptoms sound like they need attention soon. The smart assistant is temporarily unavailable, but we'd recommend an urgent care visit or same-day appointment rather than waiting.",
      redFlags: [],
      recommendedAction: "urgent_care",
      degraded: true,
    };
  }
  if (MILD_KEYWORDS.some((k) => lower.includes(k))) {
    return {
      reply:
        "That sounds like it may be manageable with rest, fluids, and over-the-counter care. The smart assistant is temporarily unavailable — if symptoms worsen or don't improve in a few days, please book an appointment.",
      redFlags: [],
      recommendedAction: "self_care",
      degraded: true,
    };
  }
  return {
    reply:
      "The smart assistant is temporarily unavailable. Based on limited keyword matching we can't confidently assess this — the safest next step is to book an appointment with a doctor.",
    redFlags: [],
    recommendedAction: "book_appointment",
    degraded: true,
  };
}
