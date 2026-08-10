"use client";

import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { motion, AnimatePresence } from "framer-motion";
import * as api from "../lib/api";
import { useToast } from "../lib/ToastContext";

function todayPlusOne(): string {
  return new Date(Date.now() + 86400000).toISOString().slice(0, 10);
}

function formatSlot(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString(undefined, {
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "UTC",
  }) + " UTC";
}

// Shared by the patient dashboard (self-booking, no patientId prop — the
// backend infers the patient from the authenticated user) and the
// receptionist dashboard (booking on behalf of a looked-up patient).
export function BookingForm({ patientId, onBooked }: { patientId?: string; onBooked: () => void }) {
  const [departmentId, setDepartmentId] = useState("");
  const [serviceId, setServiceId] = useState("");
  const [practitionerId, setPractitionerId] = useState("");
  const [date, setDate] = useState(todayPlusOne);
  const [error, setError] = useState<string | null>(null);
  const [justBooked, setJustBooked] = useState<string | null>(null);
  const { showToast } = useToast();

  const { data: departments = [] } = useQuery({ queryKey: ["departments"], queryFn: api.fetchDepartments });
  const { data: services = [] } = useQuery({
    queryKey: ["services", departmentId],
    queryFn: () => api.fetchServices(departmentId),
    enabled: !!departmentId,
  });
  const { data: practitioners = [] } = useQuery({
    queryKey: ["practitioners", departmentId],
    queryFn: () => api.fetchPractitioners(departmentId),
    enabled: !!departmentId,
  });
  const { data: slots = [], isFetching: slotsLoading } = useQuery({
    queryKey: ["availability", practitionerId, serviceId, date],
    queryFn: () => api.fetchAvailability(practitionerId, serviceId, date),
    enabled: !!(practitionerId && serviceId && date),
  });

  const mutation = useMutation({
    mutationFn: api.bookAppointment,
    onSuccess: (appt) => {
      setError(null);
      setJustBooked(appt.scheduled_start);
      setPractitionerId("");
      onBooked();
      showToast(`Appointment booked for ${formatSlot(appt.scheduled_start)}`, "success");
    },
    onError: (err) => {
      setError((err as Error).message);
      showToast((err as Error).message, "error");
    },
  });

  function selectDepartment(id: string) {
    setDepartmentId(id);
    setServiceId("");
    setPractitionerId("");
    setJustBooked(null);
  }

  function book(slot: string) {
    setJustBooked(null);
    mutation.mutate({ patientId, practitionerId, healthcareServiceId: serviceId, scheduledStart: slot });
  }

  return (
    <div className="dashboard-card">
      <h2>Book an appointment</h2>
      <div className="booking-grid">
        <label>
          Department
          <select value={departmentId} onChange={(e) => selectDepartment(e.target.value)}>
            <option value="">Select…</option>
            {departments.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          Service
          <select value={serviceId} onChange={(e) => setServiceId(e.target.value)} disabled={!departmentId}>
            <option value="">Select…</option>
            {services.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name} ({s.duration_minutes}m)
              </option>
            ))}
          </select>
        </label>
        <label>
          Doctor
          <select
            value={practitionerId}
            onChange={(e) => setPractitionerId(e.target.value)}
            disabled={!departmentId}
          >
            <option value="">Select…</option>
            {practitioners.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name} — {p.specialty}
              </option>
            ))}
          </select>
        </label>
        <label>
          Date
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            min={new Date().toISOString().slice(0, 10)}
          />
        </label>
      </div>

      {practitionerId && serviceId && (
        <div className="slot-list">
          {slotsLoading && <p className="dashboard-subtitle">Loading slots…</p>}
          {!slotsLoading && slots.length === 0 && (
            <p className="dashboard-subtitle">No open slots that day.</p>
          )}
          <AnimatePresence>
            {slots.map((slot, i) => (
              <motion.button
                key={slot}
                type="button"
                className="btn-secondary"
                onClick={() => book(slot)}
                disabled={mutation.isPending}
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.15, delay: Math.min(i * 0.02, 0.3) }}
                whileHover={{ scale: 1.04 }}
                whileTap={{ scale: 0.96 }}
              >
                {formatSlot(slot)}
              </motion.button>
            ))}
          </AnimatePresence>
        </div>
      )}

      {justBooked && <p className="auth-hint">Booked for {formatSlot(justBooked)}.</p>}
      {error && <p className="auth-error">{error}</p>}
    </div>
  );
}
