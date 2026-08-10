"use client";

import { useState, FormEvent } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { RoleGate } from "../components/RoleGate";
import { useAuth } from "../lib/AuthContext";
import * as api from "../lib/api";

export default function PharmacistDashboard() {
  return (
    <RoleGate allow={["pharmacist"]}>
      <Dashboard />
    </RoleGate>
  );
}

function Dashboard() {
  const { user } = useAuth();
  return (
    <div className="dashboard">
      <h1>Welcome, {user?.name}</h1>
      <p className="dashboard-subtitle">Pharmacist dashboard</p>
      <PendingPrescriptions />
      <Inventory />
    </div>
  );
}

function PendingPrescriptions() {
  const queryClient = useQueryClient();
  const { data: prescriptions = [] } = useQuery({
    queryKey: ["pendingPrescriptions"],
    queryFn: api.fetchPendingPrescriptions,
  });
  const { data: drugs = [] } = useQuery({ queryKey: ["drugs"], queryFn: api.fetchDrugs });
  const [selection, setSelection] = useState<Record<string, { drugId: string; quantity: number }>>({});

  const dispenseMutation = useMutation({
    mutationFn: (input: { medicationRequestId: string; drugId: string; quantity: number }) =>
      api.dispenseMedication(input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["pendingPrescriptions"] });
      queryClient.invalidateQueries({ queryKey: ["inventory"] });
    },
  });

  return (
    <div className="dashboard-card">
      <h2>Pending prescriptions</h2>
      {prescriptions.length === 0 && <p className="dashboard-subtitle">Nothing to dispense right now.</p>}
      <ul className="appt-list">
        {prescriptions.map((p) => {
          const sel = selection[p.id] ?? { drugId: "", quantity: 1 };
          return (
            <li key={p.id} className="appt-row" style={{ flexWrap: "wrap" }}>
              <div className="appt-info" style={{ flexDirection: "column", alignItems: "flex-start", gap: "0.25rem" }}>
                <strong>
                  {p.patient_first_name} {p.patient_last_name} · {p.patient_mrn}
                </strong>
                <span>
                  {p.medication_code.display} — {p.dosage_text}
                </span>
              </div>
              <div className="appt-actions" style={{ alignItems: "center" }}>
                <select
                  value={sel.drugId}
                  onChange={(e) => setSelection((s) => ({ ...s, [p.id]: { ...sel, drugId: e.target.value } }))}
                >
                  <option value="">Select drug…</option>
                  {drugs.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.name} {d.strength}
                    </option>
                  ))}
                </select>
                <input
                  type="number"
                  min={1}
                  value={sel.quantity}
                  style={{ width: "4.5rem", padding: "0.5rem" }}
                  onChange={(e) =>
                    setSelection((s) => ({ ...s, [p.id]: { ...sel, quantity: Number(e.target.value) } }))
                  }
                />
                <button
                  type="button"
                  className="btn-primary"
                  disabled={!sel.drugId || dispenseMutation.isPending}
                  onClick={() =>
                    dispenseMutation.mutate({ medicationRequestId: p.id, drugId: sel.drugId, quantity: sel.quantity })
                  }
                >
                  Dispense
                </button>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function Inventory() {
  const queryClient = useQueryClient();
  const { data: inventory = [] } = useQuery({ queryKey: ["inventory"], queryFn: api.fetchInventory });
  const { data: drugs = [] } = useQuery({ queryKey: ["drugs"], queryFn: api.fetchDrugs });
  const [drugId, setDrugId] = useState("");
  const [batchNo, setBatchNo] = useState("");
  const [expiryDate, setExpiryDate] = useState("");
  const [quantity, setQuantity] = useState(50);

  const mutation = useMutation({
    mutationFn: api.addInventoryBatch,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["inventory"] });
      setBatchNo("");
      setExpiryDate("");
    },
  });

  return (
    <div className="dashboard-card">
      <h2>Inventory</h2>
      <ul className="appt-list">
        {inventory.map((b) => (
          <li key={b.id} className="appt-row">
            <div className="appt-info">
              <strong>{b.drug_name}</strong>
              <span>Batch {b.batch_no}</span>
              <span>Exp {new Date(b.expiry_date).toLocaleDateString()}</span>
            </div>
            <span className={`status-badge status-${b.quantity <= b.reorder_threshold ? "noshow" : "fulfilled"}`}>
              {b.quantity} in stock
            </span>
          </li>
        ))}
      </ul>
      <form
        className="booking-grid"
        style={{ marginTop: "1rem" }}
        onSubmit={(e: FormEvent) => {
          e.preventDefault();
          if (drugId && batchNo && expiryDate) mutation.mutate({ drugId, batchNo, expiryDate, quantity });
        }}
      >
        <label>
          Drug
          <select value={drugId} onChange={(e) => setDrugId(e.target.value)} required>
            <option value="">Select…</option>
            {drugs.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name} {d.strength}
              </option>
            ))}
          </select>
        </label>
        <label>
          Batch no.
          <input value={batchNo} onChange={(e) => setBatchNo(e.target.value)} required />
        </label>
        <label>
          Expiry date
          <input type="date" value={expiryDate} onChange={(e) => setExpiryDate(e.target.value)} required />
        </label>
        <label>
          Quantity
          <input type="number" min={1} value={quantity} onChange={(e) => setQuantity(Number(e.target.value))} />
        </label>
        <button type="submit" className="btn-primary" disabled={mutation.isPending}>
          Add batch
        </button>
      </form>
    </div>
  );
}
