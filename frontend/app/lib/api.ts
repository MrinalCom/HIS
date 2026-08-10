import { apiFetch, apiJson } from "./apiClient";

export interface Department {
  id: string;
  name: string;
}

export interface HealthcareService {
  id: string;
  department_id: string;
  name: string;
  duration_minutes: number;
}

export interface Practitioner {
  id: string;
  user_id: string;
  specialty: string;
  department_id: string | null;
  license_number: string | null;
  name: string;
}

export interface Patient {
  id: string;
  user_id: string;
  mrn: string;
  first_name: string;
  last_name: string;
  dob: string;
  gender: string;
  blood_type: string;
  phone: string | null;
}

export interface Appointment {
  id: string;
  patient_id: string;
  practitioner_id: string;
  healthcare_service_id: string;
  location_id: string | null;
  scheduled_start: string;
  scheduled_end: string;
  status: string;
  appointment_type: string;
  created_via: string;
}

export async function fetchDepartments(): Promise<Department[]> {
  const data = await apiJson<{ departments: Department[] }>("/api/directory/departments");
  return data.departments;
}

export async function fetchServices(departmentId: string): Promise<HealthcareService[]> {
  const data = await apiJson<{ services: HealthcareService[] }>(
    `/api/directory/healthcare-services?departmentId=${departmentId}`
  );
  return data.services;
}

export async function fetchPractitioners(departmentId: string): Promise<Practitioner[]> {
  const data = await apiJson<{ practitioners: Practitioner[] }>(
    `/api/directory/practitioners?departmentId=${departmentId}`
  );
  return data.practitioners;
}

export async function fetchAvailability(
  practitionerId: string,
  serviceId: string,
  date: string
): Promise<string[]> {
  const data = await apiJson<{ slots: string[] }>(
    `/api/scheduling/practitioners/${practitionerId}/availability?date=${date}&serviceId=${serviceId}`
  );
  return data.slots;
}

export async function fetchMyPatientProfile(): Promise<Patient | null> {
  const res = await apiFetch("/api/patients/me");
  if (res.status === 404) return null;
  if (!res.ok) throw new Error("Failed to load profile");
  const data = await res.json();
  return data.patient;
}

export async function createMyPatientProfile(input: {
  firstName: string;
  lastName: string;
  dob: string;
  gender: string;
  bloodType: string;
  phone?: string;
}): Promise<Patient> {
  const data = await apiJson<{ patient: Patient }>("/api/patients/me", {
    method: "POST",
    body: JSON.stringify(input),
  });
  return data.patient;
}

export async function fetchMyPractitionerProfile(): Promise<Practitioner | null> {
  const res = await apiFetch("/api/directory/practitioners/me");
  if (res.status === 404) return null;
  if (!res.ok) throw new Error("Failed to load profile");
  const data = await res.json();
  return data.practitioner;
}

export async function createMyPractitionerProfile(input: {
  specialty: string;
  departmentId?: string;
  licenseNumber?: string;
}): Promise<Practitioner> {
  const data = await apiJson<{ practitioner: Practitioner }>("/api/directory/practitioners/me", {
    method: "POST",
    body: JSON.stringify(input),
  });
  return data.practitioner;
}

export async function fetchMyAppointments(): Promise<Appointment[]> {
  const data = await apiJson<{ appointments: Appointment[] }>("/api/scheduling/appointments/mine");
  return data.appointments;
}

export async function fetchMyScheduleAsPractitioner(): Promise<Appointment[]> {
  const data = await apiJson<{ appointments: Appointment[] }>(
    "/api/scheduling/appointments/practitioner/mine"
  );
  return data.appointments;
}

export async function fetchAllAppointments(filters: { date?: string; status?: string }): Promise<Appointment[]> {
  const params = new URLSearchParams();
  if (filters.date) params.set("date", filters.date);
  if (filters.status) params.set("status", filters.status);
  const data = await apiJson<{ appointments: Appointment[] }>(
    `/api/scheduling/appointments?${params.toString()}`
  );
  return data.appointments;
}

