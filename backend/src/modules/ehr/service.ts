import { pool } from "../../config/db.js";

// FHIR-shaped coded value ({system, code, display}) used for diagnosis/medication
// codes below — kept in JSONB since it's genuinely nested/variable, never used
// where relational integrity or joins matter.
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
  created_at: string;
}

export interface CreateEncounterInput {
  patientId: string;
  practitionerId: string;
  appointmentId?: string;
  chiefComplaint?: string;
  encounterClass?: string;
}

export async function createEncounter(input: CreateEncounterInput): Promise<Encounter> {
  const result = await pool.query<Encounter>(
    `INSERT INTO encounters (patient_id, practitioner_id, appointment_id, chief_complaint, class)
     VALUES ($1, $2, $3, $4, COALESCE($5::encounter_class, 'ambulatory'))
     RETURNING *`,
    [
      input.patientId,
      input.practitionerId,
      input.appointmentId ?? null,
      input.chiefComplaint ?? null,
      input.encounterClass ?? null,
    ]
  );
  return result.rows[0];
}

export async function findEncounterByAppointmentId(appointmentId: string): Promise<Encounter | undefined> {
  const result = await pool.query<Encounter>("SELECT * FROM encounters WHERE appointment_id = $1", [
    appointmentId,
  ]);
  return result.rows[0];
}

export async function findEncounterById(id: string): Promise<Encounter | undefined> {
  const result = await pool.query<Encounter>("SELECT * FROM encounters WHERE id = $1", [id]);
  return result.rows[0];
}

export async function listEncountersForPatient(patientId: string): Promise<Encounter[]> {
  const result = await pool.query<Encounter>(
    "SELECT * FROM encounters WHERE patient_id = $1 ORDER BY period_start DESC",
    [patientId]
  );
  return result.rows;
}

export async function completeEncounter(id: string): Promise<Encounter | undefined> {
  const result = await pool.query<Encounter>(
    "UPDATE encounters SET status = 'finished', period_end = now() WHERE id = $1 RETURNING *",
    [id]
  );
  return result.rows[0];
}

export interface Observation {
  id: string;
  encounter_id: string;
  patient_id: string;
  category: string;
  code: CodeableConcept;
  value_text: string | null;
  value_numeric: string | null;
  unit: string | null;
  effective_at: string;
  recorded_by: string;
  created_at: string;
}

export async function addObservation(input: {
  encounterId: string;
  patientId: string;
  category?: string;
  code: CodeableConcept;
  valueText?: string;
  valueNumeric?: number;
  unit?: string;
  recordedBy: string;
}): Promise<Observation> {
  const result = await pool.query<Observation>(
    `INSERT INTO observations (encounter_id, patient_id, category, code, value_text, value_numeric, unit, recorded_by)
     VALUES ($1, $2, COALESCE($3::observation_category, 'vital-signs'), $4, $5, $6, $7, $8)
     RETURNING *`,
    [
      input.encounterId,
      input.patientId,
      input.category ?? null,
      JSON.stringify(input.code),
      input.valueText ?? null,
      input.valueNumeric ?? null,
      input.unit ?? null,
      input.recordedBy,
    ]
  );
  return result.rows[0];
}

export async function listObservationsForEncounter(encounterId: string): Promise<Observation[]> {
  const result = await pool.query<Observation>(
    "SELECT * FROM observations WHERE encounter_id = $1 ORDER BY effective_at",
    [encounterId]
  );
  return result.rows;
}

export async function listObservationsForPatient(patientId: string): Promise<Observation[]> {
  const result = await pool.query<Observation>(
    "SELECT * FROM observations WHERE patient_id = $1 ORDER BY effective_at DESC",
    [patientId]
  );
  return result.rows;
}

export interface Condition {
  id: string;
  patient_id: string;
  encounter_id: string | null;
  code: CodeableConcept;
  clinical_status: string;
  onset_date: string | null;
  recorded_by: string;
  created_at: string;
}

