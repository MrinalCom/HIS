exports.shorthands = undefined;

exports.up = (pgm) => {
  pgm.sql(`CREATE TYPE bed_status AS ENUM ('available', 'occupied', 'cleaning', 'maintenance');`);
  pgm.sql(`CREATE TYPE admission_status AS ENUM ('admitted', 'discharged');`);
  pgm.sql(`CREATE TYPE vehicle_status AS ENUM ('available', 'dispatched');`);
  pgm.sql(`CREATE TYPE dispatch_status AS ENUM ('dispatched', 'en_route', 'arrived', 'completed', 'cancelled');`);

  pgm.sql(`
    CREATE TABLE wards (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      name TEXT NOT NULL UNIQUE,
      department_id UUID REFERENCES departments(id),
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `);

  pgm.sql(`
    CREATE TABLE beds (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      ward_id UUID NOT NULL REFERENCES wards(id),
      label TEXT NOT NULL,
      status bed_status NOT NULL DEFAULT 'available',
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `);
  pgm.sql(`CREATE INDEX beds_ward_idx ON beds (ward_id);`);

  pgm.sql(`
    CREATE TABLE admissions (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      patient_id UUID NOT NULL REFERENCES patients(id),
      bed_id UUID NOT NULL REFERENCES beds(id),
      encounter_id UUID REFERENCES encounters(id),
      admitted_by UUID NOT NULL REFERENCES users(id),
      status admission_status NOT NULL DEFAULT 'admitted',
      admitted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      discharged_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `);
  pgm.sql(`CREATE INDEX admissions_patient_idx ON admissions (patient_id);`);
  pgm.sql(`
    CREATE TRIGGER admissions_audit
    AFTER INSERT OR UPDATE OR DELETE ON admissions
    FOR EACH ROW EXECUTE FUNCTION audit_trigger();
  `);

  pgm.sql(`
    CREATE TABLE ambulance_vehicles (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      call_sign TEXT NOT NULL UNIQUE,
      status vehicle_status NOT NULL DEFAULT 'available',
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `);

  // lat/lng are simulator-generated, not a real GPS feed — see the
  // scope-trim list in docs/compliance-checklist.md.
  pgm.sql(`
    CREATE TABLE ambulance_dispatches (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      vehicle_id UUID NOT NULL REFERENCES ambulance_vehicles(id),
      patient_id UUID REFERENCES patients(id),
      requested_by UUID NOT NULL REFERENCES users(id),
      pickup_location TEXT NOT NULL,
      status dispatch_status NOT NULL DEFAULT 'dispatched',
      lat NUMERIC,
      lng NUMERIC,
      requested_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      completed_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `);

  pgm.sql(`
    CREATE TABLE staff_profiles (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id UUID NOT NULL UNIQUE REFERENCES users(id),
      department_id UUID REFERENCES departments(id),
      job_title TEXT NOT NULL,
      hourly_rate NUMERIC NOT NULL DEFAULT 0,
      bank_details_enc BYTEA,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `);

  pgm.sql(`
    CREATE TABLE shifts (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      staff_profile_id UUID NOT NULL REFERENCES staff_profiles(id),
      starts_at TIMESTAMPTZ NOT NULL,
      ends_at TIMESTAMPTZ NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `);
  pgm.sql(`CREATE INDEX shifts_staff_idx ON shifts (staff_profile_id, starts_at);`);

  pgm.sql(`
    CREATE TABLE payroll_runs (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      period_start DATE NOT NULL,
      period_end DATE NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `);

  pgm.sql(`
    CREATE TABLE payslips (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      payroll_run_id UUID NOT NULL REFERENCES payroll_runs(id),
      staff_profile_id UUID NOT NULL REFERENCES staff_profiles(id),
      hours_worked NUMERIC NOT NULL DEFAULT 0,
      gross_amount NUMERIC NOT NULL DEFAULT 0,
      net_amount NUMERIC NOT NULL DEFAULT 0,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `);

  // Small seed: two wards with a handful of beds, three ambulances.
  pgm.sql(`
    WITH w AS (
      INSERT INTO wards (name) VALUES ('General Ward'), ('ICU')
      RETURNING id, name
    )
    INSERT INTO beds (ward_id, label)
    SELECT w.id, w.name || ' - Bed ' || n
    FROM w, generate_series(1, 4) AS n;
  `);
  pgm.sql(`
    INSERT INTO ambulance_vehicles (call_sign) VALUES ('AMB-1'), ('AMB-2'), ('AMB-3');
  `);
};

exports.down = (pgm) => {
  pgm.sql(`DROP TABLE IF EXISTS payslips;`);
  pgm.sql(`DROP TABLE IF EXISTS payroll_runs;`);
  pgm.sql(`DROP TABLE IF EXISTS shifts;`);
  pgm.sql(`DROP TABLE IF EXISTS staff_profiles;`);
  pgm.sql(`DROP TABLE IF EXISTS ambulance_dispatches;`);
  pgm.sql(`DROP TABLE IF EXISTS ambulance_vehicles;`);
  pgm.sql(`DROP TABLE IF EXISTS admissions;`);
  pgm.sql(`DROP TABLE IF EXISTS beds;`);
  pgm.sql(`DROP TABLE IF EXISTS wards;`);
  pgm.sql(`DROP TYPE IF EXISTS dispatch_status;`);
  pgm.sql(`DROP TYPE IF EXISTS vehicle_status;`);
  pgm.sql(`DROP TYPE IF EXISTS admission_status;`);
  pgm.sql(`DROP TYPE IF EXISTS bed_status;`);
};
