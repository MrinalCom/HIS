"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { RoleGate } from "../../components/RoleGate";
import * as api from "../../lib/api";

const PAGE_SIZE = 25;

export default function AuditLogPage() {
  return (
    <RoleGate allow={["admin"]}>
      <AuditLog />
    </RoleGate>
  );
}

function AuditLog() {
  const [resourceType, setResourceType] = useState("");
  const [action, setAction] = useState("");
  const [offset, setOffset] = useState(0);

  const { data } = useQuery({
    queryKey: ["auditLog", resourceType, action, offset],
    queryFn: () =>
      api.fetchAuditLog({
        resourceType: resourceType || undefined,
        action: action || undefined,
        limit: PAGE_SIZE,
        offset,
      }),
  });

  return (
    <div className="dashboard">
      <Link href="/admin" className="btn-secondary">
        ← Back to admin dashboard
      </Link>
      <h1 style={{ marginTop: "1rem" }}>Audit log</h1>
      <p className="dashboard-subtitle">
        Append-only — every mutating request and explicit event (login, PHI reads) since day one.
      </p>

      <div className="dashboard-card">
        <div className="booking-grid" style={{ marginBottom: "1rem" }}>
          <label>
            Resource type
            <input
              placeholder="e.g. clinical_note"
              value={resourceType}
              onChange={(e) => {
                setResourceType(e.target.value);
                setOffset(0);
              }}
            />
          </label>
          <label>
            Action
            <select
              value={action}
              onChange={(e) => {
                setAction(e.target.value);
                setOffset(0);
              }}
            >
              <option value="">All</option>
              {["create", "read", "update", "delete", "login", "login_failed", "export"].map((a) => (
                <option key={a} value={a}>
                  {a}
                </option>
              ))}
            </select>
          </label>
        </div>

        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.85rem" }}>
            <thead>
              <tr style={{ textAlign: "left", borderBottom: "1px solid var(--border)" }}>
                <th style={{ padding: "0.4rem" }}>When</th>
                <th style={{ padding: "0.4rem" }}>Actor</th>
                <th style={{ padding: "0.4rem" }}>Action</th>
                <th style={{ padding: "0.4rem" }}>Resource</th>
              </tr>
            </thead>
            <tbody>
              {data?.rows.map((row) => (
                <tr key={row.id} style={{ borderBottom: "1px solid var(--border)" }}>
                  <td style={{ padding: "0.4rem", whiteSpace: "nowrap" }}>
                    {new Date(row.occurred_at).toLocaleString()}
                  </td>
                  <td style={{ padding: "0.4rem" }}>
                    {row.actor_name ? `${row.actor_name} (${row.actor_role})` : "—"}
                  </td>
                  <td style={{ padding: "0.4rem" }}>
                    <span className="status-badge status-booked">{row.action}</span>
                  </td>
                  <td style={{ padding: "0.4rem" }}>
                    {row.resource_type}
                    {row.resource_id ? ` · ${row.resource_id.slice(0, 8)}…` : ""}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {data && (
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: "1rem" }}>
            <span className="dashboard-subtitle">
              {offset + 1}–{Math.min(offset + PAGE_SIZE, data.total)} of {data.total}
            </span>
            <div style={{ display: "flex", gap: "0.5rem" }}>
              <button
                type="button"
                className="btn-secondary"
                disabled={offset === 0}
                onClick={() => setOffset(Math.max(0, offset - PAGE_SIZE))}
              >
                Previous
              </button>
              <button
                type="button"
                className="btn-secondary"
                disabled={offset + PAGE_SIZE >= data.total}
                onClick={() => setOffset(offset + PAGE_SIZE)}
              >
                Next
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
