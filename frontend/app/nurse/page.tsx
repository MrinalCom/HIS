"use client";

import { useEffect, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { motion, AnimatePresence, LayoutGroup } from "framer-motion";
import { RoleGate } from "../components/RoleGate";
import { useAuth } from "../lib/AuthContext";
import { connectSocket } from "../lib/socket";
import * as api from "../lib/api";

export default function NurseDashboard() {
  return (
    <RoleGate allow={["nurse"]}>
      <Dashboard />
    </RoleGate>
  );
}

function Dashboard() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [selectedBed, setSelectedBed] = useState<string | null>(null);
  const [mrnQuery, setMrnQuery] = useState("");

  const { data: beds = [] } = useQuery({ queryKey: ["beds"], queryFn: api.fetchBeds });
  const { data: patients = [] } = useQuery({
    queryKey: ["patientSearch", mrnQuery],
    queryFn: () => api.searchPatients(mrnQuery),
    enabled: mrnQuery.length > 1,
  });

  useEffect(() => {
    const socket = connectSocket();
    socket.emit("beds:join-board");
    const refetch = () => queryClient.invalidateQueries({ queryKey: ["beds"] });
    socket.on("beds:updated", refetch);
    return () => {
      socket.disconnect();
    };
  }, [queryClient]);

  const admitMutation = useMutation({
    mutationFn: (patientId: string) => api.admitPatient({ patientId, bedId: selectedBed! }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["beds"] });
      setSelectedBed(null);
      setMrnQuery("");
    },
  });

  const dischargeMutation = useMutation({
    mutationFn: (admissionId: string) => api.dischargeAdmission(admissionId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["beds"] }),
  });

  const byWard = beds.reduce<Record<string, api.Bed[]>>((acc, bed) => {
    (acc[bed.ward_name] ??= []).push(bed);
    return acc;
  }, {});

  return (
    <div className="dashboard">
      <h1>Welcome, {user?.name}</h1>
      <p className="dashboard-subtitle">Nurse dashboard</p>

      <div className="dashboard-card">
        <h2>Bed board</h2>
        <LayoutGroup>
          {Object.entries(byWard).map(([wardName, wardBeds]) => (
            <div key={wardName} style={{ marginBottom: "1rem" }}>
              <h3 style={{ fontSize: "0.9rem" }}>{wardName}</h3>
              <div className="bed-grid">
                <AnimatePresence>
                  {wardBeds.map((bed) => (
                    <motion.div
                      key={bed.id}
                      layout
                      className={`bed-tile bed-${bed.status}`}
                      initial={{ opacity: 0, scale: 0.9 }}
                      animate={{ opacity: 1, scale: 1 }}
                      exit={{ opacity: 0, scale: 0.9 }}
                      transition={{ duration: 0.25, ease: "easeOut" }}
                    >
                      <strong>{bed.label}</strong>
                      <span className="dashboard-subtitle" style={{ fontSize: "0.75rem" }}>{bed.status}</span>
                      {bed.patient_first_name && (
                        <span style={{ fontSize: "0.8rem" }}>
                          {bed.patient_first_name} {bed.patient_last_name}
                        </span>
                      )}
                      {bed.status === "occupied" && bed.admission_id && (
                        <button
                          type="button"
                          className="btn-secondary"
                          onClick={() => dischargeMutation.mutate(bed.admission_id!)}
                        >
                          Discharge
                        </button>
                      )}
                      {bed.status === "available" && (
                        <button type="button" className="btn-secondary" onClick={() => setSelectedBed(bed.id)}>
                          Admit patient
                        </button>
                      )}
                    </motion.div>
                  ))}
                </AnimatePresence>
              </div>
            </div>
          ))}
        </LayoutGroup>
      </div>

      {selectedBed && (
        <div className="dashboard-card">
          <h2>Admit to bed</h2>
          <input
            placeholder="Search patient by name or MRN…"
            value={mrnQuery}
            onChange={(e) => setMrnQuery(e.target.value)}
          />
          <ul className="patient-results">
            {patients.map((p) => (
              <li key={p.id}>
                <button type="button" className="btn-secondary" onClick={() => admitMutation.mutate(p.id)}>
                  {p.first_name} {p.last_name} — {p.mrn}
                </button>
              </li>
            ))}
          </ul>
          <button type="button" className="btn-secondary" onClick={() => setSelectedBed(null)}>
            Cancel
          </button>
        </div>
      )}
    </div>
  );
}