export async function bookAppointment(input: {
  patientId?: string;
  practitionerId: string;
  healthcareServiceId: string;
  scheduledStart: string;
  appointmentType?: "in_person" | "telemedicine";
}): Promise<Appointment> {
  const data = await apiJson<{ appointment: Appointment }>("/api/scheduling/appointments", {
    method: "POST",
    body: JSON.stringify(input),
  });
  return data.appointment;
}

export async function updateAppointmentStatus(id: string, status: string): Promise<Appointment> {
  const data = await apiJson<{ appointment: Appointment }>(`/api/scheduling/appointments/${id}/status`, {
    method: "PATCH",
    body: JSON.stringify({ status }),
  });
  return data.appointment;
}

export async function searchPatients(q: string): Promise<Patient[]> {
  const data = await apiJson<{ patients: Patient[] }>(`/api/patients?q=${encodeURIComponent(q)}`);
  return data.patients;
}

// --- EHR ---------------------------------------------------------------

export interface CodeableConcept {
  system: string;
  code: string;
  display: string;
}

export interface Encounter {
  id: string;
  patient_id: string;
  practitioner_id: string;
  appointment_id: string | null;
  status: string;
  class: string;
  chief_complaint: string | null;
  period_start: string;
  period_end: string | null;
}

export interface Observation {
  id: string;
  category: string;
  code: CodeableConcept;
  value_text: string | null;
  value_numeric: string | null;
  unit: string | null;
  effective_at: string;
}

export interface Condition {
  id: string;
  code: CodeableConcept;
  clinical_status: string;
  created_at: string;
}

export interface AllergyIntolerance {
  id: string;
  substance: string;
  reaction: string | null;
  severity: string | null;
}

export interface MedicationRequest {
  id: string;
  medication_code: CodeableConcept;
  dosage_text: string;
  status: string;
  created_at: string;
}

export interface ClinicalNote {
  id: string;
  encounter_id: string;
  note_type: string;
  content: string;
  ai_generated: boolean;
  status: string;
  signed_at: string | null;
  created_at: string;
}

export interface PatientSummary {
  encounters: Encounter[];
  conditions: Condition[];
  allergies: AllergyIntolerance[];
  medications: MedicationRequest[];
  observations: Observation[];
  notes: ClinicalNote[];
}

export async function startEncounter(input: {
  appointmentId?: string;
  patientId?: string;
  chiefComplaint?: string;
}): Promise<Encounter> {
  const data = await apiJson<{ encounter: Encounter }>("/api/ehr/encounters", {
    method: "POST",
    body: JSON.stringify(input),
  });
  return data.encounter;
}

export async function fetchEncounter(id: string): Promise<Encounter> {
  const data = await apiJson<{ encounter: Encounter }>(`/api/ehr/encounters/${id}`);
  return data.encounter;
}

export async function completeEncounter(id: string): Promise<Encounter> {
  const data = await apiJson<{ encounter: Encounter }>(`/api/ehr/encounters/${id}/complete`, {
    method: "POST",
  });
  return data.encounter;
}

export async function fetchPatientSummary(patientId: string): Promise<PatientSummary> {
  const data = await apiJson<{ summary: PatientSummary }>(`/api/ehr/patients/${patientId}/summary`);
  return data.summary;
}

export async function addObservation(
  encounterId: string,
  input: { category?: string; code: CodeableConcept; valueText?: string; valueNumeric?: number; unit?: string }
): Promise<Observation> {
  const data = await apiJson<{ observation: Observation }>(`/api/ehr/encounters/${encounterId}/observations`, {
    method: "POST",
    body: JSON.stringify(input),
  });
  return data.observation;
}

export async function addCondition(
  encounterId: string,
  input: { code: CodeableConcept; clinicalStatus?: string }
): Promise<Condition> {
  const data = await apiJson<{ condition: Condition }>(`/api/ehr/encounters/${encounterId}/conditions`, {
    method: "POST",
    body: JSON.stringify(input),
  });
  return data.condition;
}

