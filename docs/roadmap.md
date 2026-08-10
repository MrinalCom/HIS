# Build roadmap

Each phase is independently demoable. Status is updated as phases complete.

- [x] **Phase 0 — Foundations**: repo scaffold, Docker Compose (postgres/redis/minio/mailpit/backend/frontend/ml-service), identity module (register/login/refresh/RBAC/MFA), audit_log infra + middleware, base frontend shell with role-scoped empty dashboards.
- [x] **Phase 1 — Registration, Scheduling, Dashboards**: patients/practitioners/departments/locations/healthcare_services, appointments, receptionist + doctor dashboards, patient booking UI, live appointment updates.
- [x] **Phase 2 — EHR core + AI Triage + AI Concierge**: encounters/observations/conditions/allergies/medication_requests, clinical notes (draft/sign workflow), AI symptom-checker with deterministic red-flag safety net, AI booking concierge, consent capture (grant/revoke).
- [x] **Phase 3 — Pharmacy + Lab + Billing**: drug formulary/inventory/dispense (with automatic stock decrement), lab order → sample → result workflow, invoices/line items/payments/insurance claims (mocked payer auto-approval). Document attachments (MinIO) deferred — no module needed them yet.
- [x] **Phase 4 — Bed/Ward + Ambulance + HR**: wards/beds/admissions with a live socket-driven bed board, mocked ambulance dispatch lifecycle (simulator lat/lng), staff profiles (bank details encrypted at rest via `pgp_sym_encrypt`), shifts, and illustrative payroll runs.
- [x] **Phase 5 — Telemedicine + Clinical Doc Assistant + No-show ML + Notifications/Analytics**: 1:1 WebRTC video signaled over the existing Socket.io server, AI-drafted SOAP notes (forced tool_choice + deterministic fallback, never auto-signed), a real scikit-learn no-show classifier served by `ml-service` with a heuristic fallback, Mailpit email notifications, and admin analytics (Recharts).
- [x] **Phase 6 — Hardening/Compliance polish**: live-DB MFA enrollment gate on the highest-sensitivity writes with a self-service `/account` setup UI, general API rate limiting, a telemedicine-consent gate, a paginated admin audit-log viewer, a documented (illustrative) retention policy + never-scheduled purge script, and an HTTP-driven seed/demo data script.

Full architecture rationale: see the plan this was built from, or ask for a
re-derivation from `docs/compliance-checklist.md` + the module layout under
`backend/src/modules/`.
