import { pool } from "../../config/db.js";

export interface Vehicle {
  id: string;
  call_sign: string;
  status: string;
}

export async function listVehicles(): Promise<Vehicle[]> {
  const result = await pool.query<Vehicle>("SELECT * FROM ambulance_vehicles ORDER BY call_sign");
  return result.rows;
}

export interface Dispatch {
  id: string;
  vehicle_id: string;
  patient_id: string | null;
  pickup_location: string;
  status: string;
  lat: string | null;
  lng: string | null;
  requested_at: string;
}

// lat/lng are a deterministic simulator (jittered around a fixed city
// center), not a real GPS feed — see the scope-trim list in
// docs/compliance-checklist.md.
function simulateCoordinates(): { lat: number; lng: number } {
  const CENTER = { lat: 12.9716, lng: 77.5946 };
  return {
    lat: CENTER.lat + (Math.random() - 0.5) * 0.05,
    lng: CENTER.lng + (Math.random() - 0.5) * 0.05,
  };
}

export async function dispatchAmbulance(input: {
  vehicleId: string;
  patientId?: string;
  pickupLocation: string;
  requestedBy: string;
}): Promise<Dispatch> {
  const vehicle = await pool.query<{ status: string }>("SELECT status FROM ambulance_vehicles WHERE id = $1", [
    input.vehicleId,
  ]);
  if (!vehicle.rows[0]) throw new Error("Unknown vehicle");
  if (vehicle.rows[0].status !== "available") throw new Error("Vehicle is not available");

  const coords = simulateCoordinates();
  const result = await pool.query<Dispatch>(
    `INSERT INTO ambulance_dispatches (vehicle_id, patient_id, pickup_location, requested_by, lat, lng)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING *`,
    [input.vehicleId, input.patientId ?? null, input.pickupLocation, input.requestedBy, coords.lat, coords.lng]
  );
  await pool.query("UPDATE ambulance_vehicles SET status = 'dispatched' WHERE id = $1", [input.vehicleId]);
  return result.rows[0];
}

export async function listActiveDispatches(): Promise<Dispatch[]> {
  const result = await pool.query<Dispatch>(
    `SELECT * FROM ambulance_dispatches WHERE status NOT IN ('completed', 'cancelled') ORDER BY requested_at ASC`
  );
  return result.rows;
}

export async function findDispatchById(id: string): Promise<Dispatch | undefined> {
  const result = await pool.query<Dispatch>("SELECT * FROM ambulance_dispatches WHERE id = $1", [id]);
  return result.rows[0];
}

export async function updateDispatchStatus(id: string, status: string): Promise<Dispatch | undefined> {
  const result = await pool.query<Dispatch>(
    `UPDATE ambulance_dispatches
     SET status = $1::dispatch_status, completed_at = CASE WHEN $1 IN ('completed', 'cancelled') THEN now() ELSE completed_at END
     WHERE id = $2
     RETURNING *`,
    [status, id]
  );
  const dispatch = result.rows[0];
  if (dispatch && (status === "completed" || status === "cancelled")) {
    await pool.query("UPDATE ambulance_vehicles SET status = 'available' WHERE id = $1", [dispatch.vehicle_id]);
  }
  return dispatch;
}
