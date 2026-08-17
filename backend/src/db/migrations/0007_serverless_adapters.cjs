exports.shorthands = undefined;

exports.up = (pgm) => {
  // Backing table for @socket.io/postgres-adapter: lets multiple serverless
  // function instances share Socket.IO room membership/broadcasts via
  // Postgres LISTEN/NOTIFY (replaces the in-memory default when deploying
  // to Vercel, where there's no single long-lived process).
  pgm.sql(`
    CREATE TABLE IF NOT EXISTS socket_io_attachments (
      id         bigint GENERATED ALWAYS AS IDENTITY,
      created_at timestamptz DEFAULT NOW(),
      payload    bytea
    );
  `);

  // Replaces the Redis-backed refresh-token store (identity/service.ts) --
  // this project already has Postgres, so no separate Redis dependency is
  // needed for what's a small, low-write-volume table.
  pgm.sql(`
    CREATE TABLE IF NOT EXISTS refresh_tokens (
      jti        UUID PRIMARY KEY,
      user_id    UUID NOT NULL,
      expires_at TIMESTAMPTZ NOT NULL
    );
  `);
};