export async function addCondition(input: {
  patientId: string;
  encounterId?: string;
  code: CodeableConcept;
  clinicalStatus?: string;
  onsetDate?: string;
  recordedBy: string;
}): Promise<Condition> {
  const result = await pool.query<Condition>(
    `INSERT INTO conditions (patient_id, encounter_id, code, clinical_status, onset_date, recorded_by)
     VALUES ($1, $2, $3, COALESCE($4::condition_status, 'active'), $5, $6)
     RETURNING *`,
    [
      input.patientId,
      input.encounterId ?? null,
      JSON.stringify(input.code),
      input.clinicalStatus ?? null,
      input.onsetDate ?? null,
      input.recordedBy,
    ]
  );
  return result.rows[0];
}

export async function listConditionsForEncounter(encounterId: string): Promise<Condition[]> {
  const result = await pool.query<Condition>(
    "SELECT * FROM conditions WHERE encounter_id = $1 ORDER BY created_at",
    [encounterId]
  );
  return result.rows;
}

export async function listConditionsForPatient(patientId: string): Promise<Condition[]> {
  const result = await pool.query<Condition>(
    "SELECT * FROM conditions WHERE patient_id = $1 ORDER BY created_at DESC",
    [patientId]
  );
  return result.rows;
}

export interface AllergyIntolerance {
  id: string;
  patient_id: string;
  substance: string;
  reaction: string | null;
  severity: string | null;
  recorded_by: string;
  created_at: string;
}

export async function addAllergy(input: {
  patientId: string;
  substance: string;
  reaction?: string;
  severity?: string;
  recordedBy: string;
}): Promise<AllergyIntolerance> {
  const result = await pool.query<AllergyIntolerance>(
    `INSERT INTO allergy_intolerances (patient_id, substance, reaction, severity, recorded_by)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING *`,
    [input.patientId, input.substance, input.reaction ?? null, input.severity ?? null, input.recordedBy]
  );
  return result.rows[0];
}

export async function listAllergiesForPatient(patientId: string): Promise<AllergyIntolerance[]> {
  const result = await pool.query<AllergyIntolerance>(
    "SELECT * FROM allergy_intolerances WHERE patient_id = $1 ORDER BY created_at DESC",
    [patientId]
  );
  return result.rows;
}

export interface MedicationRequest {
  id: string;
  patient_id: string;
  encounter_id: string | null;
  medication_code: CodeableConcept;
  dosage_text: string;
  status: string;
  prescribed_by: string;
  created_at: string;
}

export async function addMedicationRequest(input: {
  patientId: string;
  encounterId?: string;
  medicationCode: CodeableConcept;
  dosageText: string;
  prescribedBy: string;
}): Promise<MedicationRequest> {
  const result = await pool.query<MedicationRequest>(
    `INSERT INTO medication_requests (patient_id, encounter_id, medication_code, dosage_text, prescribed_by)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING *`,
    [
      input.patientId,
      input.encounterId ?? null,
      JSON.stringify(input.medicationCode),
      input.dosageText,
      input.prescribedBy,
    ]
  );
  return result.rows[0];
}

export interface MedicationRequestWithPatient extends MedicationRequest {
  patient_first_name: string;
  patient_last_name: string;
  patient_mrn: string;
}

// Cross-module read for the pharmacy module — goes through this service
// export rather than pharmacy querying medication_requests directly, keeping
// the "only touch another module's tables through its service.ts" rule.
export async function listActiveMedicationRequests(): Promise<MedicationRequestWithPatient[]> {
  const result = await pool.query<MedicationRequestWithPatient>(
    `SELECT mr.*, p.first_name AS patient_first_name, p.last_name AS patient_last_name, p.mrn AS patient_mrn
     FROM medication_requests mr
     JOIN patients p ON p.id = mr.patient_id
     WHERE mr.status = 'active'
     ORDER BY mr.created_at ASC`
  );
  return result.rows;
}

