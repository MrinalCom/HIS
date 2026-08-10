import { Server, Socket } from "socket.io";
import type { AccessTokenPayload } from "../middleware/auth.js";

interface AuthedSocket extends Socket {
  user?: AccessTokenPayload;
}

// Room-based live updates for scheduling, mirroring RestroHub's orderSocket
// pattern (order:<id> / kitchen / admin rooms) adapted to this domain:
// receptionist/admin see every appointment, a doctor sees only their own
// schedule, and a patient can watch a single appointment they booked.
export function registerSchedulingSocket(io: Server) {
  io.on("connection", (socket: AuthedSocket) => {
    socket.on("scheduling:join-receptionist", () => {
      if (socket.user && ["receptionist", "admin"].includes(socket.user.role)) {
        socket.join("scheduling:receptionist");
      }
    });

    socket.on("scheduling:join-practitioner", () => {
      if (socket.user?.role === "doctor") {
        socket.join(`scheduling:practitioner:${socket.user.id}`);
      }
    });

    socket.on("appointment:watch", (appointmentId: string) => {
      if (typeof appointmentId === "string") socket.join(`appointment:${appointmentId}`);
    });

    socket.on("appointment:unwatch", (appointmentId: string) => {
      if (typeof appointmentId === "string") socket.leave(`appointment:${appointmentId}`);
    });
  });
}
