import { NoShowFeatures } from "../../scheduling/service.js";

export interface NoShowResult {
  probability: number;
  modelVersion: string;
  degraded: boolean;
}

// Weighted-rule heuristic used when ml-service is unreachable — same
// directional logic as the model's training labels (more lead time, early
// slots, weekends, and a history of no-shows all raise risk; telemedicine
// lowers it), just hand-tuned instead of fit. Same {probability,
// modelVersion, degraded} shape as the live prediction.
export function fallbackNoShowPrediction(features: NoShowFeatures): NoShowResult {
  let score = 0.15;
  score += Math.min(features.leadTimeHours / 24, 5) * 0.03;
  if (features.hourOfDay === 9) score += 0.05;
  if (features.dayOfWeek === 0 || features.dayOfWeek === 6) score += 0.08;
  score += features.priorNoshowRate * 0.5;
  if (features.isTelemedicine) score -= 0.1;

  const probability = Math.min(0.95, Math.max(0.02, score));
  return { probability, modelVersion: "heuristic-fallback-v1", degraded: true };
}