export async function addAllergy(
  patientId: string,
  input: { substance: string; reaction?: string; severity?: string }
): Promise<AllergyIntolerance> {
  const data = await apiJson<{ allergy: AllergyIntolerance }>(`/api/ehr/patients/${patientId}/allergies`, {
    method: "POST",
    body: JSON.stringify(input),
  });
  return data.allergy;
}

export async function addMedication(
  encounterId: string,
  input: { medicationCode: CodeableConcept; dosageText: string }
): Promise<MedicationRequest> {
  const data = await apiJson<{ medication: MedicationRequest }>(`/api/ehr/encounters/${encounterId}/medications`, {
    method: "POST",
    body: JSON.stringify(input),
  });
  return data.medication;
}

export async function addNote(
  encounterId: string,
  input: { noteType?: string; content: string }
): Promise<ClinicalNote> {
  const data = await apiJson<{ note: ClinicalNote }>(`/api/ehr/encounters/${encounterId}/notes`, {
    method: "POST",
    body: JSON.stringify(input),
  });
  return data.note;
}

export async function signNote(noteId: string): Promise<ClinicalNote> {
  const data = await apiJson<{ note: ClinicalNote }>(`/api/ehr/notes/${noteId}/sign`, { method: "POST" });
  return data.note;
}

// --- Consent -------------------------------------------------------------

export interface Consent {
  id: string;
  consent_type: string;
  granted_at: string;
  revoked_at: string | null;
}

export async function fetchMyConsents(): Promise<Consent[]> {
  const data = await apiJson<{ consents: Consent[] }>("/api/consent/me");
  return data.consents;
}

export async function grantConsent(consentType: string): Promise<Consent> {
  const data = await apiJson<{ consent: Consent }>("/api/consent/me", {
    method: "POST",
    body: JSON.stringify({ consentType }),
  });
  return data.consent;
}

export async function revokeConsent(id: string): Promise<Consent> {
  const data = await apiJson<{ consent: Consent }>(`/api/consent/me/${id}/revoke`, { method: "POST" });
  return data.consent;
}

// --- AI --------------------------------------------------------------

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

export interface TriageResult {
  reply: string;
  redFlags: string[];
  recommendedAction: "self_care" | "book_appointment" | "urgent_care" | "emergency";
  degraded: boolean;
  disclaimer: string;
  sessionId: string;
}

export async function triageChat(messages: ChatMessage[]): Promise<TriageResult> {
  return apiJson<TriageResult>("/api/ai/triage/chat", {
    method: "POST",
    body: JSON.stringify({ messages }),
  });
}

export interface ConciergeResult {
  reply: string;
  degraded: boolean;
}

export async function conciergeChat(messages: ChatMessage[]): Promise<ConciergeResult> {
  return apiJson<ConciergeResult>("/api/ai/concierge/chat", {
    method: "POST",
    body: JSON.stringify({ messages }),
  });
}

// --- Pharmacy ------------------------------------------------------------

export interface Drug {
  id: string;
  name: string;
  form: string | null;
  strength: string | null;
}

export interface InventoryBatch {
  id: string;
  drug_id: string;
  drug_name: string;
  batch_no: string;
  expiry_date: string;
  quantity: number;
  reorder_threshold: number;
}

export interface PendingPrescription {
  id: string;
  patient_id: string;
  medication_code: CodeableConcept;
  dosage_text: string;
  status: string;
  created_at: string;
  patient_first_name: string;
  patient_last_name: string;
  patient_mrn: string;
}

export async function fetchDrugs(): Promise<Drug[]> {
  const data = await apiJson<{ drugs: Drug[] }>("/api/pharmacy/drugs");
  return data.drugs;
}

export async function fetchInventory(): Promise<InventoryBatch[]> {
  const data = await apiJson<{ inventory: InventoryBatch[] }>("/api/pharmacy/inventory");
  return data.inventory;
}

export async function addInventoryBatch(input: {
  drugId: string;
  batchNo: string;
  expiryDate: string;
  quantity: number;
}): Promise<InventoryBatch> {
  const data = await apiJson<{ batch: InventoryBatch }>("/api/pharmacy/inventory", {
    method: "POST",
    body: JSON.stringify(input),
  });
  return data.batch;
}

