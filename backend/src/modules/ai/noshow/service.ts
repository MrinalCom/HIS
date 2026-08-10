import { pool } from "../../../config/db.js";
import { getNoShowFeatures, NoShowFeatures } from "../../scheduling/service.js";
import { callMlService } from "./client.js";
import { fallbackNoShowPrediction } from "./fallback.service.js";

export interface NoShowPrediction {
  appointmentId: string;
  probability: number;
  modelVersion: string;
  degraded: boolean;
}

async function recordPrediction(
  appointmentId: string,
  features: NoShowFeatures,
  result: { probability: number; modelVersion: string; degraded: boolean }
): Promise<void> {
  await pool.query(
    `INSERT INTO noshow_predictions (appointment_id, predicted_probability, model_version, features_snapshot, degraded)
     VALUES ($1, $2, $3, $4, $5)`,
    [appointmentId, result.probability, result.modelVersion, JSON.stringify(features), result.degraded]
  );
}

export async function predictNoShow(appointmentId: string): Promise<NoShowPrediction | undefined> {
  const features = await getNoShowFeatures(appointmentId);
  if (!features) return undefined;

  let result;
  try {
    const prediction = await callMlService(features);
    result = { ...prediction, degraded: false };
  } catch {
    result = fallbackNoShowPrediction(features);
  }

  await recordPrediction(appointmentId, features, result);
  return { appointmentId, ...result };
}
