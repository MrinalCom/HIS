import { tool } from "@langchain/core/tools";
import { z } from "zod";
import { listDepartments, listHealthcareServices, listPractitioners } from "../../directory/service.js";
import { getAvailability, createAppointment } from "../../scheduling/service.js";
import { matchFaq } from "./faq.js";

// Tools are built per-request so book_appointment can close over patientId
// instead of trusting an LLM-supplied patient id — the model picks *what* to
// book, never *who* it books for. Mirrors RestroHub's createConciergeTools.
export function createConciergeTools(patientId: string | undefined) {
  const listDepartmentsTool = tool(
    async () => JSON.stringify(await listDepartments()),
    {
      name: "list_departments",
      description: "List hospital departments (e.g. Cardiology, Pediatrics).",
      schema: z.object({}),
    }
  );

  const listServicesTool = tool(
    async ({ departmentId }: { departmentId: string }) =>
      JSON.stringify(await listHealthcareServices(departmentId)),
    {
      name: "list_services",
      description: "List bookable services (with duration) within a department.",
      schema: z.object({ departmentId: z.string().uuid() }),
    }
  );

  const listPractitionersTool = tool(
    async ({ departmentId }: { departmentId?: string }) =>
      JSON.stringify(await listPractitioners(departmentId)),
    {
      name: "list_practitioners",
      description: "List doctors, optionally filtered by department id.",
      schema: z.object({ departmentId: z.string().uuid().optional() }),
    }
  );

  const checkAvailabilityTool = tool(
    async ({
      practitionerId,
      healthcareServiceId,
      date,
    }: {
      practitionerId: string;
      healthcareServiceId: string;
      date: string;
    }) => {
      const services = await listHealthcareServices();
      const service = services.find((s) => s.id === healthcareServiceId);
      if (!service) return JSON.stringify({ error: "Unknown service id" });
      const slots = await getAvailability(practitionerId, date, service.duration_minutes);
      return JSON.stringify({ slots });
    },
    {
      name: "check_availability",
      description: "Get open appointment slots (ISO timestamps) for a doctor and service on a given date (YYYY-MM-DD).",
      schema: z.object({
        practitionerId: z.string().uuid(),
        healthcareServiceId: z.string().uuid(),
        date: z.string().min(1),
      }),
    }
  );

  const bookAppointmentTool = tool(
    async ({
      practitionerId,
      healthcareServiceId,
      scheduledStart,
    }: {
      practitionerId: string;
      healthcareServiceId: string;
      scheduledStart: string;
    }) => {
      if (!patientId) {
        return JSON.stringify({
          error: "This visitor isn't logged in with a completed patient profile, so I can't book on their behalf.",
        });
      }
      try {
        const appointment = await createAppointment({
          patientId,
          practitionerId,
          healthcareServiceId,
          scheduledStart,
          createdVia: "ai_concierge",
        });
        return JSON.stringify({ booked: true, appointment });
      } catch (err) {
        return JSON.stringify({ error: (err as Error).message });
      }
    },
    {
      name: "book_appointment",
      description:
        "Book an appointment for the current patient at a specific slot returned by check_availability. Only call this after the patient has confirmed a specific doctor, service, and time.",
      schema: z.object({
        practitionerId: z.string().uuid(),
        healthcareServiceId: z.string().uuid(),
        scheduledStart: z.string().min(1).describe("ISO timestamp of the chosen slot"),
      }),
    }
  );

  const searchFaqTool = tool(
    async ({ query }: { query: string }) => {
      const answer = matchFaq(query);
      return JSON.stringify({ answer: answer ?? null });
    },
    {
      name: "search_faq",
      description: "Look up an answer to a general question about hours, departments, cancellation, etc.",
      schema: z.object({ query: z.string().min(1) }),
    }
  );

  return [
    listDepartmentsTool,
    listServicesTool,
    listPractitionersTool,
    checkAvailabilityTool,
    bookAppointmentTool,
    searchFaqTool,
  ];
}
