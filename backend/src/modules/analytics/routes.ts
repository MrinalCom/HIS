import { Router } from "express";
import { requireAuth, requireRole } from "../../middleware/auth.js";
import { getOverview } from "./service.js";

export const analyticsRouter = Router();

analyticsRouter.get("/overview", requireAuth, requireRole("admin"), async (_req, res) => {
  res.json({ overview: await getOverview() });
});
