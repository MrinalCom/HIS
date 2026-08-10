import { NoShowFeatures } from "../../scheduling/service.js";

const ML_SERVICE_URL = process.env.ML_SERVICE_URL || "http://ml-service:8000";

export interface MlPrediction {
  probability: number;
  modelVersion: string;
}

// Short timeout: this call sits on the receptionist/admin scheduling view's
// critical path, and ml-service being down should fall through to the
// heuristic quickly rather than hang the request.
export async function callMlService(features: NoShowFeatures): Promise<MlPrediction> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 2000);
  try {
    const res = await fetch(`${ML_SERVICE_URL}/predict`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        lead_time_hours: features.leadTimeHours,
        hour_of_day: features.hourOfDay,
        day_of_week: features.dayOfWeek,
        prior_noshow_rate: features.priorNoshowRate,
        is_telemedicine: features.isTelemedicine,
      }),
      signal: controller.signal,
    });
    if (!res.ok) throw new Error(`ml-service responded ${res.status}`);
    const data = (await res.json()) as { probability: number; modelVersion: string };
    return { probability: data.probability, modelVersion: data.modelVersion };
  } finally {
    clearTimeout(timeout);
  }
}
