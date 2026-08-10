import { pool } from "../../config/db.js";
import type { Role } from "../identity/permissions.js";

export type AuditAction = "create" | "read" | "update" | "delete" | "login" | "login_failed" | "export";

export interface AuditEvent {
  actorUserId?: string;
  actorRole?: Role;
  action: AuditAction;
  resourceType: string;
  resourceId?: string;
  beforeState?: unknown;
  afterState?: unknown;
  ipAddress?: string;
  userAgent?: string;
}

// Writes to the append-only audit_log table. The his_app DB role this pool
// connects as has INSERT but not UPDATE/DELETE on audit_log — see
// backend/src/db/migrations/0001_identity.cjs — so this is the only way in.
export async function recordAudit(event: AuditEvent): Promise<void> {
  await pool.query(
    `INSERT INTO audit_log
       (actor_user_id, actor_role, action, resource_type, resource_id, before_state, after_state, ip_address, user_agent)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
    [
      event.actorUserId ?? null,
      event.actorRole ?? null,
      event.action,
      event.resourceType,
      event.resourceId ?? null,
      event.beforeState ? JSON.stringify(event.beforeState) : null,
      event.afterState ? JSON.stringify(event.afterState) : null,
      event.ipAddress ?? null,
      event.userAgent ?? null,
    ]
  );
}

export interface AuditLogRow {
  id: string;
  occurred_at: string;
  actor_user_id: string | null;
  actor_name: string | null;
  actor_role: string | null;
  action: string;
  resource_type: string;
  resource_id: string | null;
}

// Read-only viewer query — deliberately never selects before_state/after_state
// here (can hold PHI) to keep the list view itself low-risk; only the
// resource type/id/actor/action metadata is surfaced.
export async function listAuditLog(filters: {
  resourceType?: string;
  action?: string;
  limit: number;
  offset: number;
}): Promise<{ rows: AuditLogRow[]; total: number }> {
  const clauses: string[] = [];
  const params: unknown[] = [];
  if (filters.resourceType) {
    params.push(filters.resourceType);
    clauses.push(`resource_type = $${params.length}`);
  }
  if (filters.action) {
    params.push(filters.action);
    clauses.push(`action = $${params.length}`);
  }
  const where = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";

  const countResult = await pool.query<{ count: string }>(`SELECT count(*) FROM audit_log ${where}`, params);

  params.push(filters.limit, filters.offset);
  const rowsResult = await pool.query<AuditLogRow>(
    `SELECT al.id, al.occurred_at, al.actor_user_id, u.name AS actor_name, al.actor_role, al.action, al.resource_type, al.resource_id
     FROM audit_log al
     LEFT JOIN users u ON u.id = al.actor_user_id
     ${where}
     ORDER BY al.occurred_at DESC
     LIMIT $${params.length - 1} OFFSET $${params.length}`,
    params
  );

  return { rows: rowsResult.rows, total: Number(countResult.rows[0]?.count ?? 0) };
}
