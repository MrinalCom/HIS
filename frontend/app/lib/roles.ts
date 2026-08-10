export type Role =
  | "patient"
  | "doctor"
  | "nurse"
  | "pharmacist"
  | "lab_tech"
  | "receptionist"
  | "billing_clerk"
  | "admin";

export const ROLES: Role[] = [
  "patient",
  "doctor",
  "nurse",
  "pharmacist",
  "lab_tech",
  "receptionist",
  "billing_clerk",
  "admin",
];

export const ROLE_LABELS: Record<Role, string> = {
  patient: "Patient",
  doctor: "Doctor",
  nurse: "Nurse",
  pharmacist: "Pharmacist",
  lab_tech: "Lab Technician",
  receptionist: "Receptionist",
  billing_clerk: "Billing Clerk",
  admin: "Administrator",
};

export function dashboardPath(role: Role): string {
  return `/${role === "lab_tech" ? "lab" : role === "billing_clerk" ? "billing" : role}`;
}
