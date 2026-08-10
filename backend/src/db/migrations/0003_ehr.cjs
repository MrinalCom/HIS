exports.shorthands = undefined;

exports.up = (pgm) => {
  pgm.sql(`CREATE TYPE encounter_status AS ENUM ('planned', 'in_progress', 'finished', 'cancelled');`);
  pgm.sql(`CREATE TYPE encounter_class AS ENUM ('ambulatory', 'emergency', 'inpatient', 'virtual');`);
  pgm.sql(`CREATE TYPE observation_category AS ENUM ('vital-signs', 'laboratory', 'exam');`);
  pgm.sql(`CREATE TYPE condition_status AS ENUM ('active', 'resolved', 'inactive');`);
  pgm.sql(`CREATE TYPE medication_status AS ENUM ('active', 'completed', 'cancelled', 'stopped');`);
  pgm.sql(`CREATE TYPE note_type AS ENUM ('progress', 'discharge_summary', 'ai_draft');`);
  pgm.sql(`CREATE TYPE note_status AS ENUM ('draft', 'signed');`);
  pgm.sql(`CREATE TYPE consent_type AS ENUM ('treatment', 'data_processing', 'telemedicine');`);
  pgm.sql(`CREATE TYPE triage_action AS ENUM ('self_care', 'book_appointment', 'urgent_care', 'emergency');`);

  pgm.sql(`
    CREATE TABLE encounters (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      patient_id UUID NOT NULL REFERENCES patients(id),
      practitioner_id UUID NOT NULL REFERENCES practitioners(id),
      appointment_id UUID UNIQUE REFERENCES appointments(id),
      status encounter_status NOT NULL DEFAULT 'in_progress',
      class encounter_class NOT NULL DEFAULT 'ambulatory',
      chief_complaint TEXT,
      period_start TIMESTAMPTZ NOT NULL DEFAULT now(),
      period_end TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `);
  pgm.sql(`CREATE INDEX encounters_patient_idx ON encounters (patient_id, period_start DESC);`);

  pgm.sql(`
    CREATE TABLE observations (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      encounter_id UUID NOT NULL REFERENCES encounters(id),
      patient_id UUID NOT NULL REFERENCES patients(id),
      category observation_category NOT NULL DEFAULT 'vital-signs',
      code JSONB NOT NULL,
      value_text TEXT,
      value_numeric NUMERIC,
      unit TEXT,
      effective_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      recorded_by UUID NOT NULL REFERENCES users(id),
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `);
  pgm.sql(`CREATE INDEX observations_patient_idx ON observations (patient_id, effective_at DESC);`);
  pgm.sql(`
    CREATE TRIGGER observations_audit
    AFTER INSERT OR UPDATE OR DELETE ON observations
    FOR EACH ROW EXECUTE FUNCTION audit_trigger();
  `);

  pgm.sql(`
    CREATE TABLE conditions (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      patient_id UUID NOT NULL REFERENCES patients(id),
      encounter_id UUID REFERENCES encounters(id),
      code JSONB NOT NULL,
      clinical_status condition_status NOT NULL DEFAULT 'active',
      onset_date DATE,
      recorded_by UUID NOT NULL REFERENCES users(id),
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `);
  pgm.sql(`CREATE INDEX conditions_patient_idx ON conditions (patient_id, created_at DESC);`);
  pgm.sql(`
    CREATE TRIGGER conditions_audit
    AFTER INSERT OR UPDATE OR DELETE ON conditions
    FOR EACH ROW EXECUTE FUNCTION audit_trigger();
  `);

  pgm.sql(`
    CREATE TABLE allergy_intolerances (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      patient_id UUID NOT NULL REFERENCES patients(id),
      substance TEXT NOT NULL,
      reaction TEXT,
      severity TEXT,
      recorded_by UUID NOT NULL REFERENCES users(id),
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `);
  pgm.sql(`CREATE INDEX allergies_patient_idx ON allergy_intolerances (patient_id);`);

  pgm.sql(`
    CREATE TABLE medication_requests (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      patient_id UUID NOT NULL REFERENCES patients(id),
      encounter_id UUID REFERENCES encounters(id),
      medication_code JSONB NOT NULL,
      dosage_text TEXT NOT NULL,
      status medication_status NOT NULL DEFAULT 'active',
      prescribed_by UUID NOT NULL REFERENCES users(id),
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `);
  pgm.sql(`CREATE INDEX medication_requests_patient_idx ON medication_requests (patient_id, created_at DESC);`);
  pgm.sql(`
    CREATE TRIGGER medication_requests_audit
    AFTER INSERT OR UPDATE OR DELETE ON medication_requests
    FOR EACH ROW EXECUTE FUNCTION audit_trigger();
  `);

  pgm.sql(`
    CREATE TABLE clinical_notes (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      encounter_id UUID NOT NULL REFERENCES encounters(id),
      patient_id UUID NOT NULL REFERENCES patients(id),
      note_type note_type NOT NULL DEFAULT 'progress',
      content TEXT NOT NULL,
      ai_generated BOOLEAN NOT NULL DEFAULT false,
      ai_reviewed_by UUID REFERENCES users(id),
      status note_status NOT NULL DEFAULT 'draft',
      authored_by UUID NOT NULL REFERENCES users(id),
      signed_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `);
  pgm.sql(`CREATE INDEX clinical_notes_patient_idx ON clinical_notes (patient_id, created_at DESC);`);
  pgm.sql(`
    CREATE TRIGGER clinical_notes_audit
    AFTER INSERT OR UPDATE OR DELETE ON clinical_notes
    FOR EACH ROW EXECUTE FUNCTION audit_trigger();
  `);

  pgm.sql(`
    CREATE TABLE consents (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      patient_id UUID NOT NULL REFERENCES patients(id),
      consent_type consent_type NOT NULL,
      granted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      revoked_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `);
  pgm.sql(`CREATE INDEX consents_patient_idx ON consents (patient_id);`);

  // AI support tables are deliberately walled off from the clinical tables
  // above: a triage session or concierge exchange never writes directly into
  // conditions/observations/appointments-adjacent records, since both are
  // advisory (triage) or best-effort automation (concierge) rather than
  // part of the permanent chart.
  pgm.sql(`
    CREATE TABLE ai_triage_sessions (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      patient_id UUID REFERENCES patients(id),
      session_data JSONB NOT NULL,
      red_flags JSONB NOT NULL DEFAULT '[]',
      recommended_action triage_action NOT NULL,
      disclaimer_shown BOOLEAN NOT NULL DEFAULT true,
      degraded BOOLEAN NOT NULL DEFAULT false,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `);

  pgm.sql(`
    CREATE TABLE ai_concierge_logs (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      patient_id UUID REFERENCES patients(id),
      message TEXT NOT NULL,
      reply TEXT NOT NULL,
      degraded BOOLEAN NOT NULL DEFAULT false,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `);
};