export async function fetchPendingPrescriptions(): Promise<PendingPrescription[]> {
  const data = await apiJson<{ prescriptions: PendingPrescription[] }>("/api/pharmacy/prescriptions/pending");
  return data.prescriptions;
}

export async function dispenseMedication(input: {
  medicationRequestId: string;
  drugId: string;
  quantity: number;
}): Promise<void> {
  await apiJson("/api/pharmacy/dispenses", { method: "POST", body: JSON.stringify(input) });
}

// --- Lab -------------------------------------------------------------

export interface LabOrder {
  id: string;
  patient_id: string;
  encounter_id: string | null;
  test_code: CodeableConcept;
  status: string;
  ordered_at: string;
  patient_first_name?: string;
  patient_last_name?: string;
  patient_mrn?: string;
}

export interface DiagnosticReport {
  id: string;
  lab_order_id: string;
  result_text: string | null;
  reported_at: string;
}

export async function orderLabTest(input: {
  patientId: string;
  encounterId?: string;
  testCode: CodeableConcept;
}): Promise<LabOrder> {
  const data = await apiJson<{ order: LabOrder }>("/api/lab/orders", {
    method: "POST",
    body: JSON.stringify(input),
  });
  return data.order;
}

export async function fetchLabOrders(status?: string): Promise<LabOrder[]> {
  const data = await apiJson<{ orders: LabOrder[] }>(`/api/lab/orders${status ? `?status=${status}` : ""}`);
  return data.orders;
}

export async function updateLabOrderStatus(id: string, status: string): Promise<LabOrder> {
  const data = await apiJson<{ order: LabOrder }>(`/api/lab/orders/${id}/status`, {
    method: "PATCH",
    body: JSON.stringify({ status }),
  });
  return data.order;
}

export async function submitLabReport(id: string, resultText: string): Promise<DiagnosticReport> {
  const data = await apiJson<{ report: DiagnosticReport }>(`/api/lab/orders/${id}/report`, {
    method: "POST",
    body: JSON.stringify({ resultText }),
  });
  return data.report;
}

export async function fetchLabResultsForPatient(patientId: string): Promise<DiagnosticReport[]> {
  const data = await apiJson<{ results: DiagnosticReport[] }>(`/api/lab/patients/${patientId}/results`);
  return data.results;
}

// --- Billing -------------------------------------------------------------

export interface Invoice {
  id: string;
  patient_id: string;
  status: string;
  total_amount: string;
  created_at: string;
}

export interface InvoiceLineItem {
  id: string;
  description: string;
  code: string | null;
  amount: string;
}

export interface Payment {
  id: string;
  amount: string;
  method: string;
  paid_at: string;
}

export interface Claim {
  id: string;
  status: string;
  payer_response: { approved: boolean; approvedAmount: string; note: string } | null;
}

export interface InsurancePolicy {
  id: string;
  payer_name: string;
  policy_number: string;
}

export async function createInvoice(input: {
  patientId: string;
  encounterId?: string;
  lineItems: { description: string; amount: number }[];
}): Promise<Invoice> {
  const data = await apiJson<{ invoice: Invoice }>("/api/billing/invoices", {
    method: "POST",
    body: JSON.stringify(input),
  });
  return data.invoice;
}

export async function fetchInvoices(status?: string): Promise<Invoice[]> {
  const data = await apiJson<{ invoices: Invoice[] }>(`/api/billing/invoices${status ? `?status=${status}` : ""}`);
  return data.invoices;
}

export async function fetchMyInvoices(): Promise<Invoice[]> {
  const data = await apiJson<{ invoices: Invoice[] }>("/api/billing/invoices/mine");
  return data.invoices;
}

export async function fetchInvoiceDetail(
  id: string
): Promise<{ invoice: Invoice; lineItems: InvoiceLineItem[]; payments: Payment[]; claims: Claim[] }> {
  return apiJson(`/api/billing/invoices/${id}`);
}

export async function recordPayment(invoiceId: string, amount: number, method: string): Promise<Payment> {
  const data = await apiJson<{ payment: Payment }>(`/api/billing/invoices/${invoiceId}/payments`, {
    method: "POST",
    body: JSON.stringify({ amount, method }),
  });
  return data.payment;
}

