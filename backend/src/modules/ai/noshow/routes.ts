import { Router } from "express";
import { requireAuth, requirePermission } from "../../../middleware/auth.js";
import { predictNoShow } from "./service.js";

export const noshowRouter = Router();

noshowRouter.get(
  "/appointments/:id/risk",
  requireAuth,
  requirePermission("scheduling:manage"),
  async (req, res) => {
    const prediction = await predictNoShow(req.params.id);
    if (!prediction) return res.status(404).json({ error: "Appointment not found" });
    res.json(prediction);
  }
);
