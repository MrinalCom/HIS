import { Server, Socket } from "socket.io";
import type { AccessTokenPayload } from "../middleware/auth.js";

interface AuthedSocket extends Socket {
  user?: AccessTokenPayload;
}

// Single shared room for the bed board — every nurse/admin viewing it sees
// admits/discharges/status changes live, mirroring the scheduling socket.
export function registerBedSocket(io: Server) {
  io.on("connection", (socket: AuthedSocket) => {
    socket.on("beds:join-board", () => {
      if (socket.user && ["nurse", "admin"].includes(socket.user.role)) {
        socket.join("beds:board");
      }
    });
  });
}