export async function fetchInsurancePolicies(patientId: string): Promise<InsurancePolicy[]> {
  const data = await apiJson<{ policies: InsurancePolicy[] }>(`/api/billing/patients/${patientId}/insurance`);
  return data.policies;
}

export async function addInsurancePolicy(
  patientId: string,
  input: { payerName: string; policyNumber: string }
): Promise<InsurancePolicy> {
  const data = await apiJson<{ policy: InsurancePolicy }>(`/api/billing/patients/${patientId}/insurance`, {
    method: "POST",
    body: JSON.stringify(input),
  });
  return data.policy;
}

export async function submitClaim(invoiceId: string, insurancePolicyId: string): Promise<Claim> {
  const data = await apiJson<{ claim: Claim }>(`/api/billing/invoices/${invoiceId}/claims`, {
    method: "POST",
    body: JSON.stringify({ insurancePolicyId }),
  });
  return data.claim;
}

// --- Bed management --------------------------------------------------

export interface Ward {
  id: string;
  name: string;
}

export interface Bed {
  id: string;
  ward_id: string;
  ward_name: string;
  label: string;
  status: string;
  patient_first_name: string | null;
  patient_last_name: string | null;
  admission_id: string | null;
}

export async function fetchWards(): Promise<Ward[]> {
  const data = await apiJson<{ wards: Ward[] }>("/api/beds/wards");
  return data.wards;
}

export async function fetchBeds(): Promise<Bed[]> {
  const data = await apiJson<{ beds: Bed[] }>("/api/beds/beds");
  return data.beds;
}

export async function admitPatient(input: { patientId: string; bedId: string }): Promise<void> {
  await apiJson("/api/beds/admissions", { method: "POST", body: JSON.stringify(input) });
}

export async function dischargeAdmission(admissionId: string): Promise<void> {
  await apiJson(`/api/beds/admissions/${admissionId}/discharge`, { method: "POST" });
}

// --- Ambulance -------------------------------------------------------

export interface Vehicle {
  id: string;
  call_sign: string;
  status: string;
}

export interface Dispatch {
  id: string;
  vehicle_id: string;
  patient_id: string | null;
  pickup_location: string;
  status: string;
  lat: string | null;
  lng: string | null;
  requested_at: string;
}

export async function fetchVehicles(): Promise<Vehicle[]> {
  const data = await apiJson<{ vehicles: Vehicle[] }>("/api/ambulance/vehicles");
  return data.vehicles;
}

export async function fetchDispatches(): Promise<Dispatch[]> {
  const data = await apiJson<{ dispatches: Dispatch[] }>("/api/ambulance/dispatches");
  return data.dispatches;
}

export async function dispatchAmbulance(input: {
  vehicleId: string;
  patientId?: string;
  pickupLocation: string;
}): Promise<Dispatch> {
  const data = await apiJson<{ dispatch: Dispatch }>("/api/ambulance/dispatches", {
    method: "POST",
    body: JSON.stringify(input),
  });
  return data.dispatch;
}

export async function updateDispatchStatus(id: string, status: string): Promise<Dispatch> {
  const data = await apiJson<{ dispatch: Dispatch }>(`/api/ambulance/dispatches/${id}/status`, {
    method: "PATCH",
    body: JSON.stringify({ status }),
  });
  return data.dispatch;
}

// --- HR ----------------------------------------------------------------

export interface StaffProfile {
  id: string;
  user_id: string;
  name: string;
  job_title: string;
  hourly_rate: string;
  has_bank_details: boolean;
}

export interface PayrollRun {
  id: string;
  period_start: string;
  period_end: string;
  created_at: string;
}

export interface Payslip {
  id: string;
  staff_name: string;
  hours_worked: string;
  gross_amount: string;
  net_amount: string;
}

export interface EligibleUser {
  id: string;
  name: string;
  role: string;
}

export async function fetchEligibleStaffUsers(): Promise<EligibleUser[]> {
  const data = await apiJson<{ users: EligibleUser[] }>("/api/hr/eligible-users");
  return data.users;
}

