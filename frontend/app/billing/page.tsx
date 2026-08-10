"use client";

import { useState, FormEvent } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { RoleGate } from "../components/RoleGate";
import { useAuth } from "../lib/AuthContext";
import * as api from "../lib/api";

export default function BillingDashboard() {
  return (
    <RoleGate allow={["billing_clerk"]}>
      <Dashboard />
    </RoleGate>
  );
}

function Dashboard() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [selectedPatient, setSelectedPatient] = useState<api.Patient | null>(null);
  const [expandedInvoice, setExpandedInvoice] = useState<string | null>(null);

  const { data: invoices = [] } = useQuery({ queryKey: ["invoices"], queryFn: () => api.fetchInvoices() });

  return (
    <div className="dashboard">
      <h1>Welcome, {user?.name}</h1>
      <p className="dashboard-subtitle">Billing dashboard</p>

      <PatientSearch onSelect={setSelectedPatient} selected={selectedPatient} />
      {selectedPatient && (
        <NewInvoiceForm
          patientId={selectedPatient.id}
          onCreated={() => queryClient.invalidateQueries({ queryKey: ["invoices"] })}
        />
      )}

      <div className="dashboard-card">
        <h2>Invoices</h2>
        {invoices.length === 0 && <p className="dashboard-subtitle">No invoices yet.</p>}
        <ul className="appt-list">
          {invoices.map((inv) => (
            <li key={inv.id} style={{ display: "block" }}>
              <div className="appt-row">
                <div className="appt-info">
                  <strong>${Number(inv.total_amount).toFixed(2)}</strong>
                  <span className={`status-badge status-${inv.status === "paid" ? "fulfilled" : "booked"}`}>
                    {inv.status}
                  </span>
                  <span className="dashboard-subtitle">{new Date(inv.created_at).toLocaleDateString()}</span>
                </div>
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={() => setExpandedInvoice(expandedInvoice === inv.id ? null : inv.id)}
                >
                  {expandedInvoice === inv.id ? "Close" : "Details"}
                </button>
              </div>
              {expandedInvoice === inv.id && <InvoiceDetail invoiceId={inv.id} />}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

function PatientSearch({
  onSelect,
  selected,
}: {
  onSelect: (p: api.Patient | null) => void;
  selected: api.Patient | null;
}) {
  const [query, setQuery] = useState("");
  const { data: results = [], isFetching } = useQuery({
    queryKey: ["patientSearch", query],
    queryFn: () => api.searchPatients(query),
    enabled: query.length > 1,
  });

  return (
    <div className="dashboard-card">
      <h2>Create an invoice</h2>
      {selected ? (
        <p>
          Billing <strong>{selected.first_name} {selected.last_name}</strong> ({selected.mrn}){" "}
          <button type="button" className="btn-secondary" onClick={() => onSelect(null)}>
            Change
          </button>
        </p>
      ) : (
        <>
          <input placeholder="Search by name or MRN…" value={query} onChange={(e) => setQuery(e.target.value)} />
          {isFetching && <p className="dashboard-subtitle">Searching…</p>}
          <ul className="patient-results">
            {results.map((p) => (
              <li key={p.id}>
                <button type="button" className="btn-secondary" onClick={() => onSelect(p)}>
                  {p.first_name} {p.last_name} — {p.mrn}
                </button>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}

function NewInvoiceForm({ patientId, onCreated }: { patientId: string; onCreated: () => void }) {
  const [items, setItems] = useState([{ description: "", amount: "" }]);

  const mutation = useMutation({
    mutationFn: () =>
      api.createInvoice({
        patientId,
        lineItems: items
          .filter((i) => i.description && i.amount)
          .map((i) => ({ description: i.description, amount: Number(i.amount) })),
      }),
    onSuccess: () => {
      setItems([{ description: "", amount: "" }]);
      onCreated();
    },
  });

  return (
    <div className="dashboard-card">
      <form
        onSubmit={(e: FormEvent) => {
          e.preventDefault();
          mutation.mutate();
        }}
        style={{ display: "flex", flexDirection: "column", gap: "0.6rem" }}
      >
        {items.map((item, i) => (
          <div key={i} className="booking-grid">
            <label>
              Description
              <input
                value={item.description}
                onChange={(e) => {
                  const next = [...items];
                  next[i] = { ...next[i], description: e.target.value };
                  setItems(next);
                }}
              />
            </label>
            <label>
              Amount ($)
              <input
                type="number"
                min={0}
                step="0.01"
                value={item.amount}
                onChange={(e) => {
                  const next = [...items];
                  next[i] = { ...next[i], amount: e.target.value };
                  setItems(next);
                }}
              />
            </label>
          </div>
        ))}
        <div style={{ display: "flex", gap: "0.5rem" }}>
          <button type="button" className="btn-secondary" onClick={() => setItems([...items, { description: "", amount: "" }])}>
            + Add line item
          </button>
          <button type="submit" className="btn-primary" disabled={mutation.isPending}>
            Create invoice
          </button>
        </div>
      </form>
    </div>
  );
}

function InvoiceDetail({ invoiceId }: { invoiceId: string }) {
  const queryClient = useQueryClient();
  const { data } = useQuery({ queryKey: ["invoice", invoiceId], queryFn: () => api.fetchInvoiceDetail(invoiceId) });
  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState("cash");

  const payMutation = useMutation({
    mutationFn: () => api.recordPayment(invoiceId, Number(amount), method),
    onSuccess: () => {
      setAmount("");
      queryClient.invalidateQueries({ queryKey: ["invoice", invoiceId] });
      queryClient.invalidateQueries({ queryKey: ["invoices"] });
    },
  });

  if (!data) return <p className="dashboard-subtitle">Loading…</p>;

  return (
    <div style={{ padding: "0.75rem 0.8rem", borderLeft: "2px solid var(--border)", marginLeft: "0.5rem" }}>
      <h3 style={{ fontSize: "0.9rem" }}>Line items</h3>
      <ul className="appt-list">
        {data.lineItems.map((li) => (
          <li key={li.id} className="appt-row">
            <span>{li.description}</span>
            <span>${Number(li.amount).toFixed(2)}</span>
          </li>
        ))}
      </ul>
      <h3 style={{ fontSize: "0.9rem" }}>Payments</h3>
      {data.payments.length === 0 && <p className="dashboard-subtitle">No payments recorded.</p>}
      <ul className="appt-list">
        {data.payments.map((p) => (
          <li key={p.id} className="appt-row">
            <span>${Number(p.amount).toFixed(2)} via {p.method}</span>
            <span className="dashboard-subtitle">{new Date(p.paid_at).toLocaleDateString()}</span>
          </li>
        ))}
      </ul>
      {data.invoice.status !== "paid" && (
        <form
          className="booking-grid"
          style={{ marginTop: "0.5rem" }}
          onSubmit={(e: FormEvent) => {
            e.preventDefault();
            if (amount) payMutation.mutate();
          }}
        >
          <label>
            Amount ($)
            <input type="number" min={0} step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} />
          </label>
          <label>
            Method
            <select value={method} onChange={(e) => setMethod(e.target.value)}>
              <option value="cash">Cash</option>
              <option value="card">Card</option>
              <option value="insurance">Insurance</option>
            </select>
          </label>
          <button type="submit" className="btn-primary" disabled={payMutation.isPending}>
            Record payment
          </button>
        </form>
      )}
    </div>
  );
}
