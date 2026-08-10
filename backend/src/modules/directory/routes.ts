import { Router } from "express";
import { z } from "zod";
import { requireAuth, requireRole, AuthedRequest } from "../../middleware/auth.js";
import {
  listDepartments,
  listHealthcareServices,
  listPractitioners,
  findPractitionerByUserId,
  createPractitionerProfile,
} from "./service.js";

export const directoryRouter = Router();

directoryRouter.get("/departments", requireAuth, async (_req, res) => {
  res.json({ departments: await listDepartments() });
});

directoryRouter.get("/healthcare-services", requireAuth, async (req, res) => {
  const departmentId = typeof req.query.departmentId === "string" ? req.query.departmentId : undefined;
  res.json({ services: await listHealthcareServices(departmentId) });
});

directoryRouter.get("/practitioners", requireAuth, async (req, res) => {
  const departmentId = typeof req.query.departmentId === "string" ? req.query.departmentId : undefined;
  res.json({ practitioners: await listPractitioners(departmentId) });
});

directoryRouter.get(
  "/practitioners/me",
  requireAuth,
  requireRole("doctor"),
  async (req: AuthedRequest, res) => {
    const practitioner = await findPractitionerByUserId(req.user!.id);
    if (!practitioner) return res.status(404).json({ error: "Profile not created yet" });
    res.json({ practitioner });
  }
);

const createPractitionerSchema = z.object({
  specialty: z.string().min(1),
  departmentId: z.string().uuid().optional(),
  licenseNumber: z.string().optional(),
});

directoryRouter.post(
  "/practitioners/me",
  requireAuth,
  requireRole("doctor"),
  async (req: AuthedRequest, res) => {
    const existing = await findPractitionerByUserId(req.user!.id);
    if (existing) return res.status(409).json({ error: "Profile already exists" });

    const parsed = createPractitionerSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

    const practitioner = await createPractitionerProfile({ userId: req.user!.id, ...parsed.data });
    res.status(201).json({ practitioner });
  }
);
