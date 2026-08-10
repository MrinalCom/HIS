import rateLimit from "express-rate-limit";

// Auth endpoints are the classic brute-force target — cap attempts per IP
// independent of whatever per-route logic exists.
export const authRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  standardHeaders: true,
  legacyHeaders: false,
});

// Phase 6 rollout: a looser cap across every /api/ route (not just auth),
// so a single compromised/misbehaving client can't hammer any endpoint —
// PHI-serving GETs included — into a de facto DoS on the shared his_app
// connection pool. Deliberately generous since real usage is many small
// polling/query-invalidation calls per page.
export const apiRateLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 300,
  standardHeaders: true,
  legacyHeaders: false,
});
