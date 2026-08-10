"use client";

import { useState, FormEvent } from "react";
import { useParams, useRouter } from "next/navigation";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { RoleGate } from "../../../components/RoleGate";
import { DashboardSkeleton } from "../../../components/Skeleton";
import * as api from "../../../lib/api";

export default function EncounterChartPage() {
  return (
    <RoleGate allow={["doctor"]}>
      <EncounterChart />
    </RoleGate>
  );
}

function EncounterChart() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const queryClient = useQueryClient();

  const { data: encounter, isLoading } = useQuery({
    queryKey: ["encounter", id],
    queryFn: () => api.fetchEncounter(id),
  });

  const { data: summary, isLoading: summaryLoading } = useQuery({
    queryKey: ["patientSummary", encounter?.patient_id],
    queryFn: () => api.fetchPatientSummary(encounter!.patient_id),
    enabled: !!encounter,
  });

  const invalidateSummary = () =>
    queryClient.invalidateQueries({ queryKey: ["patientSummary", encounter?.patient_id] });

  const completeMutation = useMutation({
    mutationFn: () => api.completeEncounter(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["encounter", id] }),
  });

  if (isLoading || summaryLoading || !encounter || !summary) {
    return <DashboardSkeleton />;
  }

  const encounterNotes = summary.notes.filter((n) => n.encounter_id === encounter.id);

  return (
    <div className="dashboard">
      <button type="button" className="btn-secondary" onClick={() => router.push("/doctor")}>
        ← Back to schedule
      </button>
      <h1 style={{ marginTop: "1rem" }}>{encounter.chief_complaint || "Encounter"}</h1>
      <p className="dashboard-subtitle">
        <span className={`status-badge status-${encounter.status === "finished" ? "fulfilled" : "booked"}`}>
          {encounter.status}
        </span>{" "}
        · {encounter.class} · started {new Date(encounter.period_start).toLocaleString()}
      </p>

      {encounter.status !== "finished" && (
        <button
          type="button"
          className="btn-primary"
          onClick={() => completeMutation.mutate()}
          disabled={completeMutation.isPending}
        >
          {completeMutation.isPending ? "Completing…" : "Complete visit"}
        </button>
      )}

      <VitalsSection encounterId={encounter.id} observations={summary.observations} onSaved={invalidateSummary} />
      <ConditionsSection encounterId={encounter.id} conditions={summary.conditions} onSaved={invalidateSummary} />
      <AllergiesSection patientId={encounter.patient_id} allergies={summary.allergies} onSaved={invalidateSummary} />
      <MedicationsSection encounterId={encounter.id} medications={summary.medications} onSaved={invalidateSummary} />
      <LabOrdersSection encounterId={encounter.id} patientId={encounter.patient_id} />
      <NotesSection encounterId={encounter.id} notes={encounterNotes} onSaved={invalidateSummary} />
    </div>
  );
}

function VitalsSection({
  encounterId,
  observations,
  onSaved,
}: {
  encounterId: string;
  observations: api.Observation[];
  onSaved: () => void;
}) {
  const [display, setDisplay] = useState("");
  const [value, setValue] = useState("");
  const [unit, setUnit] = useState("");

  const mutation = useMutation({
    mutationFn: () =>
      api.addObservation(encounterId, {
        code: { system: "local", code: display.toLowerCase().replace(/\s+/g, "-"), display },
        valueNumeric: value ? Number(value) : undefined,
        valueText: value ? undefined : "recorded",
        unit: unit || undefined,
      }),
    onSuccess: () => {
      setDisplay("");
      setValue("");
      setUnit("");
      onSaved();
    },
  });

  return (
    <div className="dashboard-card">
      <h2>Vitals &amp; observations</h2>
      <ul className="appt-list">
        {observations.map((o) => (
          <li key={o.id} className="appt-row">
            <div className="appt-info">
              <strong>{o.code.display}</strong>
              <span>
                {o.value_numeric ?? o.value_text} {o.unit ?? ""}
              </span>
            </div>
            <span className="dashboard-subtitle">{new Date(o.effective_at).toLocaleString()}</span>
          </li>
        ))}
        {observations.length === 0 && <p className="dashboard-subtitle">No observations recorded yet.</p>}
      </ul>
      <form
        className="booking-grid"
        style={{ marginTop: "1rem" }}
        onSubmit={(e: FormEvent) => {
          e.preventDefault();
          if (display.trim()) mutation.mutate();
        }}
      >
        <label>
          Observation (e.g. Temperature)
          <input value={display} onChange={(e) => setDisplay(e.target.value)} required />
        </label>
        <label>
          Value
          <input value={value} onChange={(e) => setValue(e.target.value)} />
        </label>
        <label>
          Unit
          <input value={unit} onChange={(e) => setUnit(e.target.value)} />
        </label>
        <button type="submit" className="btn-primary" disabled={mutation.isPending}>
          Add
        </button>
      </form>
    </div>
  );
}