exports.down = (pgm) => {
  pgm.sql(`DROP TABLE IF EXISTS ai_concierge_logs;`);
  pgm.sql(`DROP TABLE IF EXISTS ai_triage_sessions;`);
  pgm.sql(`DROP TABLE IF EXISTS consents;`);
  pgm.sql(`DROP TRIGGER IF EXISTS clinical_notes_audit ON clinical_notes;`);
  pgm.sql(`DROP TABLE IF EXISTS clinical_notes;`);
  pgm.sql(`DROP TRIGGER IF EXISTS medication_requests_audit ON medication_requests;`);
  pgm.sql(`DROP TABLE IF EXISTS medication_requests;`);
  pgm.sql(`DROP TABLE IF EXISTS allergy_intolerances;`);
  pgm.sql(`DROP TRIGGER IF EXISTS conditions_audit ON conditions;`);
  pgm.sql(`DROP TABLE IF EXISTS conditions;`);
  pgm.sql(`DROP TRIGGER IF EXISTS observations_audit ON observations;`);
  pgm.sql(`DROP TABLE IF EXISTS observations;`);
  pgm.sql(`DROP TABLE IF EXISTS encounters;`);
  pgm.sql(`DROP TYPE IF EXISTS triage_action;`);
  pgm.sql(`DROP TYPE IF EXISTS consent_type;`);
  pgm.sql(`DROP TYPE IF EXISTS note_status;`);
  pgm.sql(`DROP TYPE IF EXISTS note_type;`);
  pgm.sql(`DROP TYPE IF EXISTS medication_status;`);
  pgm.sql(`DROP TYPE IF EXISTS condition_status;`);
  pgm.sql(`DROP TYPE IF EXISTS observation_category;`);
  pgm.sql(`DROP TYPE IF EXISTS encounter_class;`);
  pgm.sql(`DROP TYPE IF EXISTS encounter_status;`);
};