export async function fetchStaff(): Promise<StaffProfile[]> {
  const data = await apiJson<{ staff: StaffProfile[] }>("/api/hr/staff");
  return data.staff;
}

export async function createStaffProfile(input: {
  userId: string;
  jobTitle: string;
  hourlyRate: number;
}): Promise<void> {
  await apiJson("/api/hr/staff", { method: "POST", body: JSON.stringify(input) });
}

export async function addShift(input: { staffProfileId: string; startsAt: string; endsAt: string }): Promise<void> {
  await apiJson("/api/hr/shifts", { method: "POST", body: JSON.stringify(input) });
}

export async function fetchPayrollRuns(): Promise<PayrollRun[]> {
  const data = await apiJson<{ runs: PayrollRun[] }>("/api/hr/payroll-runs");
  return data.runs;
}

export async function runPayroll(input: { periodStart: string; periodEnd: string }): Promise<Payslip[]> {
  const data = await apiJson<{ payslips: Payslip[] }>("/api/hr/payroll-runs", {
    method: "POST",
    body: JSON.stringify(input),
  });
  return data.payslips;
}

export async function fetchPayslipsForRun(runId: string): Promise<Payslip[]> {
  const data = await apiJson<{ payslips: Payslip[] }>(`/api/hr/payroll-runs/${runId}/payslips`);
  return data.payslips;
}

// --- Telemedicine ------------------------------------------------------

export interface TelemedSession {
  id: string;
  appointment_id: string;
  room_token: string;
  status: string;
}

export async function createTelemedSession(appointmentId: string): Promise<TelemedSession> {
  const data = await apiJson<{ session: TelemedSession }>(`/api/telemed/appointments/${appointmentId}/session`, {
    method: "POST",
  });
  return data.session;
}

// --- AI doc assistant / no-show risk -------------------------------------

export async function draftClinicalNoteWithAi(encounterId: string): Promise<{ note: ClinicalNote; degraded: boolean }> {
  return apiJson(`/api/ai/doc-assistant/encounters/${encounterId}/draft-note`, { method: "POST" });
}

export interface NoShowRisk {
  appointmentId: string;
  probability: number;
  modelVersion: string;
  degraded: boolean;
}

export async function fetchNoShowRisk(appointmentId: string): Promise<NoShowRisk> {
  return apiJson(`/api/ai/noshow/appointments/${appointmentId}/risk`);
}

// --- Analytics -----------------------------------------------------------

export interface AnalyticsOverview {
  appointmentsByStatus: { status: string; count: number }[];
  appointmentVolumeByDay: { day: string; count: number }[];
  totalRevenue: number;
  outstandingRevenue: number;
  noShowRate: number;
}

export async function fetchAnalyticsOverview(): Promise<AnalyticsOverview> {
  const data = await apiJson<{ overview: AnalyticsOverview }>("/api/analytics/overview");
  return data.overview;
}

// --- MFA -----------------------------------------------------------------

export async function setupMfa(): Promise<{ secret: string; otpauthUrl: string }> {
  return apiJson("/api/identity/mfa/setup", { method: "POST" });
}

export async function verifyMfaSetup(code: string): Promise<{ mfaEnabled: boolean }> {
  return apiJson("/api/identity/mfa/verify", { method: "POST", body: JSON.stringify({ code }) });
}

// --- Audit log -------------------------------------------------------------

export interface AuditLogRow {
  id: string;
  occurred_at: string;
  actor_name: string | null;
  actor_role: string | null;
  action: string;
  resource_type: string;
  resource_id: string | null;
}

export async function fetchAuditLog(input: {
  resourceType?: string;
  action?: string;
  limit: number;
  offset: number;
}): Promise<{ rows: AuditLogRow[]; total: number }> {
  const params = new URLSearchParams();
  if (input.resourceType) params.set("resourceType", input.resourceType);
  if (input.action) params.set("action", input.action);
  params.set("limit", String(input.limit));
  params.set("offset", String(input.offset));
  return apiJson(`/api/audit/log?${params.toString()}`);
}
