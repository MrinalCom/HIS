"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { RoleGate } from "../components/RoleGate";
import { useAuth } from "../lib/AuthContext";
import * as api from "../lib/api";

export default function LabDashboard() {
  return (
    <RoleGate allow={["lab_tech"]}>
      <Dashboard />
    </RoleGate>
  );
}

const STATUS_LABEL: Record<string, string> = {
  ordered: "Ordered",
  sample_collected: "Sample collected",
  in_progress: "In progress",
  resulted: "Resulted",
  cancelled: "Cancelled",
};

function Dashboard() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const { data: orders = [] } = useQuery({ queryKey: ["labOrders"], queryFn: () => api.fetchLabOrders() });
  const [reportDrafts, setReportDrafts] = useState<Record<string, string>>({});

  const statusMutation = useMutation({
    mutationFn: ({ id, status }: { id: string; status: string }) => api.updateLabOrderStatus(id, status),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["labOrders"] }),
  });
  const reportMutation = useMutation({
    mutationFn: ({ id, resultText }: { id: string; resultText: string }) => api.submitLabReport(id, resultText),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["labOrders"] }),
  });

  const active = orders.filter((o) => o.status !== "resulted" && o.status !== "cancelled");

  return (
    <div className="dashboard">
      <h1>Welcome, {user?.name}</h1>
      <p className="dashboard-subtitle">Lab dashboard</p>
      <div className="dashboard-card">
        <h2>Lab orders</h2>
        {active.length === 0 && <p className="dashboard-subtitle">No pending orders.</p>}
        <ul className="appt-list">
          {active.map((o) => (
            <li key={o.id} className="appt-row" style={{ flexWrap: "wrap" }}>
              <div className="appt-info" style={{ flexDirection: "column", alignItems: "flex-start", gap: "0.25rem" }}>
                <strong>
                  {o.patient_first_name} {o.patient_last_name} · {o.patient_mrn}
                </strong>
                <span>{o.test_code.display}</span>
                <span className="status-badge status-booked">{STATUS_LABEL[o.status] ?? o.status}</span>
              </div>
              <div className="appt-actions" style={{ alignItems: "center", flexWrap: "wrap" }}>
                {o.status === "ordered" && (
                  <button
                    type="button"
                    className="btn-secondary"
                    onClick={() => statusMutation.mutate({ id: o.id, status: "sample_collected" })}
                  >
                    Mark sample collected
                  </button>
                )}
                {o.status === "sample_collected" && (
                  <button
                    type="button"
                    className="btn-secondary"
                    onClick={() => statusMutation.mutate({ id: o.id, status: "in_progress" })}
                  >
                    Start processing
                  </button>
                )}
                {o.status === "in_progress" && (
                  <>
                    <input
                      placeholder="Result summary…"
                      value={reportDrafts[o.id] ?? ""}
                      onChange={(e) => setReportDrafts((d) => ({ ...d, [o.id]: e.target.value }))}
                      style={{ minWidth: "220px" }}
                    />
                    <button
                      type="button"
                      className="btn-primary"
                      disabled={!reportDrafts[o.id]?.trim() || reportMutation.isPending}
                      onClick={() =>
                        reportMutation.mutate({ id: o.id, resultText: reportDrafts[o.id] })
                      }
                    >
                      Submit report
                    </button>
                  </>
                )}
              </div>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
