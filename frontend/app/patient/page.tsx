"use client";

import { useEffect, useState, FormEvent } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { RoleGate } from "../components/RoleGate";
import { BookingForm } from "../components/BookingForm";
import { AppointmentsList } from "../components/AppointmentsList";
import { ConciergeWidget } from "../components/ConciergeWidget";
import { DashboardSkeleton } from "../components/Skeleton";
import { useAuth } from "../lib/AuthContext";
import { connectSocket } from "../lib/socket";
import * as api from "../lib/api";

export default function PatientDashboardPage() {
  return (
    <RoleGate allow={["patient"]}>
      <PatientDashboard />
    </RoleGate>
  );
}

function PatientDashboard() {
  const { data: profile, isLoading } = useQuery({
    queryKey: ["myPatientProfile"],
    queryFn: api.fetchMyPatientProfile,
  });

  if (isLoading) return <DashboardSkeleton />;
  if (!profile) return <ProfileForm />;
  return <BookingAndAppointments />;
}

function ProfileForm() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [firstName, setFirstName] = useState(user?.name.split(" ")[0] ?? "");
  const [lastName, setLastName] = useState(user?.name.split(" ").slice(1).join(" ") ?? "");
  const [dob, setDob] = useState("");
  const [gender, setGender] = useState("unknown");
  const [bloodType, setBloodType] = useState("unknown");
  const [phone, setPhone] = useState("");
  const [error, setError] = useState<string | null>(null);

  const mutation = useMutation({
    mutationFn: api.createMyPatientProfile,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["myPatientProfile"] }),
    onError: (err) => setError((err as Error).message),
  });

  function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    mutation.mutate({ firstName, lastName, dob, gender, bloodType, phone: phone || undefined });
  }

  return (
    <div className="dashboard">
      <h1>Complete your patient profile</h1>
      <p className="dashboard-subtitle">We need a few details before you can book an appointment.</p>
      <form onSubmit={submit} className="auth-form dashboard-card" style={{ maxWidth: 420 }}>
        <label>
          First name
          <input value={firstName} onChange={(e) => setFirstName(e.target.value)} required />
        </label>
        <label>
          Last name
          <input value={lastName} onChange={(e) => setLastName(e.target.value)} required />
        </label>
        <label>
          Date of birth
          <input type="date" value={dob} onChange={(e) => setDob(e.target.value)} required />
        </label>
        <label>
          Gender
          <select value={gender} onChange={(e) => setGender(e.target.value)}>
            <option value="unknown">Prefer not to say</option>
            <option value="female">Female</option>
            <option value="male">Male</option>
            <option value="other">Other</option>
          </select>
        </label>
        <label>
          Blood type
          <select value={bloodType} onChange={(e) => setBloodType(e.target.value)}>
            {["unknown", "A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-"].map((bt) => (
              <option key={bt} value={bt}>
                {bt === "unknown" ? "Unknown" : bt}
              </option>
            ))}
          </select>
        </label>
        <label>
          Phone
          <input value={phone} onChange={(e) => setPhone(e.target.value)} />
        </label>
        {error && <p className="auth-error">{error}</p>}
        <button type="submit" className="btn-primary" disabled={mutation.isPending}>
          {mutation.isPending ? "Saving…" : "Save profile"}
        </button>
      </form>
    </div>
  );
}

