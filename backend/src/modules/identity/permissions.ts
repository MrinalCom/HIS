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

// Capability strings are added here as each module is built (scheduling:*,
// ehr:*, pharmacy:*, lab:*, billing:*, hr:*, ...). Routes call
// requirePermission("some:capability") instead of hardcoding role lists, so
// the permission model stays in one place as the system grows.
export type Capability =
  | "identity:mfa:manage"
  | "patients:read:any"
  | "patients:write:any"
  | "scheduling:manage"
  | "directory:manage"
  | "ehr:read:any"
  | "ehr:write"
  | "notes:sign"
  | "lab:order"
  | "lab:manage"
  | "pharmacy:manage"
  | "pharmacy:dispense"
  | "billing:manage"
  | "beds:manage"
  | "ambulance:manage"
  | "hr:manage";

const ALL_STAFF: Role[] = [
  "doctor",
  "nurse",
  "pharmacist",
  "lab_tech",
  "receptionist",
  "billing_clerk",
  "admin",
];

const base: Record<Role, Set<Capability>> = Object.fromEntries(
  ROLES.map((role) => [role, new Set<Capability>()])
) as Record<Role, Set<Capability>>;

for (const role of [...ALL_STAFF, "patient" as Role]) {
  base[role].add("identity:mfa:manage");
}

for (const role of ["doctor", "nurse", "receptionist", "billing_clerk", "admin"] as Role[]) {
  base[role].add("patients:read:any");
}

for (const role of ["receptionist", "admin"] as Role[]) {
  base[role].add("patients:write:any");
  base[role].add("scheduling:manage");
}

base.admin.add("directory:manage");

for (const role of ["doctor", "nurse", "admin"] as Role[]) {
  base[role].add("ehr:read:any");
}
for (const role of ["doctor", "nurse"] as Role[]) {
  base[role].add("ehr:write");
}
base.doctor.add("notes:sign");

for (const role of ["doctor", "nurse"] as Role[]) {
  base[role].add("lab:order");
}
for (const role of ["lab_tech", "admin"] as Role[]) {
  base[role].add("lab:manage");
}
for (const role of ["pharmacist", "admin"] as Role[]) {
  base[role].add("pharmacy:manage");
  base[role].add("pharmacy:dispense");
}
for (const role of ["billing_clerk", "admin"] as Role[]) {
  base[role].add("billing:manage");
}
for (const role of ["nurse", "admin"] as Role[]) {
  base[role].add("beds:manage");
}
for (const role of ["receptionist", "admin"] as Role[]) {
  base[role].add("ambulance:manage");
}
base.admin.add("hr:manage");

export const ROLE_CAPABILITIES: Record<Role, Set<Capability>> = base;
