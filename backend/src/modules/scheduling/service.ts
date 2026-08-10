import { pool } from "../../config/db.js";

const CLINIC_START_HOUR = 9;
const CLINIC_END_HOUR = 17;

export interface Appointment {
  id: string;
  patient_id: string;
  practitioner_id: string;
  healthcare_service_id: string;
  location_id: string | null;
  scheduled_start: string;
  scheduled_end: string;
  status: string;
  appointment_type: string;
  reason_code: unknown;
  created_via: string;
  created_at: string;
}

// Simplification for this phase: every practitioner shares fixed 09:00-17:00
// UTC clinic hours rather than per-practitioner schedules, and all times are
// UTC (no timezone handling) — flagged as a place to revisit if this grows
// past a portfolio project.
export async function getAvailability(
  practitionerId: string,
  dateStr: string,
  durationMinutes: number
): Promise<string[]> {
  const dayStart = new Date(`${dateStr}T00:00:00.000Z`);
  if (Number.isNaN(dayStart.getTime())) throw new Error("Invalid date");

  const existing = await pool.query<{ scheduled_start: string; scheduled_end: string }>(
    `SELECT scheduled_start, scheduled_end FROM appointments
     WHERE practitioner_id = $1
       AND status != 'cancelled'
       AND scheduled_start >= $2 AND scheduled_start < $2::timestamptz + interval '1 day'`,
    [practitionerId, dayStart.toISOString()]
  );
  const booked = existing.rows.map((r) => ({
    start: new Date(r.scheduled_start).getTime(),
    end: new Date(r.scheduled_end).getTime(),
  }));

  const slots: string[] = [];
  const now = Date.now();
  const slotMs = durationMinutes * 60 * 1000;
  let cursor = new Date(dayStart);
  cursor.setUTCHours(CLINIC_START_HOUR, 0, 0, 0);
  const dayEnd = new Date(dayStart);
  dayEnd.setUTCHours(CLINIC_END_HOUR, 0, 0, 0);

  while (cursor.getTime() + slotMs <= dayEnd.getTime()) {
    const slotStart = cursor.getTime();
    const slotEnd = slotStart + slotMs;
    const overlaps = booked.some((b) => slotStart < b.end && slotEnd > b.start);
    if (!overlaps && slotStart > now) {
      slots.push(new Date(slotStart).toISOString());
    }
    cursor = new Date(slotEnd);
  }
  return slots;
}

export interface CreateAppointmentInput {
  patientId: string;
  practitionerId: string;
  healthcareServiceId: string;
  locationId?: string;
  scheduledStart: string;
  appointmentType?: "in_person" | "telemedicine";
  reasonCode?: unknown;
  createdVia?: "manual" | "ai_concierge";
}

export async function createAppointment(input: CreateAppointmentInput): Promise<Appointment> {
  const serviceResult = await pool.query<{ duration_minutes: number }>(
    "SELECT duration_minutes FROM healthcare_services WHERE id = $1",
    [input.healthcareServiceId]
  );
  const service = serviceResult.rows[0];
  if (!service) throw new Error("Unknown healthcare service");

  const start = new Date(input.scheduledStart);
  const end = new Date(start.getTime() + service.duration_minutes * 60 * 1000);

  const conflict = await pool.query(
    `SELECT id FROM appointments
     WHERE practitioner_id = $1 AND status != 'cancelled'
       AND scheduled_start < $3 AND scheduled_end > $2`,
    [input.practitionerId, start.toISOString(), end.toISOString()]
  );
  if (conflict.rowCount) throw new Error("Slot no longer available");

  const result = await pool.query<Appointment>(
    `INSERT INTO appointments
       (patient_id, practitioner_id, healthcare_service_id, location_id, scheduled_start, scheduled_end, appointment_type, reason_code, created_via)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
     RETURNING *`,
    [
      input.patientId,
      input.practitionerId,
      input.healthcareServiceId,
      input.locationId ?? null,
      start.toISOString(),
      end.toISOString(),
      input.appointmentType ?? "in_person",
      input.reasonCode ? JSON.stringify(input.reasonCode) : null,
      input.createdVia ?? "manual",
    ]
  );
  return result.rows[0];
}

export async function listAppointmentsForPatient(patientId: string): Promise<Appointment[]> {
  const result = await pool.query<Appointment>(
    "SELECT * FROM appointments WHERE patient_id = $1 ORDER BY scheduled_start DESC",
    [patientId]
  );
  return result.rows;
}

export async function listAppointmentsForPractitioner(practitionerId: string): Promise<Appointment[]> {
  const result = await pool.query<Appointment>(
    "SELECT * FROM appointments WHERE practitioner_id = $1 ORDER BY scheduled_start ASC",
    [practitionerId]
  );
  return result.rows;
}

export async function listAppointments(filters: { date?: string; status?: string }): Promise<Appointment[]> {
  const clauses: string[] = [];
  const params: unknown[] = [];
  if (filters.date) {
    params.push(filters.date);
    clauses.push(`scheduled_start >= $${params.length}::timestamptz`);
    clauses.push(`scheduled_start < $${params.length}::timestamptz + interval '1 day'`);
  }
  if (filters.status) {
    params.push(filters.status);
    clauses.push(`status = $${params.length}`);
  }
  const where = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";
  const result = await pool.query<Appointment>(
    `SELECT * FROM appointments ${where} ORDER BY scheduled_start ASC`,
    params
  );
  return result.rows;
}

export async function findAppointmentById(id: string): Promise<Appointment | undefined> {
  const result = await pool.query<Appointment>("SELECT * FROM appointments WHERE id = $1", [id]);
  return result.rows[0];
}

export async function updateAppointmentStatus(id: string, status: string): Promise<Appointment | undefined> {
  const result = await pool.query<Appointment>(
    "UPDATE appointments SET status = $1 WHERE id = $2 RETURNING *",
    [status, id]
  );
  return result.rows[0];
}

export interface NoShowFeatures {
  leadTimeHours: number;
  hourOfDay: number;
  dayOfWeek: number;
  priorNoshowRate: number;
  isTelemedicine: number;
}

// Cross-module read for the no-show module — computed here (not queried
// directly by ai/noshow) since only this service knows the appointments
// schema. UTC throughout, consistent with the rest of scheduling.
export async function getNoShowFeatures(appointmentId: string): Promise<NoShowFeatures | undefined> {
  const appt = await findAppointmentById(appointmentId);
  if (!appt) return undefined;

  const start = new Date(appt.scheduled_start);
  const leadTimeHours = Math.max(
    0,
    (start.getTime() - new Date(appt.created_at).getTime()) / (1000 * 60 * 60)
  );

  const history = await pool.query<{ total: string; noshows: string }>(
    `SELECT count(*) FILTER (WHERE status != 'cancelled' AND scheduled_start < now()) AS total,
            count(*) FILTER (WHERE status = 'noshow') AS noshows
     FROM appointments WHERE patient_id = $1 AND id != $2`,
    [appt.patient_id, appointmentId]
  );
  const total = Number(history.rows[0]?.total ?? 0);
  const noshows = Number(history.rows[0]?.noshows ?? 0);

  return {
    leadTimeHours,
    hourOfDay: start.getUTCHours(),
    dayOfWeek: start.getUTCDay(),
    priorNoshowRate: total > 0 ? noshows / total : 0,
    isTelemedicine: appt.appointment_type === "telemedicine" ? 1 : 0,
  };
}
