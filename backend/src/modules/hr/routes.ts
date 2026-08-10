import { Router } from "express";
import { z } from "zod";
import { requireAuth, requirePermission, requireMfaEnrolled, AuthedRequest } from "../../middleware/auth.js";
import { auditResource } from "../../middleware/audit.js";
import {
  createStaffProfile,
  listStaffProfiles,
  listEligibleStaffUsers,
  addShift,
  listShiftsForStaff,
  runPayroll,
  listPayrollRuns,
  listPayslipsForRun,
} from "./service.js";

export const hrRouter = Router();

hrRouter.get("/eligible-users", requireAuth, requirePermission("hr:manage"), async (_req, res) => {
  res.json({ users: await listEligibleStaffUsers() });
});

const staffSchema = z.object({
  userId: z.string().uuid(),
  departmentId: z.string().uuid().optional(),
  jobTitle: z.string().min(1),
  hourlyRate: z.number().nonnegative(),
  bankDetails: z.record(z.string(), z.unknown()).optional(),
});

hrRouter.post(
  "/staff",
  requireAuth,
  requirePermission("hr:manage"),
  requireMfaEnrolled,
  auditResource("staff_profile"),
  async (req: AuthedRequest, res) => {
    const parsed = staffSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
    const staff = await createStaffProfile(parsed.data);
    res.locals.auditResourceId = staff.id;
    res.status(201).json({ staff });
  }
);

hrRouter.get("/staff", requireAuth, requirePermission("hr:manage"), async (_req, res) => {
  res.json({ staff: await listStaffProfiles() });
});

const shiftSchema = z.object({
  staffProfileId: z.string().uuid(),
  startsAt: z.string().min(1),
  endsAt: z.string().min(1),
});

hrRouter.post(
  "/shifts",
  requireAuth,
  requirePermission("hr:manage"),
  auditResource("shift"),
  async (req: AuthedRequest, res) => {
    const parsed = shiftSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
    const shift = await addShift(parsed.data);
    res.locals.auditResourceId = shift.id;
    res.status(201).json({ shift });
  }
);

hrRouter.get("/staff/:id/shifts", requireAuth, requirePermission("hr:manage"), async (req, res) => {
  res.json({ shifts: await listShiftsForStaff(req.params.id) });
});

const payrollSchema = z.object({ periodStart: z.string().min(1), periodEnd: z.string().min(1) });

hrRouter.post(
  "/payroll-runs",
  requireAuth,
  requirePermission("hr:manage"),
  requireMfaEnrolled,
  auditResource("payroll_run"),
  async (req: AuthedRequest, res) => {
    const parsed = payrollSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
    const { run, payslips } = await runPayroll(parsed.data);
    res.locals.auditResourceId = run.id;
    res.status(201).json({ run, payslips });
  }
);

hrRouter.get("/payroll-runs", requireAuth, requirePermission("hr:manage"), async (_req, res) => {
  res.json({ runs: await listPayrollRuns() });
});

hrRouter.get("/payroll-runs/:id/payslips", requireAuth, requirePermission("hr:manage"), async (req, res) => {
  res.json({ payslips: await listPayslipsForRun(req.params.id) });
});
