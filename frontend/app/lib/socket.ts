import { io, Socket } from "socket.io-client";
import { getAccessToken } from "./apiClient";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000";

// Callers own the socket's lifetime (connect on mount, disconnect on
// unmount) — this is a thin factory, not a shared singleton, since each
// dashboard joins different rooms.
export function connectSocket(): Socket {
  return io(API_URL, { auth: { token: getAccessToken() } });
}
