/* eslint-disable @typescript-eslint/no-var-requires */
exports.shorthands = undefined;

exports.up = (pgm) => {
  pgm.sql(`CREATE EXTENSION IF NOT EXISTS pgcrypto;`);

  pgm.sql(`
    CREATE TYPE user_role AS ENUM (
      'patient', 'doctor', 'nurse', 'pharmacist', 'lab_tech',
      'receptionist', 'billing_clerk', 'admin'
    );
  `);

  pgm.sql(`
    CREATE TYPE audit_action AS ENUM (
      'create', 'read', 'update', 'delete', 'login', 'login_failed', 'export'
    );
  `);

  pgm.sql(`
    CREATE TABLE users (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      name TEXT NOT NULL,
      email TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      role user_role NOT NULL DEFAULT 'patient',
      mfa_secret TEXT,
      mfa_enabled BOOLEAN NOT NULL DEFAULT false,
      is_active BOOLEAN NOT NULL DEFAULT true,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `);

  pgm.sql(`
    CREATE TABLE audit_log (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      occurred_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      actor_user_id UUID REFERENCES users(id),
      actor_role user_role,
      action audit_action NOT NULL,
      resource_type TEXT NOT NULL,
      resource_id TEXT,
      before_state JSONB,
      after_state JSONB,
      ip_address INET,
      user_agent TEXT
    );
  `);
  pgm.sql(`CREATE INDEX audit_log_actor_idx ON audit_log (actor_user_id, occurred_at DESC);`);
  pgm.sql(`CREATE INDEX audit_log_resource_idx ON audit_log (resource_type, resource_id);`);

  // Generic defense-in-depth trigger, attached to specific sensitive tables as
  // those tables are created in later migrations (patients, clinical_notes, etc).
  pgm.sql(`
    CREATE OR REPLACE FUNCTION audit_trigger() RETURNS TRIGGER AS $$
    DECLARE
      v_actor UUID;
    BEGIN
      BEGIN
        v_actor := current_setting('his.actor_user_id', true)::UUID;
      EXCEPTION WHEN OTHERS THEN
        v_actor := NULL;
      END;

      IF TG_OP = 'INSERT' THEN
        INSERT INTO audit_log (actor_user_id, action, resource_type, resource_id, after_state)
        VALUES (v_actor, 'create', TG_TABLE_NAME, NEW.id::TEXT, to_jsonb(NEW));
        RETURN NEW;
      ELSIF TG_OP = 'UPDATE' THEN
        INSERT INTO audit_log (actor_user_id, action, resource_type, resource_id, before_state, after_state)
        VALUES (v_actor, 'update', TG_TABLE_NAME, NEW.id::TEXT, to_jsonb(OLD), to_jsonb(NEW));
        RETURN NEW;
      ELSIF TG_OP = 'DELETE' THEN
        INSERT INTO audit_log (actor_user_id, action, resource_type, resource_id, before_state)
        VALUES (v_actor, 'delete', TG_TABLE_NAME, OLD.id::TEXT, to_jsonb(OLD));
        RETURN OLD;
      END IF;
      RETURN NULL;
    END;
    $$ LANGUAGE plpgsql;
  `);

  // Least-privilege runtime role: the app connects as his_app, which can never
  // run DDL and can never UPDATE/DELETE audit_log (enforced as a DB privilege,
  // not just application convention — see docs/compliance-checklist.md).
  const appPassword = process.env.HIS_APP_DB_PASSWORD || 'his_app_dev_password';
  pgm.sql(`
    DO $$
    BEGIN
      CREATE ROLE his_app LOGIN PASSWORD '${appPassword}';
    EXCEPTION WHEN duplicate_object THEN
      NULL;
    END
    $$;
  `);

  // CONNECT is granted to PUBLIC by default on new databases, so his_app already
  // has it; only schema/table/sequence privileges need to be set explicitly.
  pgm.sql(`GRANT USAGE ON SCHEMA public TO his_app;`);
  pgm.sql(`GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO his_app;`);
  pgm.sql(`GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO his_app;`);

  // Future tables created by the migrator get the same default grants
  // automatically, so later-phase migrations don't need to repeat this.
  pgm.sql(`
    ALTER DEFAULT PRIVILEGES IN SCHEMA public
    GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO his_app;
  `);
  pgm.sql(`
    ALTER DEFAULT PRIVILEGES IN SCHEMA public
    GRANT USAGE, SELECT ON SEQUENCES TO his_app;
  `);

  // WORM: narrow audit_log back down after the broad grant above.
  pgm.sql(`REVOKE UPDATE, DELETE ON audit_log FROM his_app;`);
};

exports.down = (pgm) => {
  pgm.sql(`DROP FUNCTION IF EXISTS audit_trigger();`);
  pgm.sql(`DROP TABLE IF EXISTS audit_log;`);
  pgm.sql(`DROP TABLE IF EXISTS users;`);
  pgm.sql(`DROP TYPE IF EXISTS audit_action;`);
  pgm.sql(`DROP TYPE IF EXISTS user_role;`);
};