export async function setMedicationRequestStatus(id: string, status: string): Promise<MedicationRequest | undefined> {
  const result = await pool.query<MedicationRequest>(
    "UPDATE medication_requests SET status = $1::medication_status WHERE id = $2 RETURNING *",
    [status, id]
  );
  return result.rows[0];
}

export async function listMedicationsForEncounter(encounterId: string): Promise<MedicationRequest[]> {
  const result = await pool.query<MedicationRequest>(
    "SELECT * FROM medication_requests WHERE encounter_id = $1 ORDER BY created_at",
    [encounterId]
  );
  return result.rows;
}

export async function listMedicationsForPatient(patientId: string): Promise<MedicationRequest[]> {
  const result = await pool.query<MedicationRequest>(
    "SELECT * FROM medication_requests WHERE patient_id = $1 ORDER BY created_at DESC",
    [patientId]
  );
  return result.rows;
}

export interface ClinicalNote {
  id: string;
  encounter_id: string;
  patient_id: string;
  note_type: string;
  content: string;
  ai_generated: boolean;
  ai_reviewed_by: string | null;
  status: string;
  authored_by: string;
  signed_at: string | null;
  created_at: string;
}

export async function createClinicalNote(input: {
  encounterId: string;
  patientId: string;
  noteType?: string;
  content: string;
  aiGenerated?: boolean;
  authoredBy: string;
}): Promise<ClinicalNote> {
  const result = await pool.query<ClinicalNote>(
    `INSERT INTO clinical_notes (encounter_id, patient_id, note_type, content, ai_generated, authored_by)
     VALUES ($1, $2, COALESCE($3::note_type, 'progress'), $4, COALESCE($5, false), $6)
     RETURNING *`,
    [
      input.encounterId,
      input.patientId,
      input.noteType ?? null,
      input.content,
      input.aiGenerated ?? null,
      input.authoredBy,
    ]
  );
  return result.rows[0];
}

export async function findNoteById(id: string): Promise<ClinicalNote | undefined> {
  const result = await pool.query<ClinicalNote>("SELECT * FROM clinical_notes WHERE id = $1", [id]);
  return result.rows[0];
}

// Hard rule from the compliance checklist: an AI-drafted note is never
// auto-signed. This is the only path that flips status to 'signed', and it
// always records who signed it — called from a route gated on notes:sign
// plus an ownership check (the signing doctor must own the encounter).
export async function signClinicalNote(id: string, signedBy: string): Promise<ClinicalNote | undefined> {
  const result = await pool.query<ClinicalNote>(
    `UPDATE clinical_notes
     SET status = 'signed', signed_at = now(), ai_reviewed_by = CASE WHEN ai_generated THEN $2 ELSE ai_reviewed_by END
     WHERE id = $1
     RETURNING *`,
    [id, signedBy]
  );
  return result.rows[0];
}

export async function listNotesForPatient(patientId: string, onlySigned: boolean): Promise<ClinicalNote[]> {
  const clause = onlySigned ? "AND status = 'signed'" : "";
  const result = await pool.query<ClinicalNote>(
    `SELECT * FROM clinical_notes WHERE patient_id = $1 ${clause} ORDER BY created_at DESC`,
    [patientId]
  );
  return result.rows;
}

export interface PatientSummary {
  conditions: Condition[];
  allergies: AllergyIntolerance[];
  medications: MedicationRequest[];
  observations: Observation[];
  notes: ClinicalNote[];
  encounters: Encounter[];
}

export async function getPatientSummary(patientId: string, onlySignedNotes: boolean): Promise<PatientSummary> {
  const [conditions, allergies, medications, observations, notes, encounters] = await Promise.all([
    listConditionsForPatient(patientId),
    listAllergiesForPatient(patientId),
    listMedicationsForPatient(patientId),
    listObservationsForPatient(patientId),
    listNotesForPatient(patientId, onlySignedNotes),
    listEncountersForPatient(patientId),
  ]);
  return { conditions, allergies, medications, observations, notes, encounters };
}
