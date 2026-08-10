import { Router } from "express";
import { requireAuth, requireRole } from "../../middleware/auth.js";
import { listAuditLog } from "./service.js";

export const auditRouter = Router();

auditRouter.get("/log", requireAuth, requireRole("admin"), async (req, res) => {
  const resourceType = typeof req.query.resourceType === "string" ? req.query.resourceType : undefined;
  const action = typeof req.query.action === "string" ? req.query.action : undefined;
  const limit = Math.min(Number(req.query.limit) || 50, 200);
  const offset = Number(req.query.offset) || 0;

  const { rows, total } = await listAuditLog({ resourceType, action, limit, offset });
  res.json({ rows, total, limit, offset });
});