function BookingAndAppointments() {
  const { user } = useAuth();
  const router = useRouter();
  const queryClient = useQueryClient();
  const { data: appointments = [] } = useQuery({
    queryKey: ["myAppointments"],
    queryFn: api.fetchMyAppointments,
  });

  const joinTelemedMutation = useMutation({
    mutationFn: api.createTelemedSession,
    onSuccess: (session, appointmentId) => router.push(`/telemed/${session.id}?appointmentId=${appointmentId}`),
  });

  useEffect(() => {
    const socket = connectSocket();
    for (const a of appointments) socket.emit("appointment:watch", a.id);
    const refetch = () => queryClient.invalidateQueries({ queryKey: ["myAppointments"] });
    socket.on("appointment:updated", refetch);
    return () => {
      socket.disconnect();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [appointments.map((a) => a.id).join(",")]);

  return (
    <div className="dashboard">
      <h1>Welcome, {user?.name}</h1>
      <p className="dashboard-subtitle">
        Patient dashboard · <Link href="/symptom-checker">Not feeling well? Try the symptom checker</Link>
      </p>
      <BookingForm onBooked={() => queryClient.invalidateQueries({ queryKey: ["myAppointments"] })} />
      <AppointmentsList
        appointments={appointments}
        title="My appointments"
        onJoinTelemed={(id) => joinTelemedMutation.mutate(id)}
      />
      <HealthRecord />
      <LabResults />
      <MyInvoices />
      <Consents />
      <ConciergeWidget />
    </div>
  );
}

function HealthRecord() {
  const { data: profile } = useQuery({ queryKey: ["myPatientProfile"], queryFn: api.fetchMyPatientProfile });
  const { data: summary, isLoading } = useQuery({
    queryKey: ["patientSummary", profile?.id],
    queryFn: () => api.fetchPatientSummary(profile!.id),
    enabled: !!profile,
  });

  if (isLoading || !summary) {
    return (
      <div className="dashboard-card">
        <h2>My health record</h2>
        <p className="dashboard-subtitle">Loading…</p>
      </div>
    );
  }

  return (
    <div className="dashboard-card">
      <h2>My health record</h2>

      <h3 style={{ fontSize: "0.95rem" }}>Diagnoses</h3>
      {summary.conditions.length === 0 && <p className="dashboard-subtitle">None on file.</p>}
      <ul className="appt-list">
        {summary.conditions.map((c) => (
          <li key={c.id} className="appt-row">
            <div className="appt-info">
              <strong>{c.code.display}</strong>
              <span className="status-badge status-booked">{c.clinical_status}</span>
            </div>
          </li>
        ))}
      </ul>

      <h3 style={{ fontSize: "0.95rem" }}>Allergies</h3>
      {summary.allergies.length === 0 && <p className="dashboard-subtitle">None on file.</p>}
      <ul className="appt-list">
        {summary.allergies.map((a) => (
          <li key={a.id} className="appt-row">
            <div className="appt-info">
              <strong>{a.substance}</strong>
              {a.reaction && <span>{a.reaction}</span>}
            </div>
          </li>
        ))}
      </ul>

      <h3 style={{ fontSize: "0.95rem" }}>Medications</h3>
      {summary.medications.length === 0 && <p className="dashboard-subtitle">None on file.</p>}
      <ul className="appt-list">
        {summary.medications.map((m) => (
          <li key={m.id} className="appt-row">
            <div className="appt-info">
              <strong>{m.medication_code.display}</strong>
              <span>{m.dosage_text}</span>
            </div>
          </li>
        ))}
      </ul>

      <h3 style={{ fontSize: "0.95rem" }}>Visit notes</h3>
      {summary.notes.length === 0 && <p className="dashboard-subtitle">No signed notes yet.</p>}
      <ul className="appt-list">
        {summary.notes.map((n) => (
          <li key={n.id} className="appt-row" style={{ alignItems: "flex-start" }}>
            <div className="appt-info" style={{ flexDirection: "column", alignItems: "flex-start", gap: "0.35rem" }}>
              <span className="dashboard-subtitle">{new Date(n.created_at).toLocaleDateString()}</span>
              <p style={{ margin: 0 }}>{n.content}</p>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

function LabResults() {
  const { data: profile } = useQuery({ queryKey: ["myPatientProfile"], queryFn: api.fetchMyPatientProfile });
  const { data: results = [] } = useQuery({
    queryKey: ["labResults", profile?.id],
    queryFn: () => api.fetchLabResultsForPatient(profile!.id),
    enabled: !!profile,
  });

  return (
    <div className="dashboard-card">
      <h2>Lab results</h2>
      {results.length === 0 && <p className="dashboard-subtitle">No lab results yet.</p>}
      <ul className="appt-list">
        {results.map((r) => (
          <li key={r.id} className="appt-row">
            <span>{r.result_text}</span>
            <span className="dashboard-subtitle">{new Date(r.reported_at).toLocaleDateString()}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function MyInvoices() {
  const { data: invoices = [] } = useQuery({ queryKey: ["myInvoices"], queryFn: api.fetchMyInvoices });

  return (
    <div className="dashboard-card">
      <h2>Billing</h2>
      {invoices.length === 0 && <p className="dashboard-subtitle">No invoices yet.</p>}
      <ul className="appt-list">
        {invoices.map((inv) => (
          <li key={inv.id} className="appt-row">
            <div className="appt-info">
              <strong>${Number(inv.total_amount).toFixed(2)}</strong>
              <span className={`status-badge status-${inv.status === "paid" ? "fulfilled" : "booked"}`}>
                {inv.status}
              </span>
            </div>
            <span className="dashboard-subtitle">{new Date(inv.created_at).toLocaleDateString()}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

const CONSENT_LABELS: Record<string, string> = {
  treatment: "Treatment",
  data_processing: "Data processing",
  telemedicine: "Telemedicine",
};

function Consents() {
  const queryClient = useQueryClient();
  const { data: consents = [] } = useQuery({ queryKey: ["myConsents"], queryFn: api.fetchMyConsents });

  const grantMutation = useMutation({
    mutationFn: api.grantConsent,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["myConsents"] }),
  });
  const revokeMutation = useMutation({
    mutationFn: api.revokeConsent,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["myConsents"] }),
  });

  return (
    <div className="dashboard-card">
      <h2>Consents</h2>
      <p className="dashboard-subtitle">
        Consent can be revoked at any time — revoking keeps a record but stops treating it as active.
      </p>
      <ul className="appt-list">
        {Object.entries(CONSENT_LABELS).map(([type, label]) => {
          const active = consents.find((c) => c.consent_type === type && !c.revoked_at);
          return (
            <li key={type} className="appt-row">
              <div className="appt-info">
                <strong>{label}</strong>
                <span className={`status-badge status-${active ? "fulfilled" : "cancelled"}`}>
                  {active ? "Granted" : "Not granted"}
                </span>
              </div>
              {active ? (
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={() => revokeMutation.mutate(active.id)}
                  disabled={revokeMutation.isPending}
                >
                  Revoke
                </button>
              ) : (
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={() => grantMutation.mutate(type)}
                  disabled={grantMutation.isPending}
                >
                  Grant
                </button>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
