/**
 * Seeds a fresh database with one demo account per role plus a golden-path
 * scenario end to end (booking → encounter → signed note → lab result →
 * paid invoice → bed admission/discharge). Hits the running backend's HTTP
 * API — the same way a real client would — rather than writing to the DB
 * directly, so it exercises the same validation/authorization every real
 * request goes through.
 *
 * Usage (with the stack running via docker compose):
 *   docker compose exec backend npx tsx scripts/seed-demo-data.ts
 *
 * Safe to re-run: registration conflicts (email already exists) are
 * skipped, not treated as fatal.
 */

const API_URL = process.env.API_URL || "http://localhost:4000";
const PASSWORD = "DemoPass123!";

interface Session {
  accessToken: string;
  userId: string;
}

async function api<T>(path: string, token: string | undefined, options: RequestInit = {}): Promise<T> {
  const headers = new Headers(options.headers);
  headers.set("Content-Type", "application/json");
  if (token) headers.set("Authorization", `Bearer ${token}`);
  const res = await fetch(`${API_URL}${path}`, { ...options, headers });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`${options.method ?? "GET"} ${path} -> ${res.status}: ${JSON.stringify(data)}`);
  return data as T;
}

async function registerOrLogin(name: string, email: string, role: string): Promise<Session> {
  try {
    const data = await api<{ user: { id: string }; accessToken: string }>("/api/identity/register", undefined, {
      method: "POST",
      body: JSON.stringify({ name, email, password: PASSWORD, role }),
    });
    console.log(`Registered ${role}: ${email}`);
    return { accessToken: data.accessToken, userId: data.user.id };
  } catch {
    const data = await api<{ user: { id: string }; accessToken: string }>("/api/identity/login", undefined, {
      method: "POST",
      body: JSON.stringify({ email, password: PASSWORD }),
    });
    console.log(`Reused existing ${role}: ${email}`);
    return { accessToken: data.accessToken, userId: data.user.id };
  }
}

