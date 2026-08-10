import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import { env } from "../config/env.js";
import { ROLE_CAPABILITIES, Role, Capability } from "../modules/identity/permissions.js";
import { findUserById } from "../modules/identity/service.js";

export interface AccessTokenPayload {
  id: string;
  role: Role;
  mfaVerified: boolean;
}

export interface AuthedRequest extends Request {
  user?: AccessTokenPayload;
}

export function requireAuth(req: AuthedRequest, res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  const token = header?.startsWith("Bearer ") ? header.slice(7) : undefined;
  if (!token) {
    return res.status(401).json({ error: "Missing auth token" });
  }
  try {
    const payload = jwt.verify(token, env.jwtAccessSecret) as AccessTokenPayload;
    req.user = payload;
    next();
  } catch {
    return res.status(401).json({ error: "Invalid or expired token" });
  }
}

// Decodes the token if present but never rejects — for endpoints that behave
// the same for anonymous and logged-in users (e.g. the pre-login triage chat),
// just with extra personalization when available.
export function optionalAuth(req: AuthedRequest, _res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  const token = header?.startsWith("Bearer ") ? header.slice(7) : undefined;
  if (token) {
    try {
      req.user = jwt.verify(token, env.jwtAccessSecret) as AccessTokenPayload;
    } catch {
      // ignore invalid token, treat as anonymous
    }
  }
  next();
}

export function requireRole(...roles: Role[]) {
  return (req: AuthedRequest, res: Response, next: NextFunction) => {
    if (!req.user || !roles.includes(req.user.role)) {
      return res.status(403).json({ error: "Insufficient permissions" });
    }
    next();
  };
}

// Every non-patient role must have completed TOTP MFA on this token before
// touching anything sensitive — enforced independent of which role it is.
export function requireMfaIfStaff(req: AuthedRequest, res: Response, next: NextFunction) {
  if (req.user && req.user.role !== "patient" && !req.user.mfaVerified) {
    return res.status(403).json({ error: "MFA verification required" });
  }
  next();
}

// Phase 6 hardening: the highest-sensitivity write actions (signing a note,
// dispensing medication, recording payments, touching payroll/bank details,
// admitting/discharging, dispatching an ambulance) additionally require the
// account to have MFA *enrolled*, checked live against the DB rather than
// trusted from the JWT — a staff member who never set up MFA is blocked here
// with a clear message, not silently waved through. requireMfaIfStaff above
// only checks the current token's step-up flag and is not itself a rollout
// of the "MFA required for sensitive actions" policy; this is.
export async function requireMfaEnrolled(req: AuthedRequest, res: Response, next: NextFunction) {
  if (!req.user || req.user.role === "patient") return next();
  const user = await findUserById(req.user.id);
  if (!user?.mfa_enabled) {
    return res.status(403).json({
      error: "This action requires multi-factor authentication. Set up MFA from your account settings first.",
    });
  }
  next();
}

export function requirePermission(capability: Capability) {
  return (req: AuthedRequest, res: Response, next: NextFunction) => {
    if (!req.user || !ROLE_CAPABILITIES[req.user.role].has(capability)) {
      return res.status(403).json({ error: "Insufficient permissions" });
    }
    next();
  };
}

// Generalizes RestroHub's inline "isStaff || own resource" checks into a
// reusable helper: allow if the user has one of the given roles, OR if
// resolveOwnerId(req) returns the current user's own id.
export function requireOwnershipOrRole(
  resolveOwnerId: (req: AuthedRequest) => string | undefined,
  ...roles: Role[]
) {
  return (req: AuthedRequest, res: Response, next: NextFunction) => {
    if (!req.user) return res.status(401).json({ error: "Missing auth token" });
    if (roles.includes(req.user.role)) return next();
    const ownerId = resolveOwnerId(req);
    if (ownerId && ownerId === req.user.id) return next();
    return res.status(403).json({ error: "Insufficient permissions" });
  };
}
