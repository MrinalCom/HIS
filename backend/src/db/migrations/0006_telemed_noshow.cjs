exports.shorthands = undefined;

exports.up = (pgm) => {
  pgm.sql(`CREATE TYPE telemed_status AS ENUM ('pending', 'active', 'ended');`);

  pgm.sql(`
    CREATE TABLE telemed_sessions (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      appointment_id UUID NOT NULL UNIQUE REFERENCES appointments(id),
      room_token TEXT NOT NULL,
      status telemed_status NOT NULL DEFAULT 'pending',
      started_at TIMESTAMPTZ,
      ended_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `);

  // Not written by triage/EHR routes — only by the no-show prediction path —
  // so no audit trigger needed (nothing PHI-sensitive beyond what's already
  // in appointments).
  pgm.sql(`
    CREATE TABLE noshow_predictions (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      appointment_id UUID NOT NULL REFERENCES appointments(id),
      predicted_probability NUMERIC NOT NULL,
      model_version TEXT NOT NULL,
      features_snapshot JSONB NOT NULL,
      degraded BOOLEAN NOT NULL DEFAULT false,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `);
  pgm.sql(`CREATE INDEX noshow_predictions_appointment_idx ON noshow_predictions (appointment_id, created_at DESC);`);
};

exports.down = (pgm) => {
  pgm.sql(`DROP TABLE IF EXISTS noshow_predictions;`);
  pgm.sql(`DROP TABLE IF EXISTS telemed_sessions;`);
  pgm.sql(`DROP TYPE IF EXISTS telemed_status;`);
};