function ConditionsSection({
  encounterId,
  conditions,
  onSaved,
}: {
  encounterId: string;
  conditions: api.Condition[];
  onSaved: () => void;
}) {
  const [display, setDisplay] = useState("");

  const mutation = useMutation({
    mutationFn: () =>
      api.addCondition(encounterId, {
        code: { system: "ICD-10", code: display.toLowerCase().replace(/\s+/g, "-"), display },
      }),
    onSuccess: () => {
      setDisplay("");
      onSaved();
    },
  });

  return (
    <div className="dashboard-card">
      <h2>Diagnoses</h2>
      <ul className="appt-list">
        {conditions.map((c) => (
          <li key={c.id} className="appt-row">
            <div className="appt-info">
              <strong>{c.code.display}</strong>
              <span className="status-badge status-booked">{c.clinical_status}</span>
            </div>
          </li>
        ))}
        {conditions.length === 0 && <p className="dashboard-subtitle">No diagnoses recorded yet.</p>}
      </ul>
      <form
        className="booking-grid"
        style={{ marginTop: "1rem" }}
        onSubmit={(e: FormEvent) => {
          e.preventDefault();
          if (display.trim()) mutation.mutate();
        }}
      >
        <label>
          Diagnosis
          <input value={display} onChange={(e) => setDisplay(e.target.value)} required />
        </label>
        <button type="submit" className="btn-primary" disabled={mutation.isPending}>
          Add
        </button>
      </form>
    </div>
  );
}

function AllergiesSection({
  patientId,
  allergies,
  onSaved,
}: {
  patientId: string;
  allergies: api.AllergyIntolerance[];
  onSaved: () => void;
}) {
  const [substance, setSubstance] = useState("");
  const [reaction, setReaction] = useState("");

  const mutation = useMutation({
    mutationFn: () => api.addAllergy(patientId, { substance, reaction: reaction || undefined }),
    onSuccess: () => {
      setSubstance("");
      setReaction("");
      onSaved();
    },
  });

  return (
    <div className="dashboard-card">
      <h2>Allergies</h2>
      <ul className="appt-list">
        {allergies.map((a) => (
          <li key={a.id} className="appt-row">
            <div className="appt-info">
              <strong>{a.substance}</strong>
              {a.reaction && <span>{a.reaction}</span>}
              {a.severity && <span className="status-badge status-noshow">{a.severity}</span>}
            </div>
          </li>
        ))}
        {allergies.length === 0 && <p className="dashboard-subtitle">No known allergies recorded.</p>}
      </ul>
      <form
        className="booking-grid"
        style={{ marginTop: "1rem" }}
        onSubmit={(e: FormEvent) => {
          e.preventDefault();
          if (substance.trim()) mutation.mutate();
        }}
      >
        <label>
          Substance
          <input value={substance} onChange={(e) => setSubstance(e.target.value)} required />
        </label>
        <label>
          Reaction
          <input value={reaction} onChange={(e) => setReaction(e.target.value)} />
        </label>
        <button type="submit" className="btn-primary" disabled={mutation.isPending}>
          Add
        </button>
      </form>
    </div>
  );
}

function MedicationsSection({
  encounterId,
  medications,
  onSaved,
}: {
  encounterId: string;
  medications: api.MedicationRequest[];
  onSaved: () => void;
}) {
  const [display, setDisplay] = useState("");
  const [dosage, setDosage] = useState("");

  const mutation = useMutation({
    mutationFn: () =>
      api.addMedication(encounterId, {
        medicationCode: { system: "RxNorm", code: display.toLowerCase().replace(/\s+/g, "-"), display },
        dosageText: dosage,
      }),
    onSuccess: () => {
      setDisplay("");
      setDosage("");
      onSaved();
    },
  });

  return (
    <div className="dashboard-card">
      <h2>Medications</h2>
      <ul className="appt-list">
        {medications.map((m) => (
          <li key={m.id} className="appt-row">
            <div className="appt-info">
              <strong>{m.medication_code.display}</strong>
              <span>{m.dosage_text}</span>
            </div>
          </li>
        ))}
        {medications.length === 0 && <p className="dashboard-subtitle">No medications prescribed yet.</p>}
      </ul>
      <form
        className="booking-grid"
        style={{ marginTop: "1rem" }}
        onSubmit={(e: FormEvent) => {
          e.preventDefault();
          if (display.trim() && dosage.trim()) mutation.mutate();
        }}
      >
        <label>
          Medication
          <input value={display} onChange={(e) => setDisplay(e.target.value)} required />
        </label>
        <label>
          Dosage
          <input value={dosage} onChange={(e) => setDosage(e.target.value)} required placeholder="e.g. 500mg twice daily" />
        </label>
        <button type="submit" className="btn-primary" disabled={mutation.isPending}>
          Add
        </button>
      </form>
    </div>
  );
}

