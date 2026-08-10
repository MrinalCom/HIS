// Deterministic keyword scan — the one part of the triage pipeline that must
// never depend solely on model judgment. Run independently of whatever the
// LLM (or its fallback) concludes, and always wins if it finds a match.
const RED_FLAG_KEYWORDS = [
  "chest pain",
  "crushing pain",
  "can't breathe",
  "cannot breathe",
  "difficulty breathing",
  "shortness of breath",
  "severe bleeding",
  "won't stop bleeding",
  "stroke",
  "face drooping",
  "slurred speech",
  "suicidal",
  "want to die",
  "kill myself",
  "unconscious",
  "unresponsive",
  "seizure",
  "anaphylaxis",
  "severe allergic reaction",
  "throat closing",
  "coughing up blood",
  "sudden severe headache",
  "overdose",
];

export function detectRedFlags(text: string): string[] {
  const lower = text.toLowerCase();
  return RED_FLAG_KEYWORDS.filter((keyword) => lower.includes(keyword));
}
