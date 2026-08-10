exports.shorthands = undefined;

exports.up = (pgm) => {
  pgm.sql(`CREATE TYPE gender AS ENUM ('female', 'male', 'other', 'unknown');`);
  pgm.sql(`
    CREATE TYPE blood_type AS ENUM (
      'A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-', 'unknown'
    );
  `);
  pgm.sql(`CREATE TYPE location_type AS ENUM ('room', 'ward', 'bed', 'building');`);
  pgm.sql(`
    CREATE TYPE appointment_status AS ENUM (
      'proposed', 'booked', 'arrived', 'fulfilled', 'cancelled', 'noshow'
    );
  `);
  pgm.sql(`CREATE TYPE appointment_type AS ENUM ('in_person', 'telemedicine');`);
  pgm.sql(`CREATE TYPE created_via AS ENUM ('manual', 'ai_concierge');`);

  pgm.sql(`CREATE SEQUENCE mrn_seq START 1000;`);

  pgm.sql(`
    CREATE TABLE patients (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id UUID NOT NULL UNIQUE REFERENCES users(id),
      mrn TEXT NOT NULL UNIQUE DEFAULT ('MRN-' || lpad(nextval('mrn_seq')::TEXT, 6, '0')),
      first_name TEXT NOT NULL,
      last_name TEXT NOT NULL,
      dob DATE NOT NULL,
      gender gender NOT NULL DEFAULT 'unknown',
      blood_type blood_type NOT NULL DEFAULT 'unknown',
      address JSONB,
      phone TEXT,
      emergency_contact JSONB,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `);
  // Defense-in-depth audit trigger on a sensitive table — see
  // docs/compliance-checklist.md and the audit_trigger() function defined in
  // 0001_identity.cjs.
  pgm.sql(`
    CREATE TRIGGER patients_audit
    AFTER INSERT OR UPDATE OR DELETE ON patients
    FOR EACH ROW EXECUTE FUNCTION audit_trigger();
  `);

  pgm.sql(`
    CREATE TABLE departments (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      name TEXT NOT NULL UNIQUE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `);

  pgm.sql(`
    CREATE TABLE practitioners (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id UUID NOT NULL UNIQUE REFERENCES users(id),
      specialty TEXT NOT NULL,
      department_id UUID REFERENCES departments(id),
      license_number TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `);

  pgm.sql(`
    CREATE TABLE locations (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      name TEXT NOT NULL,
      type location_type NOT NULL,
      parent_location_id UUID REFERENCES locations(id),
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `);

  pgm.sql(`
    CREATE TABLE healthcare_services (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      department_id UUID NOT NULL REFERENCES departments(id),
      name TEXT NOT NULL,
      duration_minutes INT NOT NULL DEFAULT 30,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `);

  pgm.sql(`
    CREATE TABLE appointments (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      patient_id UUID NOT NULL REFERENCES patients(id),
      practitioner_id UUID NOT NULL REFERENCES practitioners(id),
      healthcare_service_id UUID NOT NULL REFERENCES healthcare_services(id),
      location_id UUID REFERENCES locations(id),
      scheduled_start TIMESTAMPTZ NOT NULL,
      scheduled_end TIMESTAMPTZ NOT NULL,
      status appointment_status NOT NULL DEFAULT 'booked',
      appointment_type appointment_type NOT NULL DEFAULT 'in_person',
      reason_code JSONB,
      created_via created_via NOT NULL DEFAULT 'manual',
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `);
  pgm.sql(`CREATE INDEX appointments_practitioner_idx ON appointments (practitioner_id, scheduled_start);`);
  pgm.sql(`CREATE INDEX appointments_patient_idx ON appointments (patient_id, scheduled_start);`);

  // Small reference dataset so booking has something to book against out of
  // the box — not meant to be exhaustive, just enough to demo end to end.
  pgm.sql(`
    WITH dept AS (
      INSERT INTO departments (name) VALUES
        ('General Medicine'), ('Cardiology'), ('Pediatrics'), ('Orthopedics')
      RETURNING id, name
    )
    INSERT INTO healthcare_services (department_id, name, duration_minutes)
    SELECT dept.id, svc.name, svc.duration
    FROM dept
    JOIN (VALUES
      ('General Medicine', 'General Consultation', 30),
      ('General Medicine', 'Annual Physical', 45),
      ('Cardiology', 'Cardiology Consultation', 30),
      ('Cardiology', 'ECG', 20),
      ('Pediatrics', 'Pediatric Checkup', 30),
      ('Orthopedics', 'Orthopedic Consultation', 30)
    ) AS svc(dept_name, name, duration) ON svc.dept_name = dept.name;
  `);
};

exports.down = (pgm) => {
  pgm.sql(`DROP TABLE IF EXISTS appointments;`);
  pgm.sql(`DROP TABLE IF EXISTS healthcare_services;`);
  pgm.sql(`DROP TABLE IF EXISTS locations;`);
  pgm.sql(`DROP TABLE IF EXISTS practitioners;`);
  pgm.sql(`DROP TABLE IF EXISTS departments;`);
  pgm.sql(`DROP TRIGGER IF EXISTS patients_audit ON patients;`);
  pgm.sql(`DROP TABLE IF EXISTS patients;`);
  pgm.sql(`DROP SEQUENCE IF EXISTS mrn_seq;`);
  pgm.sql(`DROP TYPE IF EXISTS created_via;`);
  pgm.sql(`DROP TYPE IF EXISTS appointment_type;`);
  pgm.sql(`DROP TYPE IF EXISTS appointment_status;`);
  pgm.sql(`DROP TYPE IF EXISTS location_type;`);
  pgm.sql(`DROP TYPE IF EXISTS blood_type;`);
  pgm.sql(`DROP TYPE IF EXISTS gender;`);
};
