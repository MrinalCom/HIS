import { matchFaq } from "./faq.js";

export interface FallbackReply {
  reply: string;
  degraded: true;
}

const NO_MATCH_REPLY =
  "The smart assistant is temporarily unavailable and I couldn't find a direct answer to that. " +
  "You can browse departments and book directly from your dashboard's booking form.";

// No-LLM fallback: FAQ match only, same {reply, degraded:true} shape as
// RestroHub's fallbackConcierge.service.ts contract. Deliberately doesn't
// attempt deterministic booking — the booking form covers that path already.
export function answerWithFallback(message: string): FallbackReply {
  const faqAnswer = matchFaq(message);
  if (faqAnswer) {
    return { reply: faqAnswer, degraded: true };
  }
  return { reply: NO_MATCH_REPLY, degraded: true };
}
