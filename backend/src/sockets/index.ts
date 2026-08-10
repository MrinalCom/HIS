import { Server, Socket } from "socket.io";
import jwt from "jsonwebtoken";
import { env } from "../config/env.js";
import type { AccessTokenPayload } from "../middleware/auth.js";

interface AuthedSocket extends Socket {
  user?: AccessTokenPayload;
}

// Auth handshake for every socket connection, independent of any particular
// room. Domain modules (appointments, ward board, telemedicine, ...) register
// their own room join/leave handlers on top of this as those phases land —
// mirrors RestroHub's registerOrderSocket, generalized to one shared server.
export function registerSockets(io: Server) {
  io.use((socket: AuthedSocket, next) => {
    const token = socket.handshake.auth?.token as string | undefined;
    if (token) {
      try {
        socket.user = jwt.verify(token, env.jwtAccessSecret) as AccessTokenPayload;
      } catch {
        // treat as anonymous; individual room handlers decide if that's allowed
      }
    }
    next();
  });

  io.on("connection", (socket: AuthedSocket) => {
    console.log(`socket connected: ${socket.id} (user: ${socket.user?.id ?? "anonymous"})`);
    socket.on("disconnect", () => {
      console.log(`socket disconnected: ${socket.id}`);
    });
  });
}
