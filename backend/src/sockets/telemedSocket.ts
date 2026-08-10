import { Server, Socket } from "socket.io";
import type { AccessTokenPayload } from "../middleware/auth.js";
import { markSessionActive, markSessionEnded } from "../modules/telemed/service.js";

interface AuthedSocket extends Socket {
  user?: AccessTokenPayload;
}

// 1:1 P2P WebRTC signaling relay — the server never touches media, it only
// relays offer/answer/ICE between the two sockets in a session's room,
// mirroring how the scheduling socket relays appointment state. The first
// participant already in the room is told when a second one joins, so only
// that first participant creates the initial offer (avoids a glare/collision
// between two simultaneous offers in a 2-person room).
export function registerTelemedSocket(io: Server) {
  io.on("connection", (socket: AuthedSocket) => {
    socket.on("telemed:join", async ({ sessionId }: { sessionId: string }) => {
      if (typeof sessionId !== "string" || !socket.user) return;
      const room = `telemed:${sessionId}`;
      const existing = await io.in(room).fetchSockets();
      socket.join(room);
      if (existing.length > 0) {
        socket.to(room).emit("telemed:peer-joined");
        await markSessionActive(sessionId);
      }
    });

    socket.on("telemed:offer", ({ sessionId, offer }: { sessionId: string; offer: unknown }) => {
      socket.to(`telemed:${sessionId}`).emit("telemed:offer", offer);
    });

    socket.on("telemed:answer", ({ sessionId, answer }: { sessionId: string; answer: unknown }) => {
      socket.to(`telemed:${sessionId}`).emit("telemed:answer", answer);
    });

    socket.on("telemed:ice-candidate", ({ sessionId, candidate }: { sessionId: string; candidate: unknown }) => {
      socket.to(`telemed:${sessionId}`).emit("telemed:ice-candidate", candidate);
    });

    socket.on("telemed:leave", async ({ sessionId }: { sessionId: string }) => {
      socket.to(`telemed:${sessionId}`).emit("telemed:peer-left");
      socket.leave(`telemed:${sessionId}`);
      await markSessionEnded(sessionId);
    });
  });
}
