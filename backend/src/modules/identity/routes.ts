import { Router } from "express";
import { z } from "zod";
import { requireAuth, AuthedRequest } from "../../middleware/auth.js";
import { authRateLimiter } from "../../middleware/rateLimit.js";
import { recordAudit } from "../audit/service.js";
import { ROLES } from "./permissions.js";
import {
  findUserByEmail,
  findUserById,
  registerUser,
  verifyPassword,
  sanitizeUser,
  issueSession,
  signMfaPendingToken,
  verifyMfaPendingToken,
  rotateRefreshToken,
  revokeRefreshToken,
  generateMfaSecret,
  saveMfaSecret,
  enableMfa,
  verifyTotp,
} from "./service.js";

export const identityRouter = Router();

const REFRESH_COOKIE = "his_refresh";
const REFRESH_COOKIE_OPTS = {
  httpOnly: true,
  sameSite: "lax" as const,
  secure: process.env.NODE_ENV === "production",
  path: "/api/identity",
  maxAge: 7 * 24 * 60 * 60 * 1000,
};

const registerSchema = z.object({
  name: z.string().min(1),
  email: z.string().email(),
  password: z.string().min(8),
  role: z.enum(ROLES as [string, ...string[]]).optional().default("patient"),
});

identityRouter.post("/register", authRateLimiter, async (req, res) => {
  const parsed = registerSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }
  const { name, email, password, role } = parsed.data;

  const existing = await findUserByEmail(email);
  if (existing) {
    return res.status(409).json({ error: "Email already registered" });
  }

  const user = await registerUser({ name, email, password, role: role as any });
  const session = await issueSession(user);
  res.cookie(REFRESH_COOKIE, session.refreshTokenValue, REFRESH_COOKIE_OPTS);
  await recordAudit({
    actorUserId: user.id,
    actorRole: user.role,
    action: "login",
    resourceType: "auth",
    resourceId: user.id,
    ipAddress: req.ip,
    userAgent: req.headers["user-agent"],
  });
  res.status(201).json({ user: sanitizeUser(user), accessToken: session.accessToken });
});

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string(),
});

identityRouter.post("/login", authRateLimiter, async (req, res) => {
  const parsed = loginSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }
  const { email, password } = parsed.data;

  const user = await findUserByEmail(email);
  const valid = user ? await verifyPassword(user, password) : false;
  if (!user || !valid || !user.is_active) {
    await recordAudit({
      action: "login_failed",
      resourceType: "auth",
      resourceId: user?.id,
      ipAddress: req.ip,
      userAgent: req.headers["user-agent"],
    });
    return res.status(401).json({ error: "Invalid email or password" });
  }

  if (user.mfa_enabled) {
    return res.json({ mfaRequired: true, mfaToken: signMfaPendingToken(user.id) });
  }

  const session = await issueSession(user);
  res.cookie(REFRESH_COOKIE, session.refreshTokenValue, REFRESH_COOKIE_OPTS);
  await recordAudit({
    actorUserId: user.id,
    actorRole: user.role,
    action: "login",
    resourceType: "auth",
    resourceId: user.id,
    ipAddress: req.ip,
    userAgent: req.headers["user-agent"],
  });
  res.json({ user: sanitizeUser(user), accessToken: session.accessToken });
});

const mfaVerifyLoginSchema = z.object({
  mfaToken: z.string(),
  code: z.string().length(6),
});

identityRouter.post("/mfa/verify-login", authRateLimiter, async (req, res) => {
  const parsed = mfaVerifyLoginSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }
  let userId: string;
  try {
    userId = verifyMfaPendingToken(parsed.data.mfaToken);
  } catch {
    return res.status(401).json({ error: "Invalid or expired MFA session" });
  }
  const user = await findUserById(userId);
  if (!user || !user.mfa_secret || !verifyTotp(user.mfa_secret, parsed.data.code)) {
    await recordAudit({
      actorUserId: userId,
      action: "login_failed",
      resourceType: "auth",
      resourceId: userId,
      ipAddress: req.ip,
      userAgent: req.headers["user-agent"],
    });
    return res.status(401).json({ error: "Invalid MFA code" });
  }

  const session = await issueSession(user);
  res.cookie(REFRESH_COOKIE, session.refreshTokenValue, REFRESH_COOKIE_OPTS);
  await recordAudit({
    actorUserId: user.id,
    actorRole: user.role,
    action: "login",
    resourceType: "auth",
    resourceId: user.id,
    ipAddress: req.ip,
    userAgent: req.headers["user-agent"],
  });
  res.json({ user: sanitizeUser(user), accessToken: session.accessToken });
});

identityRouter.post("/refresh", async (req, res) => {
  const token = req.cookies?.[REFRESH_COOKIE];
  if (!token) return res.status(401).json({ error: "Missing refresh token" });

  try {
    const { user, newAccessToken, newRefreshToken } = await rotateRefreshToken(token);
    res.cookie(REFRESH_COOKIE, newRefreshToken, REFRESH_COOKIE_OPTS);
    res.json({ user: sanitizeUser(user), accessToken: newAccessToken });
  } catch {
    res.clearCookie(REFRESH_COOKIE, REFRESH_COOKIE_OPTS);
    res.status(401).json({ error: "Refresh token invalid or expired" });
  }
});

identityRouter.post("/logout", async (req, res) => {
  const token = req.cookies?.[REFRESH_COOKIE];
  if (token) await revokeRefreshToken(token);
  res.clearCookie(REFRESH_COOKIE, REFRESH_COOKIE_OPTS);
  res.status(204).send();
});

identityRouter.get("/me", requireAuth, async (req: AuthedRequest, res) => {
  const user = await findUserById(req.user!.id);
  if (!user) return res.status(404).json({ error: "User not found" });
  res.json({ user: sanitizeUser(user) });
});

identityRouter.post("/mfa/setup", requireAuth, async (req: AuthedRequest, res) => {
  const user = await findUserById(req.user!.id);
  if (!user) return res.status(404).json({ error: "User not found" });
  const { secret, otpauthUrl } = generateMfaSecret(user.email);
  await saveMfaSecret(user.id, secret);
  res.json({ secret, otpauthUrl });
});

const mfaVerifySchema = z.object({ code: z.string().length(6) });

identityRouter.post("/mfa/verify", requireAuth, async (req: AuthedRequest, res) => {
  const parsed = mfaVerifySchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }
  const user = await findUserById(req.user!.id);
  if (!user || !user.mfa_secret) {
    return res.status(400).json({ error: "Call /mfa/setup first" });
  }
  if (!verifyTotp(user.mfa_secret, parsed.data.code)) {
    return res.status(401).json({ error: "Invalid MFA code" });
  }
  await enableMfa(user.id);
  res.json({ mfaEnabled: true });
});
