"use client";

import { useQuery } from "@tanstack/react-query";
import { AnimatePresence, motion } from "framer-motion";
import type { Appointment } from "../lib/api";
import * as api from "../lib/api";

function formatWhen(iso: string): string {
  return (
    new Date(iso).toLocaleString(undefined, {
      weekday: "short",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      timeZone: "UTC",
    }) + " UTC"
  );
}

export interface AppointmentAction {
  label: string;
  status: string;
  // Only shown for appointments currently in one of these statuses.
  when: string[];
}

export function AppointmentsList({
  appointments,
  title,
  actions,
  onAction,
  onOpenChart,
  onJoinTelemed,
  showNoShowRisk,
  emptyLabel = "No appointments yet.",
}: {
  appointments: Appointment[];
  title: string;
  actions?: AppointmentAction[];
  onAction?: (appointmentId: string, status: string) => void;
  onOpenChart?: (appointmentId: string) => void;
  onJoinTelemed?: (appointmentId: string) => void;
  showNoShowRisk?: boolean;
  emptyLabel?: string;
}) {
  return (
    <div className="dashboard-card">
      <h2>{title}</h2>
      {appointments.length === 0 && <p className="dashboard-subtitle">{emptyLabel}</p>}
      <ul className="appt-list">
        <AnimatePresence initial={false}>
          {appointments.map((a) => (
            <motion.li
              key={a.id}
              className="appt-row"
              layout
              initial={{ opacity: 0, scale: 0.98 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.98 }}
              transition={{ duration: 0.2, ease: "easeOut" }}
            >
              <div className="appt-info">
                <span className="appt-when">{formatWhen(a.scheduled_start)}</span>
                <motion.span
                  key={a.status}
                  className={`status-badge status-${a.status}`}
                  initial={{ scale: 0.85, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  transition={{ duration: 0.18 }}
                >
                  {a.status}
                </motion.span>
                {a.appointment_type === "telemedicine" && (
                  <span className="status-badge status-booked">Telemedicine</span>
                )}
                {showNoShowRisk && a.status === "booked" && <NoShowRiskBadge appointmentId={a.id} />}
              </div>
              {(actions || onOpenChart || onJoinTelemed) && (
                <div className="appt-actions">
                  {onJoinTelemed && a.appointment_type === "telemedicine" && ["booked", "arrived"].includes(a.status) && (
                    <button type="button" className="btn-primary" onClick={() => onJoinTelemed(a.id)}>
                      Join video call
                    </button>
                  )}
                  {onOpenChart && ["arrived", "fulfilled"].includes(a.status) && (
                    <button type="button" className="btn-secondary" onClick={() => onOpenChart(a.id)}>
                      Open chart
                    </button>
                  )}
                  {actions &&
                    onAction &&
                    actions
                      .filter((action) => action.when.includes(a.status))
                      .map((action) => (
                        <button
                          key={action.status}
                          type="button"
                          className="btn-secondary"
                          onClick={() => onAction(a.id, action.status)}
                        >
                          {action.label}
                        </button>
                      ))}
                </div>
              )}
            </motion.li>
          ))}
        </AnimatePresence>
      </ul>
    </div>
  );
}

function NoShowRiskBadge({ appointmentId }: { appointmentId: string }) {
  const { data } = useQuery({
    queryKey: ["noShowRisk", appointmentId],
    queryFn: () => api.fetchNoShowRisk(appointmentId),
    staleTime: 5 * 60 * 1000,
  });
  if (!data) return null;
  const pct = Math.round(data.probability * 100);
  const level = pct >= 50 ? "noshow" : pct >= 25 ? "arrived" : "fulfilled";
  return (
    <span className={`status-badge status-${level}`} title={`${data.modelVersion}${data.degraded ? " (fallback)" : ""}`}>
      {pct}% no-show risk
    </span>
  );
}
