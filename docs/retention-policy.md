# Data retention policy (illustrative)

This is a **portfolio project modeling** a retention policy, not legal advice
and not an actual operational policy — see `docs/compliance-checklist.md` for
the project's overall compliance-modeling disclaimer.

## What a real hospital system would need to decide

Retention periods for health records are set by state/national law and vary
by record type and, in the US, are frequently on the order of 7-10 years
after the last encounter (sometimes longer for minors, until some years past
age of majority). Financial records (invoices, claims, payments) typically
follow separate, often shorter, tax/audit retention rules. This project picks
illustrative numbers below purely so the purge script has something concrete
to demonstrate — they are **not a recommendation**.

| Data | Illustrative retention | Rationale (illustrative) |
|---|---|---|
| `audit_log` | 7 years from `occurred_at` | Matches common healthcare audit-trail expectations |
| Clinical records (`encounters`, `observations`, `conditions`, `clinical_notes`, `medication_requests`) | Not purged by this project | Real deletion policy needs legal sign-off per jurisdiction; out of scope |
| `ai_triage_sessions` / `ai_concierge_logs` | 1 year | Advisory/operational logs, not part of the legal medical record |
| `noshow_predictions` | 1 year | Operational ML telemetry, not PHI-critical |

## Why the purge script needs the migrator connection, not the app's

`audit_log` is append-only by DB privilege — `his_app` (what the running
backend connects as) has `INSERT` but not `UPDATE`/`DELETE` on that table
(see `backend/src/db/migrations/0001_identity.cjs`). That's intentional: no
application code path, including a bug or a compromised app process, can
mutate or erase audit history. A retention purge is therefore a deliberate,
out-of-band operation run by a human with the migrator/superuser connection
string (`DATABASE_URL`), never something the app can trigger on its own.

## Running the script

`backend/scripts/purge-old-audit-log.ts` is illustrative and **never
scheduled** — there is no cron job, no automatic invocation. It defaults to a
dry run (prints what it would delete) and only deletes when passed
`--confirm`.

```bash
# Dry run (default) — shows the row count that would be deleted
docker compose exec backend npx tsx scripts/purge-old-audit-log.ts --olderThanDays=2555

# Actually delete (requires the migrator connection, i.e. DATABASE_URL)
docker compose exec backend npx tsx scripts/purge-old-audit-log.ts --olderThanDays=2555 --confirm
```