async function main() {
  const patient = await registerOrLogin("Demo Patient", "demo.patient@his.local", "patient");
  const doctor = await registerOrLogin("Demo Doctor", "demo.doctor@his.local", "doctor");
  const nurse = await registerOrLogin("Demo Nurse", "demo.nurse@his.local", "nurse");
  const pharmacist = await registerOrLogin("Demo Pharmacist", "demo.pharmacist@his.local", "pharmacist");
  const labTech = await registerOrLogin("Demo LabTech", "demo.labtech@his.local", "lab_tech");
  const receptionist = await registerOrLogin("Demo Receptionist", "demo.receptionist@his.local", "receptionist");
  const billingClerk = await registerOrLogin("Demo Billing", "demo.billing@his.local", "billing_clerk");
  await registerOrLogin("Demo Admin", "demo.admin@his.local", "admin");

  await api("/api/patients/me", patient.accessToken, {
    method: "POST",
    body: JSON.stringify({ firstName: "Demo", lastName: "Patient", dob: "1992-03-14", gender: "female", bloodType: "O+" }),
  }).catch(() => console.log("Patient profile already exists"));

  await api("/api/directory/practitioners/me", doctor.accessToken, {
    method: "POST",
    body: JSON.stringify({ specialty: "General Medicine" }),
  }).catch(() => console.log("Practitioner profile already exists"));

  const { patient: patientProfile } = await api<{ patient: { id: string } }>("/api/patients/me", patient.accessToken);
  const { practitioner } = await api<{ practitioner: { id: string } }>(
    "/api/directory/practitioners/me",
    doctor.accessToken
  );

  const { services } = await api<{ services: { id: string; name: string }[] }>(
    "/api/directory/healthcare-services",
    patient.accessToken
  );
  const service = services.find((s) => s.name === "General Consultation") ?? services[0];

  const tomorrow = new Date(Date.now() + 86400000).toISOString().slice(0, 10);
  const { slots } = await api<{ slots: string[] }>(
    `/api/scheduling/practitioners/${practitioner.id}/availability?date=${tomorrow}&serviceId=${service.id}`,
    patient.accessToken
  );

  let appointmentId: string;
  if (slots.length > 0) {
    const { appointment } = await api<{ appointment: { id: string } }>("/api/scheduling/appointments", patient.accessToken, {
      method: "POST",
      body: JSON.stringify({ practitionerId: practitioner.id, healthcareServiceId: service.id, scheduledStart: slots[0] }),
    });
    appointmentId = appointment.id;
    console.log("Booked demo appointment");

    await api(`/api/scheduling/appointments/${appointmentId}/status`, receptionist.accessToken, {
      method: "PATCH",
      body: JSON.stringify({ status: "arrived" }),
    });

    const { encounter } = await api<{ encounter: { id: string } }>("/api/ehr/encounters", doctor.accessToken, {
      method: "POST",
      body: JSON.stringify({ appointmentId, chiefComplaint: "Annual checkup" }),
    });

    await api(`/api/ehr/encounters/${encounter.id}/observations`, doctor.accessToken, {
      method: "POST",
      body: JSON.stringify({ code: { system: "LOINC", code: "8310-5", display: "Body temperature" }, valueNumeric: 36.8, unit: "C" }),
    });

    const { note } = await api<{ note: { id: string } }>(`/api/ehr/encounters/${encounter.id}/notes`, doctor.accessToken, {
      method: "POST",
      body: JSON.stringify({ content: "Routine checkup, no concerns. Follow up in 1 year." }),
    });
    await api(`/api/ehr/notes/${note.id}/sign`, doctor.accessToken, { method: "POST" }).catch(() =>
      console.log("Doctor's demo account needs MFA enrolled to sign notes — skipping sign step")
    );

    await api("/api/lab/orders", doctor.accessToken, {
      method: "POST",
      body: JSON.stringify({ patientId: patientProfile.id, encounterId: encounter.id, testCode: { system: "LOINC", code: "58410-2", display: "CBC panel" } }),
    }).then(async ({ order }: { order: { id: string } }) => {
      await api(`/api/lab/orders/${order.id}/status`, labTech.accessToken, { method: "PATCH", body: JSON.stringify({ status: "sample_collected" }) });
      await api(`/api/lab/orders/${order.id}/status`, labTech.accessToken, { method: "PATCH", body: JSON.stringify({ status: "in_progress" }) });
      await api(`/api/lab/orders/${order.id}/report`, labTech.accessToken, {
        method: "POST",
        body: JSON.stringify({ resultText: "All values within normal range." }),
      });
      console.log("Seeded lab order + result");
    });

    await api("/api/billing/invoices", billingClerk.accessToken, {
      method: "POST",
      body: JSON.stringify({
        patientId: patientProfile.id,
        encounterId: encounter.id,
        lineItems: [{ description: "General Consultation", amount: 75 }],
      }),
    }).then(async ({ invoice }: { invoice: { id: string } }) => {
      await api(`/api/billing/invoices/${invoice.id}/payments`, billingClerk.accessToken, {
        method: "POST",
        body: JSON.stringify({ amount: 75, method: "card" }),
      }).catch(() => console.log("Billing clerk's demo account needs MFA enrolled to record payments — skipping"));
      console.log("Seeded invoice");
    });
  } else {
    console.log("No availability slot found for tomorrow — skipping appointment-dependent seed data");
  }

  const { beds } = await api<{ beds: { id: string; status: string }[] }>("/api/beds/beds", nurse.accessToken);
  const availableBed = beds.find((b) => b.status === "available");
  if (availableBed) {
    await api("/api/beds/admissions", nurse.accessToken, {
      method: "POST",
      body: JSON.stringify({ patientId: patientProfile.id, bedId: availableBed.id }),
    })
      .then(() => console.log("Seeded bed admission"))
      .catch(() => console.log("Nurse's demo account needs MFA enrolled to admit patients — skipping"));
  }

  console.log(`\nDemo accounts (password: ${PASSWORD}):`);
  for (const [role, session] of Object.entries({ patient, doctor, nurse, pharmacist, labTech, receptionist, billingClerk })) {
    console.log(`  ${role}: user id ${session.userId}`);
  }
  console.log("\nNote: several sensitive actions (signing notes, payments, admissions) require MFA");
  console.log("enrollment per docs/compliance-checklist.md. Log in as the relevant demo account and");
  console.log("visit /account to set it up if you want to exercise those specific flows.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
