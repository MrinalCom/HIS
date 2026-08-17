import crypto from "node:crypto";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { authenticator } from "otplib";
import { pool } from "../../config/db.js";
import { env } from "../../config/env.js";
import type { Role } from "./permissions.js";

export interface User {
  id: string;
  name: string;
  email: string;
  password_hash: string;
  role: Role;
  mfa_secret: string | null;
  mfa_enabled: boolean;
  is_active: boolean;
}

export interface SafeUser {
  id: string;
  name: string;
  email: string;
  role: Role;
  mfaEnabled: boolean;
}

export function sanitizeUser(user: User): SafeUser {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    mfaEnabled: user.mfa_enabled,
  };
}

export async function findUserByEmail(email: string): Promise<User | undefined> {
  const result = await pool.query<User>("SELECT * FROM users WHERE email = $1", [email]);
  return result.rows[0];
}

export async function findUserById(id: string): Promise<User | undefined> {
  const result = await pool.query<User>("SELECT * FROM users WHERE id = $1", [id]);
  return result.rows[0];
}

export async function registerUser(params: {
  name: string;
  email: string;
  password: string;
  role: Role;
}): Promise<User> {
  const passwordHash = await bcrypt.hash(params.password, 10);
  const result = await pool.query<User>(
    `INSERT INTO users (name, email, password_hash, role)
     VALUES ($1, $2, $3, $4)
     RETURNING *`,
    [params.name, params.email, passwordHash, params.role]
  );
  return result.rows[0];
}

export async function verifyPassword(user: User, password: string): Promise<boolean> {
  return bcrypt.compare(password, user.password_hash);
}

function accessToken(user: User, mfaVerified: boolean): string {
  return jwt.sign(
    { id: user.id, role: user.role, mfaVerified },
    env.jwtAccessSecret,
    // env.accessTokenTtl is a plain `"15m"`-shaped string, widened to
    // `string` by inference; jsonwebtoken's expiresIn wants a branded
    // StringValue TS can't verify a `string` matches -- same pre-existing
    // type gap as refreshToken() above.
    { expiresIn: env.accessTokenTtl as jwt.SignOptions["expiresIn"] }
  );
}

async function refreshToken(userId: string): Promise<string> {
  const jti = crypto.randomUUID();
  const token = jwt.sign({ id: userId, jti }, env.jwtRefreshSecret, {
    // A computed template string isn't assignable to jsonwebtoken's
    // StringValue-typed `expiresIn` (TS can't verify it matches "${number}d"
    // at compile time), so pass whole seconds instead -- pre-existing type
    // error unrelated to the Redis->SQL change above, fixed while touching
    // this function.
    expiresIn: env.refreshTokenTtlDays * 24 * 60 * 60,
  });
  await pool.query(
    `INSERT INTO refresh_tokens (jti, user_id, expires_at)
     VALUES ($1, $2, now() + ($3 || ' days')::interval)`,
    [jti, userId, env.refreshTokenTtlDays]
  );
  return token;
}

// Issues a full session (access + refresh). Callers must only invoke this once
// MFA is either not required (patient, or staff with mfa_enabled: false) or
// has just been verified via verifyTotp — the resulting token always carries
// mfaVerified: true.
export async function issueSession(user: User) {
  return {
    accessToken: accessToken(user, true),
    refreshTokenValue: await refreshToken(user.id),
  };
}

export function signMfaPendingToken(userId: string): string {
  return jwt.sign({ id: userId, stage: "mfa_pending" }, env.jwtAccessSecret, {
    expiresIn: "5m",
  });
}

export function verifyMfaPendingToken(token: string): string {
  const payload = jwt.verify(token, env.jwtAccessSecret) as { id: string; stage: string };
  if (payload.stage !== "mfa_pending") throw new Error("Not an MFA-pending token");
  return payload.id;
}

// Rotates the refresh token: the old jti is invalidated and a new one issued,
// so a stolen-but-unused refresh token can't be replayed after a legitimate
// refresh has happened.
export async function rotateRefreshToken(token: string) {
  const payload = jwt.verify(token, env.jwtRefreshSecret) as { id: string; jti: string };
  const stored = await pool.query<{ user_id: string }>(
    `SELECT user_id FROM refresh_tokens WHERE jti = $1 AND expires_at > now()`,
    [payload.jti]
  );
  const storedUserId = stored.rows[0]?.user_id;
  if (!storedUserId || storedUserId !== payload.id) {
    throw new Error("Refresh token revoked or expired");
  }
  await pool.query(`DELETE FROM refresh_tokens WHERE jti = $1`, [payload.jti]);
  const user = await findUserById(payload.id);
  if (!user || !user.is_active) throw new Error("User not found or inactive");
  return {
    user,
    newAccessToken: accessToken(user, true),
    newRefreshToken: await refreshToken(user.id),
  };
}

export async function revokeRefreshToken(token: string) {
  try {
    const payload = jwt.verify(token, env.jwtRefreshSecret) as { jti: string };
    await pool.query(`DELETE FROM refresh_tokens WHERE jti = $1`, [payload.jti]);
  } catch {
    // already invalid/expired — nothing to revoke
  }
}

export function generateMfaSecret(email: string) {
  const secret = authenticator.generateSecret();
  const otpauthUrl = authenticator.keyuri(email, "HIS", secret);
  return { secret, otpauthUrl };
}

export async function saveMfaSecret(userId: string, secret: string) {
  await pool.query("UPDATE users SET mfa_secret = $1 WHERE id = $2", [secret, userId]);
}

export async function enableMfa(userId: string) {
  await pool.query("UPDATE users SET mfa_enabled = true WHERE id = $1", [userId]);
}

export function verifyTotp(secret: string, code: string): boolean {
  return authenticator.verify({ token: code, secret });
}
