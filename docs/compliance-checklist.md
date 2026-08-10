# Compliance-modeling checklist

This system **models** a HIPAA-conscious security posture for learning purposes.
It is **not certified, audited, or covered by a Business Associate Agreement**,
and must never hold real patient data. Each item below is checked off once the
corresponding control is actually implemented in code (not just documented).

- [x] **Least-privilege DB roles** — `his_migrator`/superuser runs DDL and
  migrations; the running app connects as `his_app`, which has no DDL rights and
  cannot `UPDATE`/`DELETE` `audit_log` (`backend/src/db/migrations/0001_identity.cjs`).
- [x] **Append-only audit logging** — `audit_log` table, written by
  `backend/src/middleware/audit.ts` (mutating requests) and
  `backend/src/modules/audit/service.ts` (explicit events like login/login_failed
  and PHI reads). WORM enforced at the DB-privilege level, not just convention.
- [x] **Trigger-based defense-in-depth audit** — generic `audit_trigger()`
  attached to `patients` (Phase 1) and `observations`, `conditions`,
  `medication_requests`, `clinical_notes` (Phase 2). Revisit as further
  sensitive tables are added in later phases.
- [x] **RBAC** — capability-based permission map
  (`backend/src/modules/identity/permissions.ts`), `requirePermission` middleware.
- [x] **Ownership checks** — `requireOwnershipOrRole` (Phase 1) plus explicit
  ownership checks in scheduling and EHR routes (a patient reads only their own
  chart, a doctor signs notes only on their own encounters).
- [x] **MFA** — TOTP (`otplib`), with a self-service setup UI at `/account`
  (QR-less: shows the secret + otpauth URL for manual entry). Enrollment is
  enforced live against the DB (`requireMfaEnrolled`, Phase 6) — not just
  trusted from the JWT — on the highest-sensitivity writes: signing a
  clinical note, dispensing medication, recording a payment/claim, payroll
  and new staff profiles (bank details), and admitting/discharging a bed.
- [x] **Consent tracking** — `consents` table + grant/revoke UI on the patient
  dashboard, revocable (`revoked_at`) not deletable. A `telemedicine` consent
  is required before a telemedicine session can be created (Phase 6).
- [x] **Data minimization (partial)** — HR staff list never returns decrypted
  bank details, only a `has_bank_details` boolean
  (`backend/src/modules/hr/service.ts`); billing/pharmacy/lab views each expose
  only their own domain's fields; the audit-log viewer never returns
  `before_state`/`after_state`. No formal per-module serializer audit was
  done — this is "minimized where it came up," not an exhaustive review.
- [x] **Encryption at rest** — `pgp_sym_encrypt`/`pgp_sym_decrypt` on
  `staff_profiles.bank_details_enc` (Phase 4, keyed by `HR_ENCRYPTION_KEY`);
  MFA secrets stored server-side since Phase 0.
- [ ] **Encryption in transit** — documented TLS-termination expectation for a
  real deployment; local dev runs over plain HTTP by design.
- [x] **Session security** — short-lived (15m) access JWT + httpOnly refresh
  cookie (7d) + Redis-backed revocation list for logout-everywhere.
- [x] **Rate limiting** — strict limiter on auth endpoints (Phase 0) plus a
  general limiter (300 req/min/IP) across every `/api/` route (Phase 6),
  so no single client can overwhelm the shared connection pool even on
  read-only PHI-serving endpoints.
- [x] **AI safety controls (partial)** — mandatory disclaimer returned and
  persisted (`disclaimer_shown`) per triage session; a deterministic red-flag
  keyword scan runs independently of the LLM and always wins, so a critical
  trigger never depends solely on model judgment; `degraded: true` banner on
  both AI fallback paths (triage, concierge). The clinical_notes schema already
  enforces AI-drafted notes are never auto-signed (`ai_generated`/
  `ai_reviewed_by`/status='draft'); the AI note-drafting feature itself lands
  in Phase 5.
- [x] **Retention policy** — `docs/retention-policy.md` + illustrative,
  never-scheduled purge script (`backend/scripts/purge-old-audit-log.ts`),
  dry-run by default, requiring the migrator connection since `his_app`
  cannot `DELETE` from `audit_log` (reusing the WORM privilege split above).
- [x] **Audit-log viewer** — read-only, paginated, admin-only UI at
  `/admin/audit-log` (`backend/src/modules/audit/routes.ts`); never exposes
  `before_state`/`after_state` in the list view.

**Explicit scope-trim list** (kept in baseline, first things to cut under time
pressure): multi-party/SFU video + TURN server, real payment gateway/clearinghouse
integration, real SMS/email providers (Mailpit/console stubs stand in), HR/payroll
depth beyond mock payslips, real ambulance GPS (simulator script instead).
