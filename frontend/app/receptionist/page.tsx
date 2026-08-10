"use client";

import { useEffect, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { RoleGate } from "../components/RoleGate";
import { BookingForm } from "../components/BookingForm";
import { AppointmentsList } from "../components/AppointmentsList";
import { useAuth } from "../lib/AuthContext";
import { connectSocket } from "../lib/socket";
import * as api from "../lib/api";

export default function ReceptionistDashboardPage() {
  return (
    <RoleGate allow={["receptionist"]}>
      <ReceptionistDashboard />
    </RoleGate>
  );
}

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

function ReceptionistDashboard() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [date, setDate] = useState(today);
  const [status, setStatus] = useState("");
  const [selectedPatient, setSelectedPatient] = useState<api.Patient | null>(null);

  const { data: appointments = [] } = useQuery({
    queryKey: ["allAppointments", date, status],
    queryFn: () => api.fetchAllAppointments({ date: date || undefined, status: status || undefined }),
  });

  useEffect(() => {
    const socket = connectSocket();
    socket.emit("scheduling:join-receptionist");
    const refetch = () => queryClient.invalidateQueries({ queryKey: ["allAppointments"] });
    socket.on("appointment:created", refetch);
    socket.on("appointment:updated", refetch);
    return () => {
      socket.disconnect();
    };
  }, [queryClient]);

  const statusMutation = useMutation({
    mutationFn: ({ id, status }: { id: string; status: string }) => api.updateAppointmentStatus(id, status),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["allAppointments"] }),
  });

  return (
    <div className="dashboard">
      <h1>Welcome, {user?.name}</h1>
      <p className="dashboard-subtitle">Receptionist dashboard</p>

      <PatientSearch onSelect={setSelectedPatient} selected={selectedPatient} />

      {selectedPatient && (
        <BookingForm
          patientId={selectedPatient.id}
          onBooked={() => queryClient.invalidateQueries({ queryKey: ["allAppointments"] })}
        />
      )}

      <div className="dashboard-card">
        <h2>Filters</h2>
        <div className="booking-grid">
          <label>
            Date
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </label>
          <label>
            Status
            <select value={status} onChange={(e) => setStatus(e.target.value)}>
              <option value="">All</option>
              {["booked", "arrived", "fulfilled", "cancelled", "noshow"].map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </label>
        </div>
      </div>

      <AppointmentsList
        appointments={appointments}
        title="Appointments"
        emptyLabel="No appointments match these filters."
        actions={[
          { label: "Mark arrived", status: "arrived", when: ["booked"] },
          { label: "Cancel", status: "cancelled", when: ["booked", "arrived"] },
        ]}
        onAction={(id, status) => statusMutation.mutate({ id, status })}
        showNoShowRisk
      />
      <AmbulanceDispatch />
    </div>
  );
}

const DISPATCH_STATUS_LABEL: Record<string, string> = {
  dispatched: "Dispatched",
  en_route: "En route",
  arrived: "Arrived",
};

function AmbulanceDispatch() {
  const queryClient = useQueryClient();
  const [vehicleId, setVehicleId] = useState("");
  const [pickupLocation, setPickupLocation] = useState("");

  const { data: vehicles = [] } = useQuery({ queryKey: ["vehicles"], queryFn: api.fetchVehicles });
  const { data: dispatches = [] } = useQuery({ queryKey: ["dispatches"], queryFn: api.fetchDispatches });

  const dispatchMutation = useMutation({
    mutationFn: () => api.dispatchAmbulance({ vehicleId, pickupLocation }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["vehicles"] });
      queryClient.invalidateQueries({ queryKey: ["dispatches"] });
      setVehicleId("");
      setPickupLocation("");
    },
  });

  const statusMutation = useMutation({
    mutationFn: ({ id, status }: { id: string; status: string }) => api.updateDispatchStatus(id, status),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["vehicles"] });
      queryClient.invalidateQueries({ queryKey: ["dispatches"] });
    },
  });

  const availableVehicles = vehicles.filter((v) => v.status === "available");

  return (
    <div className="dashboard-card">
      <h2>Ambulance dispatch</h2>
      <ul className="appt-list">
        {dispatches.map((d) => (
          <li key={d.id} className="appt-row">
            <div className="appt-info">
              <strong>{vehicles.find((v) => v.id === d.vehicle_id)?.call_sign}</strong>
              <span>{d.pickup_location}</span>
              <span className="status-badge status-booked">{DISPATCH_STATUS_LABEL[d.status] ?? d.status}</span>
            </div>
            <div className="appt-actions">
              {d.status === "dispatched" && (
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={() => statusMutation.mutate({ id: d.id, status: "en_route" })}
                >
                  Mark en route
                </button>
              )}
              {d.status === "en_route" && (
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={() => statusMutation.mutate({ id: d.id, status: "arrived" })}
                >
                  Mark arrived
                </button>
              )}
              {d.status === "arrived" && (
                <button
                  type="button"
                  className="btn-primary"
                  onClick={() => statusMutation.mutate({ id: d.id, status: "completed" })}
                >
                  Complete
                </button>
              )}
            </div>
          </li>
        ))}
        {dispatches.length === 0 && <p className="dashboard-subtitle">No active dispatches.</p>}
      </ul>
      <form
        className="booking-grid"
        style={{ marginTop: "1rem" }}
        onSubmit={(e) => {
          e.preventDefault();
          if (vehicleId && pickupLocation.trim()) dispatchMutation.mutate();
        }}
      >
        <label>
          Vehicle
          <select value={vehicleId} onChange={(e) => setVehicleId(e.target.value)}>
            <option value="">Select…</option>
            {availableVehicles.map((v) => (
              <option key={v.id} value={v.id}>
                {v.call_sign}
              </option>
            ))}
          </select>
        </label>
        <label>
          Pickup location
          <input value={pickupLocation} onChange={(e) => setPickupLocation(e.target.value)} />
        </label>
        <button type="submit" className="btn-primary" disabled={dispatchMutation.isPending}>
          Dispatch
        </button>
      </form>
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
      <h2>Book for a patient</h2>
      {selected ? (
        <p>
          Booking for <strong>{selected.first_name} {selected.last_name}</strong> ({selected.mrn}){" "}
          <button type="button" className="btn-secondary" onClick={() => onSelect(null)}>
            Change
          </button>
        </p>
      ) : (
        <>
          <input
            placeholder="Search by name or MRN…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          {isFetching && <p className="dashboard-subtitle">Searching…</p>}
          {!isFetching && query.length > 1 && results.length === 0 && (
            <p className="dashboard-subtitle">No patients found. They must register and complete their profile first.</p>
          )}
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
