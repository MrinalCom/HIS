import { Router } from "express";
import { Server } from "socket.io";
import { z } from "zod";
import { requireAuth, requireRole, requirePermission, AuthedRequest } from "../../middleware/auth.js";
import { findPatientByUserId, findPatientById } from "../patients/service.js";
import { findPractitionerByUserId, findPractitionerById, listHealthcareServices } from "../directory/service.js";
import { findUserById } from "../identity/service.js";
import { sendEmail } from "../notifications/service.js";
import {
  getAvailability,
  createAppointment,
  listAppointmentsForPatient,
  listAppointmentsForPractitioner,
  listAppointments,
  findAppointmentById,
  updateAppointmentStatus,
  Appointment,
} from "./service.js";

export const schedulingRouter = Router();

schedulingRouter.get("/practitioners/:id/availability", requireAuth, async (req, res) => {
  const { date, serviceId } = req.query;
  if (typeof date !== "string" || typeof serviceId !== "string") {
    return res.status(400).json({ error: "date and serviceId query params are required" });
  }
  const services = await listHealthcareServices();
  const service = services.find((s) => s.id === serviceId);
  if (!service) return res.status(404).json({ error: "Unknown service" });

  try {
    const slots = await getAvailability(req.params.id, date, service.duration_minutes);
    res.json({ slots });
  } catch (err) {
    res.status(400).json({ error: (err as Error).message });
  }
});

const bookSchema = z.object({
  patientId: z.string().uuid().optional(),
  practitionerId: z.string().uuid(),
  healthcareServiceId: z.string().uuid(),
  locationId: z.string().uuid().optional(),
  scheduledStart: z.string().min(1),
  appointmentType: z.enum(["in_person", "telemedicine"]).optional(),
  reasonCode: z.unknown().optional(),
});

function broadcastAppointment(req: AuthedRequest, event: string, appt: Appointment, practitionerUserId?: string) {
  const io = req.app.get("io") as Server;
  io.to("scheduling:receptionist").emit(event, appt);
  if (practitionerUserId) io.to(`scheduling:practitioner:${practitionerUserId}`).emit(event, appt);
  io.to(`appointment:${appt.id}`).emit(event, appt);
}

schedulingRouter.post("/appointments", requireAuth, async (req: AuthedRequest, res) => {
  const parsed = bookSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  let patientId = parsed.data.patientId;
  if (req.user!.role === "patient") {
    const patient = await findPatientByUserId(req.user!.id);
    if (!patient) return res.status(400).json({ error: "Complete your patient profile first" });
    patientId = patient.id;
  } else if (!["receptionist", "admin"].includes(req.user!.role) || !patientId) {
    return res.status(403).json({ error: "Only a patient, receptionist, or admin can book, and staff must specify patientId" });
  }

  try {
    const appt = await createAppointment({ ...parsed.data, patientId: patientId!, createdVia: "manual" });
    const practitioner = await findPractitionerById(appt.practitioner_id);
    broadcastAppointment(req, "appointment:created", appt, practitioner?.user_id);

    const patient = await findPatientById(patientId!);
    if (patient) {
      const patientUser = await findUserById(patient.user_id);
      if (patientUser) {
        void sendEmail(
          patientUser.email,
          "Appointment confirmed",
          `Your appointment is confirmed for ${new Date(appt.scheduled_start).toUTCString()}.`
        );
      }
    }

    res.status(201).json({ appointment: appt });
  } catch (err) {
    res.status(409).json({ error: (err as Error).message });
  }
});

schedulingRouter.get("/appointments/mine", requireAuth, requireRole("patient"), async (req: AuthedRequest, res) => {
  const patient = await findPatientByUserId(req.user!.id);
  if (!patient) return res.json({ appointments: [] });
  res.json({ appointments: await listAppointmentsForPatient(patient.id) });
});

schedulingRouter.get(
  "/appointments/practitioner/mine",
  requireAuth,
  requireRole("doctor"),
  async (req: AuthedRequest, res) => {
    const practitioner = await findPractitionerByUserId(req.user!.id);
    if (!practitioner) return res.json({ appointments: [] });
    res.json({ appointments: await listAppointmentsForPractitioner(practitioner.id) });
  }
);

schedulingRouter.get(
  "/appointments",
  requireAuth,
  requirePermission("scheduling:manage"),
  async (req: AuthedRequest, res) => {
    const date = typeof req.query.date === "string" ? req.query.date : undefined;
    const status = typeof req.query.status === "string" ? req.query.status : undefined;
    res.json({ appointments: await listAppointments({ date, status }) });
  }
);

const statusSchema = z.object({
  status: z.enum(["proposed", "booked", "arrived", "fulfilled", "cancelled", "noshow"]),
});

schedulingRouter.patch("/appointments/:id/status", requireAuth, async (req: AuthedRequest, res) => {
  const parsed = statusSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  const appt = await findAppointmentById(req.params.id);
  if (!appt) return res.status(404).json({ error: "Appointment not found" });

  const isStaffManager = ["receptionist", "admin"].includes(req.user!.role);
  let isOwningDoctor = false;
  if (req.user!.role === "doctor") {
    const practitioner = await findPractitionerByUserId(req.user!.id);
    isOwningDoctor = practitioner?.id === appt.practitioner_id;
  }
  let isOwningPatient = false;
  if (req.user!.role === "patient" && parsed.data.status === "cancelled") {
    const patient = await findPatientByUserId(req.user!.id);
    isOwningPatient = patient?.id === appt.patient_id;
  }
  if (!isStaffManager && !isOwningDoctor && !isOwningPatient) {
    return res.status(403).json({ error: "Insufficient permissions" });
  }

  const updated = await updateAppointmentStatus(req.params.id, parsed.data.status);
  const practitioner = await findPractitionerById(appt.practitioner_id);
  broadcastAppointment(req, "appointment:updated", updated!, practitioner?.user_id);
  res.json({ appointment: updated });
});
