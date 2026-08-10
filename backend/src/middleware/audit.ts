import { Response, NextFunction } from "express";
import { AuthedRequest } from "./auth.js";
import { recordAudit, AuditAction } from "../modules/audit/service.js";

const METHOD_TO_ACTION: Record<string, AuditAction> = {
  POST: "create",
  PUT: "update",
  PATCH: "update",
  DELETE: "delete",
};

// Attach to any route that mutates a resource: auditResource("appointment")
// logs a create/update/delete row (inferred from HTTP method) with the
// resulting resource id, once the handler has responded successfully.
// Explicit events that aren't tied to a REST verb (login, login_failed,
// PHI reads) are recorded directly via recordAudit() instead.
export function auditResource(resourceType: string) {
  return (req: AuthedRequest, res: Response, next: NextFunction) => {
    res.on("finish", () => {
      if (res.statusCode >= 400) return;
      const action = METHOD_TO_ACTION[req.method];
      if (!action) return;
      const resourceId =
        (res.locals.auditResourceId as string | undefined) ?? req.params.id ?? undefined;
      void recordAudit({
        actorUserId: req.user?.id,
        actorRole: req.user?.role,
        action,
        resourceType,
        resourceId,
        ipAddress: req.ip,
        userAgent: req.headers["user-agent"],
      });
    });
    next();
  };
}
