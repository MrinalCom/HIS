"use client";

import { useState, FormEvent } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  BarChart,
  Bar,
  Cell,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import { RoleGate } from "../components/RoleGate";
import Link from "next/link";
import { useAuth } from "../lib/AuthContext";
import * as api from "../lib/api";

export default function AdminDashboard() {
  return (
    <RoleGate allow={["admin"]}>
      <Dashboard />
    </RoleGate>
  );
}

function Dashboard() {
  const { user } = useAuth();
  return (
    <div className="dashboard">
      <h1>Welcome, {user?.name}</h1>
      <p className="dashboard-subtitle">
        Admin dashboard · <Link href="/admin/audit-log">View audit log</Link>
      </p>
      <AnalyticsPanel />
      <StaffPanel />
      <PayrollPanel />
    </div>
  );
}

const STATUS_COLORS: Record<string, string> = {
  booked: "#2451c9",
  arrived: "#9a6b00",
  fulfilled: "#147a4c",
  cancelled: "#b3261e",
  noshow: "#b3261e",
  proposed: "#5b6b7c",
};

function AnalyticsPanel() {
  const { data: overview } = useQuery({ queryKey: ["analyticsOverview"], queryFn: api.fetchAnalyticsOverview });

  if (!overview) {
    return (
      <div className="dashboard-card">
        <h2>Analytics</h2>
        <p className="dashboard-subtitle">Loading…</p>
      </div>
    );
  }

  return (
    <div className="dashboard-card">
      <h2>Analytics</h2>
      <div className="stat-row">
        <div className="stat-tile">
          <span className="stat-value">${overview.totalRevenue.toFixed(2)}</span>
          <span className="stat-label">Revenue collected</span>
        </div>
        <div className="stat-tile">
          <span className="stat-value">${overview.outstandingRevenue.toFixed(2)}</span>
          <span className="stat-label">Outstanding</span>
        </div>
        <div className="stat-tile">
          <span className="stat-value">{(overview.noShowRate * 100).toFixed(0)}%</span>
          <span className="stat-label">No-show rate</span>
        </div>
      </div>

      <h3 style={{ fontSize: "0.9rem", marginTop: "1.5rem" }}>Appointment volume (last 14 days)</h3>
      <div style={{ width: "100%", height: 220 }}>
        <ResponsiveContainer>
          <LineChart data={overview.appointmentVolumeByDay}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
            <XAxis dataKey="day" tick={{ fontSize: 11 }} />
            <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
            <Tooltip />
            <Line type="monotone" dataKey="count" stroke="var(--primary)" strokeWidth={2} dot={false} />
          </LineChart>
        </ResponsiveContainer>
      </div>

      <h3 style={{ fontSize: "0.9rem", marginTop: "1.5rem" }}>Appointments by status</h3>
      <div style={{ width: "100%", height: 220 }}>
        <ResponsiveContainer>
          <BarChart data={overview.appointmentsByStatus}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
            <XAxis dataKey="status" tick={{ fontSize: 11 }} />
            <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
            <Tooltip />
            <Bar dataKey="count">
              {overview.appointmentsByStatus.map((entry) => (
                <Cell key={entry.status} fill={STATUS_COLORS[entry.status] ?? "#5b6b7c"} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

function StaffPanel() {
  const queryClient = useQueryClient();
  const { data: staff = [] } = useQuery({ queryKey: ["staff"], queryFn: api.fetchStaff });
  const { data: eligible = [] } = useQuery({ queryKey: ["eligibleUsers"], queryFn: api.fetchEligibleStaffUsers });
  const [userId, setUserId] = useState("");
  const [jobTitle, setJobTitle] = useState("");
  const [hourlyRate, setHourlyRate] = useState(25);

  const createMutation = useMutation({
    mutationFn: api.createStaffProfile,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["staff"] });
      queryClient.invalidateQueries({ queryKey: ["eligibleUsers"] });
      setUserId("");
      setJobTitle("");
    },
  });

  return (
    <div className="dashboard-card">
      <h2>Staff</h2>
      <ul className="appt-list">
        {staff.map((s) => (
          <li key={s.id} className="appt-row">
            <div className="appt-info">
              <strong>{s.name}</strong>
              <span>{s.job_title}</span>
              <span>${Number(s.hourly_rate).toFixed(2)}/hr</span>
            </div>
            <ShiftForm staffProfileId={s.id} />
          </li>
        ))}
        {staff.length === 0 && <p className="dashboard-subtitle">No staff profiles yet.</p>}
      </ul>
      <form
        className="booking-grid"
        style={{ marginTop: "1rem" }}
        onSubmit={(e: FormEvent) => {
          e.preventDefault();
          if (userId && jobTitle) createMutation.mutate({ userId, jobTitle, hourlyRate });
        }}
      >
        <label>
          Staff member
          <select value={userId} onChange={(e) => setUserId(e.target.value)}>
            <option value="">Select…</option>
            {eligible.map((u) => (
              <option key={u.id} value={u.id}>
                {u.name} ({u.role})
              </option>
            ))}
          </select>
        </label>
        <label>
          Job title
          <input value={jobTitle} onChange={(e) => setJobTitle(e.target.value)} />
        </label>
        <label>
          Hourly rate ($)
          <input type="number" min={0} value={hourlyRate} onChange={(e) => setHourlyRate(Number(e.target.value))} />
        </label>
        <button type="submit" className="btn-primary" disabled={createMutation.isPending}>
          Add staff profile
        </button>
      </form>
    </div>
  );
}

function ShiftForm({ staffProfileId }: { staffProfileId: string }) {
  const [open, setOpen] = useState(false);
  const [startsAt, setStartsAt] = useState("");
  const [endsAt, setEndsAt] = useState("");

  const mutation = useMutation({
    mutationFn: () => api.addShift({ staffProfileId, startsAt, endsAt }),
    onSuccess: () => {
      setOpen(false);
      setStartsAt("");
      setEndsAt("");
    },
  });

  if (!open) {
    return (
      <button type="button" className="btn-secondary" onClick={() => setOpen(true)}>
        + Shift
      </button>
    );
  }

  return (
    <div style={{ display: "flex", gap: "0.4rem", alignItems: "center" }}>
      <input type="datetime-local" value={startsAt} onChange={(e) => setStartsAt(e.target.value)} />
      <input type="datetime-local" value={endsAt} onChange={(e) => setEndsAt(e.target.value)} />
      <button
        type="button"
        className="btn-primary"
        disabled={!startsAt || !endsAt || mutation.isPending}
        onClick={() => mutation.mutate()}
      >
        Save
      </button>
    </div>
  );
}

function PayrollPanel() {
  const queryClient = useQueryClient();
  const { data: runs = [] } = useQuery({ queryKey: ["payrollRuns"], queryFn: api.fetchPayrollRuns });
  const [periodStart, setPeriodStart] = useState("");
  const [periodEnd, setPeriodEnd] = useState("");
  const [expandedRun, setExpandedRun] = useState<string | null>(null);

  const runMutation = useMutation({
    mutationFn: () => api.runPayroll({ periodStart, periodEnd }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["payrollRuns"] });
      setPeriodStart("");
      setPeriodEnd("");
    },
  });

  return (
    <div className="dashboard-card">
      <h2>Payroll</h2>
      <ul className="appt-list">
        {runs.map((r) => (
          <li key={r.id} style={{ display: "block" }}>
            <div className="appt-row">
              <span>
                {new Date(r.period_start).toLocaleDateString()} – {new Date(r.period_end).toLocaleDateString()}
              </span>
              <button
                type="button"
                className="btn-secondary"
                onClick={() => setExpandedRun(expandedRun === r.id ? null : r.id)}
              >
                {expandedRun === r.id ? "Close" : "Payslips"}
              </button>
            </div>
            {expandedRun === r.id && <PayslipList runId={r.id} />}
          </li>
        ))}
        {runs.length === 0 && <p className="dashboard-subtitle">No payroll runs yet.</p>}
      </ul>
      <form
        className="booking-grid"
        style={{ marginTop: "1rem" }}
        onSubmit={(e: FormEvent) => {
          e.preventDefault();
          if (periodStart && periodEnd) runMutation.mutate();
        }}
      >
        <label>
          Period start
          <input type="date" value={periodStart} onChange={(e) => setPeriodStart(e.target.value)} />
        </label>
        <label>
          Period end
          <input type="date" value={periodEnd} onChange={(e) => setPeriodEnd(e.target.value)} />
        </label>
        <button type="submit" className="btn-primary" disabled={runMutation.isPending}>
          Run payroll
        </button>
      </form>
    </div>
  );
}

function PayslipList({ runId }: { runId: string }) {
  const { data: payslips = [] } = useQuery({
    queryKey: ["payslips", runId],
    queryFn: () => api.fetchPayslipsForRun(runId),
  });

  return (
    <ul className="appt-list" style={{ marginLeft: "1rem" }}>
      {payslips.map((p) => (
        <li key={p.id} className="appt-row">
          <span>{p.staff_name}</span>
          <span>{Number(p.hours_worked).toFixed(1)}h</span>
          <span>
            ${Number(p.gross_amount).toFixed(2)} gross / ${Number(p.net_amount).toFixed(2)} net
          </span>
        </li>
      ))}
      {payslips.length === 0 && <p className="dashboard-subtitle">No payslips (no shifts in this period).</p>}
    </ul>
  );
}
