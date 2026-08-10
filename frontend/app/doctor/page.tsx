"use client";

import { useEffect, useState, FormEvent } from "react";
import { useRouter } from "next/navigation";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { RoleGate } from "../components/RoleGate";
import { AppointmentsList } from "../components/AppointmentsList";
import { DashboardSkeleton } from "../components/Skeleton";
import { useAuth } from "../lib/AuthContext";
import { connectSocket } from "../lib/socket";
import * as api from "../lib/api";

export default function DoctorDashboardPage() {
  return (
    <RoleGate allow={["doctor"]}>
      <DoctorDashboard />
    </RoleGate>
  );
}

function DoctorDashboard() {
  const { data: profile, isLoading } = useQuery({
    queryKey: ["myPractitionerProfile"],
    queryFn: api.fetchMyPractitionerProfile,
  });

  if (isLoading) return <DashboardSkeleton />;
  if (!profile) return <ProfileForm />;
  return <Schedule />;
}

function ProfileForm() {
  const queryClient = useQueryClient();
  const [specialty, setSpecialty] = useState("");
  const [departmentId, setDepartmentId] = useState("");
  const [licenseNumber, setLicenseNumber] = useState("");
  const [error, setError] = useState<string | null>(null);

  const { data: departments = [] } = useQuery({ queryKey: ["departments"], queryFn: api.fetchDepartments });

  const mutation = useMutation({
    mutationFn: api.createMyPractitionerProfile,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["myPractitionerProfile"] }),
    onError: (err) => setError((err as Error).message),
  });

  function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    mutation.mutate({ specialty, departmentId: departmentId || undefined, licenseNumber: licenseNumber || undefined });
  }

  return (
    <div className="dashboard">
      <h1>Complete your practitioner profile</h1>
      <p className="dashboard-subtitle">Patients can only find and book you once this is set.</p>
      <form onSubmit={submit} className="auth-form dashboard-card" style={{ maxWidth: 420 }}>
        <label>
          Specialty
          <input value={specialty} onChange={(e) => setSpecialty(e.target.value)} required />
        </label>
        <label>
          Department
          <select value={departmentId} onChange={(e) => setDepartmentId(e.target.value)}>
            <option value="">None</option>
            {departments.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          License number
          <input value={licenseNumber} onChange={(e) => setLicenseNumber(e.target.value)} />
        </label>
        {error && <p className="auth-error">{error}</p>}
        <button type="submit" className="btn-primary" disabled={mutation.isPending}>
          {mutation.isPending ? "Saving…" : "Save profile"}
        </button>
      </form>
    </div>
  );
}

function Schedule() {
  const { user } = useAuth();
  const router = useRouter();
  const queryClient = useQueryClient();
  const { data: appointments = [] } = useQuery({
    queryKey: ["myPractitionerSchedule"],
    queryFn: api.fetchMyScheduleAsPractitioner,
  });

  const openChartMutation = useMutation({
    mutationFn: (appointmentId: string) => api.startEncounter({ appointmentId }),
    onSuccess: (encounter) => router.push(`/doctor/encounter/${encounter.id}`),
  });

  const joinTelemedMutation = useMutation({
    mutationFn: api.createTelemedSession,
    onSuccess: (session) => router.push(`/telemed/${session.id}`),
  });

  useEffect(() => {
    const socket = connectSocket();
    socket.emit("scheduling:join-practitioner");
    const refetch = () => queryClient.invalidateQueries({ queryKey: ["myPractitionerSchedule"] });
    socket.on("appointment:created", refetch);
    socket.on("appointment:updated", refetch);
    return () => {
      socket.disconnect();
    };
  }, [queryClient]);

  const statusMutation = useMutation({
    mutationFn: ({ id, status }: { id: string; status: string }) => api.updateAppointmentStatus(id, status),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["myPractitionerSchedule"] }),
  });

  return (
    <div className="dashboard">
      <h1>Welcome, Dr. {user?.name}</h1>
      <p className="dashboard-subtitle">Doctor dashboard</p>
      <AppointmentsList
        appointments={appointments}
        title="Your schedule"
        emptyLabel="No appointments scheduled."
        actions={[
          { label: "Mark fulfilled", status: "fulfilled", when: ["booked", "arrived"] },
          { label: "Mark no-show", status: "noshow", when: ["booked", "arrived"] },
          { label: "Cancel", status: "cancelled", when: ["booked", "arrived"] },
        ]}
        onAction={(id, status) => statusMutation.mutate({ id, status })}
        onOpenChart={(id) => openChartMutation.mutate(id)}
        onJoinTelemed={(id) => joinTelemedMutation.mutate(id)}
      />
    </div>
  );
}