function LabOrdersSection({ encounterId, patientId }: { encounterId: string; patientId: string }) {
  const [display, setDisplay] = useState("");
  const [justOrdered, setJustOrdered] = useState<string[]>([]);

  const { data: results = [] } = useQuery({
    queryKey: ["labResults", patientId],
    queryFn: () => api.fetchLabResultsForPatient(patientId),
  });

  const mutation = useMutation({
    mutationFn: () =>
      api.orderLabTest({
        patientId,
        encounterId,
        testCode: { system: "local", code: display.toLowerCase().replace(/\s+/g, "-"), display },
      }),
    onSuccess: (order) => {
      setJustOrdered((prev) => [...prev, order.test_code.display]);
      setDisplay("");
    },
  });

  return (
    <div className="dashboard-card">
      <h2>Lab</h2>
      {justOrdered.length > 0 && (
        <p className="chat-degraded-banner" style={{ background: "#e3edff", color: "#2451c9" }}>
          Ordered: {justOrdered.join(", ")} — the lab team will pick this up.
        </p>
      )}
      <h3 style={{ fontSize: "0.9rem" }}>Results on file</h3>
      {results.length === 0 && <p className="dashboard-subtitle">No lab results yet.</p>}
      <ul className="appt-list">
        {results.map((r) => (
          <li key={r.id} className="appt-row">
            <span>{r.result_text}</span>
            <span className="dashboard-subtitle">{new Date(r.reported_at).toLocaleDateString()}</span>
          </li>
        ))}
      </ul>
      <form
        className="booking-grid"
        style={{ marginTop: "1rem" }}
        onSubmit={(e: FormEvent) => {
          e.preventDefault();
          if (display.trim()) mutation.mutate();
        }}
      >
        <label>
          Order a test (e.g. CBC panel)
          <input value={display} onChange={(e) => setDisplay(e.target.value)} required />
        </label>
        <button type="submit" className="btn-primary" disabled={mutation.isPending}>
          Order
        </button>
      </form>
    </div>
  );
}

function NotesSection({
  encounterId,
  notes,
  onSaved,
}: {
  encounterId: string;
  notes: api.ClinicalNote[];
  onSaved: () => void;
}) {
  const [content, setContent] = useState("");

  const addMutation = useMutation({
    mutationFn: () => api.addNote(encounterId, { content }),
    onSuccess: () => {
      setContent("");
      onSaved();
    },
  });

  const signMutation = useMutation({
    mutationFn: (noteId: string) => api.signNote(noteId),
    onSuccess: onSaved,
  });

  const draftMutation = useMutation({
    mutationFn: () => api.draftClinicalNoteWithAi(encounterId),
    onSuccess: onSaved,
  });

  return (
    <div className="dashboard-card">
      <h2>Clinical notes</h2>
      {draftMutation.data?.degraded && (
        <p className="chat-degraded-banner">Smart assistant unavailable — used a template-filled draft instead.</p>
      )}
      <ul className="appt-list">
        {notes.map((n) => (
          <li key={n.id} className="appt-row" style={{ alignItems: "flex-start" }}>
            <div className="appt-info" style={{ flexDirection: "column", alignItems: "flex-start", gap: "0.35rem" }}>
              <div style={{ display: "flex", gap: "0.4rem" }}>
                <span className={`status-badge status-${n.status === "signed" ? "fulfilled" : "arrived"}`}>
                  {n.status}
                </span>
                {n.ai_generated && <span className="status-badge status-booked">AI-drafted</span>}
              </div>
              <p style={{ margin: 0, whiteSpace: "pre-wrap" }}>{n.content}</p>
            </div>
            {n.status === "draft" && (
              <button
                type="button"
                className="btn-secondary"
                onClick={() => signMutation.mutate(n.id)}
                disabled={signMutation.isPending}
              >
                Sign
              </button>
            )}
          </li>
        ))}
        {notes.length === 0 && <p className="dashboard-subtitle">No notes for this encounter yet.</p>}
      </ul>
      <form
        style={{ marginTop: "1rem", display: "flex", flexDirection: "column", gap: "0.6rem" }}
        onSubmit={(e: FormEvent) => {
          e.preventDefault();
          if (content.trim()) addMutation.mutate();
        }}
      >
        <textarea
          value={content}
          onChange={(e) => setContent(e.target.value)}
          placeholder="Write a progress note…"
          rows={4}
          style={{ padding: "0.6rem", borderRadius: 6, border: "1px solid var(--border)", fontFamily: "inherit" }}
        />
        <div style={{ display: "flex", gap: "0.5rem" }}>
          <button type="submit" className="btn-primary" disabled={addMutation.isPending}>
            {addMutation.isPending ? "Saving…" : "Add note"}
          </button>
          <button
            type="button"
            className="btn-secondary"
            disabled={draftMutation.isPending}
            onClick={() => draftMutation.mutate()}
          >
            {draftMutation.isPending ? "Drafting…" : "✨ Draft with AI"}
          </button>
        </div>
      </form>
    </div>
  );
}
