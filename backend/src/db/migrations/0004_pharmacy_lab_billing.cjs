exports.shorthands = undefined;

exports.up = (pgm) => {
  pgm.sql(`CREATE TYPE dispense_status AS ENUM ('pending', 'dispensed', 'cancelled');`);
  pgm.sql(`CREATE TYPE lab_order_status AS ENUM ('ordered', 'sample_collected', 'in_progress', 'resulted', 'cancelled');`);
  pgm.sql(`CREATE TYPE invoice_status AS ENUM ('draft', 'issued', 'paid', 'overdue', 'cancelled');`);
  pgm.sql(`CREATE TYPE claim_status AS ENUM ('submitted', 'in_review', 'approved', 'denied', 'paid');`);
  pgm.sql(`CREATE TYPE payment_method AS ENUM ('cash', 'card', 'insurance');`);

  pgm.sql(`
    CREATE TABLE drugs (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      name TEXT NOT NULL,
      form TEXT,
      strength TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `);

  pgm.sql(`
    CREATE TABLE pharmacy_inventory (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      drug_id UUID NOT NULL REFERENCES drugs(id),
      batch_no TEXT NOT NULL,
      expiry_date DATE NOT NULL,
      quantity INT NOT NULL DEFAULT 0,
      reorder_threshold INT NOT NULL DEFAULT 10,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `);
  pgm.sql(`CREATE INDEX pharmacy_inventory_drug_idx ON pharmacy_inventory (drug_id);`);

  pgm.sql(`
    CREATE TABLE dispenses (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      medication_request_id UUID NOT NULL REFERENCES medication_requests(id),
      drug_id UUID NOT NULL REFERENCES drugs(id),
      quantity INT NOT NULL,
      status dispense_status NOT NULL DEFAULT 'pending',
      dispensed_by UUID REFERENCES users(id),
      dispensed_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `);
  pgm.sql(`
    CREATE TRIGGER dispenses_audit
    AFTER INSERT OR UPDATE OR DELETE ON dispenses
    FOR EACH ROW EXECUTE FUNCTION audit_trigger();
  `);

  pgm.sql(`
    CREATE TABLE lab_orders (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      patient_id UUID NOT NULL REFERENCES patients(id),
      encounter_id UUID REFERENCES encounters(id),
      ordered_by UUID NOT NULL REFERENCES users(id),
      test_code JSONB NOT NULL,
      status lab_order_status NOT NULL DEFAULT 'ordered',
      ordered_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `);
  pgm.sql(`CREATE INDEX lab_orders_patient_idx ON lab_orders (patient_id, ordered_at DESC);`);

  pgm.sql(`
    CREATE TABLE lab_samples (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      lab_order_id UUID NOT NULL REFERENCES lab_orders(id),
      collected_at TIMESTAMPTZ,
      collected_by UUID REFERENCES users(id),
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `);

  pgm.sql(`
    CREATE TABLE diagnostic_reports (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      lab_order_id UUID NOT NULL UNIQUE REFERENCES lab_orders(id),
      patient_id UUID NOT NULL REFERENCES patients(id),
      result_text TEXT,
      result_data JSONB,
      reported_by UUID NOT NULL REFERENCES users(id),
      reported_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `);
  pgm.sql(`CREATE INDEX diagnostic_reports_patient_idx ON diagnostic_reports (patient_id, reported_at DESC);`);
  pgm.sql(`
    CREATE TRIGGER diagnostic_reports_audit
    AFTER INSERT OR UPDATE OR DELETE ON diagnostic_reports
    FOR EACH ROW EXECUTE FUNCTION audit_trigger();
  `);

  pgm.sql(`
    CREATE TABLE invoices (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      patient_id UUID NOT NULL REFERENCES patients(id),
      encounter_id UUID REFERENCES encounters(id),
      status invoice_status NOT NULL DEFAULT 'issued',
      total_amount NUMERIC NOT NULL DEFAULT 0,
      created_by UUID NOT NULL REFERENCES users(id),
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `);
  pgm.sql(`CREATE INDEX invoices_patient_idx ON invoices (patient_id, created_at DESC);`);
  pgm.sql(`
    CREATE TRIGGER invoices_audit
    AFTER INSERT OR UPDATE OR DELETE ON invoices
    FOR EACH ROW EXECUTE FUNCTION audit_trigger();
  `);

  pgm.sql(`
    CREATE TABLE invoice_line_items (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      invoice_id UUID NOT NULL REFERENCES invoices(id),
      description TEXT NOT NULL,
      code TEXT,
      amount NUMERIC NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `);

  pgm.sql(`
    CREATE TABLE insurance_policies (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      patient_id UUID NOT NULL REFERENCES patients(id),
      payer_name TEXT NOT NULL,
      policy_number TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `);

  pgm.sql(`
    CREATE TABLE claims (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      invoice_id UUID NOT NULL REFERENCES invoices(id),
      insurance_policy_id UUID NOT NULL REFERENCES insurance_policies(id),
      status claim_status NOT NULL DEFAULT 'submitted',
      payer_response JSONB,
      submitted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `);

  pgm.sql(`
    CREATE TABLE payments (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      invoice_id UUID NOT NULL REFERENCES invoices(id),
      amount NUMERIC NOT NULL,
      method payment_method NOT NULL DEFAULT 'cash',
      paid_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `);
  pgm.sql(`
    CREATE TRIGGER payments_audit
    AFTER INSERT OR UPDATE OR DELETE ON payments
    FOR EACH ROW EXECUTE FUNCTION audit_trigger();
  `);

  // Small seed so pharmacy/lab flows have something to work with immediately.
  pgm.sql(`
    WITH d AS (
      INSERT INTO drugs (name, form, strength) VALUES
        ('Acetaminophen', 'tablet', '500mg'),
        ('Amoxicillin', 'capsule', '250mg'),
        ('Ibuprofen', 'tablet', '200mg')
      RETURNING id, name
    )
    INSERT INTO pharmacy_inventory (drug_id, batch_no, expiry_date, quantity, reorder_threshold)
    SELECT d.id, 'BATCH-' || left(d.id::text, 8), (now() + interval '1 year')::date, 100, 20
    FROM d;
  `);
};

exports.down = (pgm) => {
  pgm.sql(`DROP TABLE IF EXISTS payments;`);
  pgm.sql(`DROP TABLE IF EXISTS claims;`);
  pgm.sql(`DROP TABLE IF EXISTS insurance_policies;`);
  pgm.sql(`DROP TABLE IF EXISTS invoice_line_items;`);
  pgm.sql(`DROP TABLE IF EXISTS invoices;`);
  pgm.sql(`DROP TABLE IF EXISTS diagnostic_reports;`);
  pgm.sql(`DROP TABLE IF EXISTS lab_samples;`);
  pgm.sql(`DROP TABLE IF EXISTS lab_orders;`);
  pgm.sql(`DROP TABLE IF EXISTS dispenses;`);
  pgm.sql(`DROP TABLE IF EXISTS pharmacy_inventory;`);
  pgm.sql(`DROP TABLE IF EXISTS drugs;`);
  pgm.sql(`DROP TYPE IF EXISTS payment_method;`);
  pgm.sql(`DROP TYPE IF EXISTS claim_status;`);
  pgm.sql(`DROP TYPE IF EXISTS invoice_status;`);
  pgm.sql(`DROP TYPE IF EXISTS lab_order_status;`);
  pgm.sql(`DROP TYPE IF EXISTS dispense_status;`);
};
