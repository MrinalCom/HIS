import "dotenv/config";
// Must be imported before any routers are defined — it patches Express's
// router methods so a rejected promise in an async handler is forwarded to
// errorHandler via next(err) instead of becoming an unhandled rejection that
// crashes the whole process (previously any bad :id param, e.g. an invalid
// UUID, could take the entire server down for every connected user).
import "express-async-errors";
import express from "express";
import cors from "cors";
import helmet from "helmet";
import cookieParser from "cookie-parser";
import { createServer } from "http";
import { Server } from "socket.io";
import { identityRouter } from "./modules/identity/routes.js";
import { patientsRouter } from "./modules/patients/routes.js";
import { directoryRouter } from "./modules/directory/routes.js";
import { schedulingRouter } from "./modules/scheduling/routes.js";
import { ehrRouter } from "./modules/ehr/routes.js";
import { consentRouter } from "./modules/consent/routes.js";
import { triageRouter } from "./modules/ai/triage/routes.js";
import { conciergeRouter } from "./modules/ai/concierge/routes.js";
import { pharmacyRouter } from "./modules/pharmacy/routes.js";
import { labRouter } from "./modules/lab/routes.js";
import { billingRouter } from "./modules/billing/routes.js";
import { bedRouter } from "./modules/bedmanagement/routes.js";
import { ambulanceRouter } from "./modules/ambulance/routes.js";
import { hrRouter } from "./modules/hr/routes.js";
import { telemedRouter } from "./modules/telemed/routes.js";
import { docAssistantRouter } from "./modules/ai/docAssistant/routes.js";
import { noshowRouter } from "./modules/ai/noshow/routes.js";
import { analyticsRouter } from "./modules/analytics/routes.js";
import { auditRouter } from "./modules/audit/routes.js";
import { registerSockets } from "./sockets/index.js";
import { registerSchedulingSocket } from "./sockets/schedulingSocket.js";
import { registerBedSocket } from "./sockets/bedSocket.js";
import { registerTelemedSocket } from "./sockets/telemedSocket.js";
import { errorHandler } from "./middleware/errorHandler.js";
import { apiRateLimiter } from "./middleware/rateLimit.js";

const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: { origin: process.env.FRONTEND_ORIGIN || "http://localhost:3000", credentials: true },
});

app.set("io", io);
registerSockets(io);
registerSchedulingSocket(io);
registerBedSocket(io);
registerTelemedSocket(io);

app.use(helmet());
app.use(cors({ origin: process.env.FRONTEND_ORIGIN || "http://localhost:3000", credentials: true }));
app.use(express.json());
app.use(cookieParser());

app.get("/health", (_req, res) => res.json({ ok: true }));

app.use("/api", apiRateLimiter);

app.use("/api/identity", identityRouter);
app.use("/api/patients", patientsRouter);
app.use("/api/directory", directoryRouter);
app.use("/api/scheduling", schedulingRouter);
app.use("/api/ehr", ehrRouter);
app.use("/api/consent", consentRouter);
app.use("/api/ai/triage", triageRouter);
app.use("/api/ai/concierge", conciergeRouter);
app.use("/api/pharmacy", pharmacyRouter);
app.use("/api/lab", labRouter);
app.use("/api/billing", billingRouter);
app.use("/api/beds", bedRouter);
app.use("/api/ambulance", ambulanceRouter);
app.use("/api/hr", hrRouter);
app.use("/api/telemed", telemedRouter);
app.use("/api/ai/doc-assistant", docAssistantRouter);
app.use("/api/ai/noshow", noshowRouter);
app.use("/api/analytics", analyticsRouter);
app.use("/api/audit", auditRouter);

app.use(errorHandler);

const PORT = Number(process.env.PORT) || 4000;
httpServer.listen(PORT, () => {
  console.log(`HIS backend listening on :${PORT}`);
});
