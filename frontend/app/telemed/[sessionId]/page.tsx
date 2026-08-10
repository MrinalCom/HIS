"use client";

import { useEffect, useRef, useState } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { connectSocket } from "../../lib/socket";

const ICE_SERVERS: RTCConfiguration = {
  iceServers: [{ urls: "stun:stun.l.google.com:19302" }],
};

export default function TelemedPage() {
  const { sessionId } = useParams<{ sessionId: string }>();
  const searchParams = useSearchParams();
  const router = useRouter();
  const appointmentId = searchParams.get("appointmentId");

  const localVideoRef = useRef<HTMLVideoElement>(null);
  const remoteVideoRef = useRef<HTMLVideoElement>(null);
  const pcRef = useRef<RTCPeerConnection | null>(null);
  const socketRef = useRef<ReturnType<typeof connectSocket> | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);

  const [status, setStatus] = useState<"connecting" | "waiting" | "connected" | "error" | "ended">("connecting");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function start() {
      const socket = connectSocket();
      socketRef.current = socket;

      let stream: MediaStream;
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
      } catch (err) {
        if (!cancelled) {
          setError(
            "Couldn't access your camera/microphone (" +
              (err as Error).message +
              "). Check browser permissions and try again."
          );
          setStatus("error");
        }
        return;
      }
      if (cancelled) {
        stream.getTracks().forEach((t) => t.stop());
        return;
      }
      localStreamRef.current = stream;
      if (localVideoRef.current) localVideoRef.current.srcObject = stream;

      const pc = new RTCPeerConnection(ICE_SERVERS);
      pcRef.current = pc;
      stream.getTracks().forEach((track) => pc.addTrack(track, stream));

      pc.ontrack = (event) => {
        if (remoteVideoRef.current) remoteVideoRef.current.srcObject = event.streams[0];
        setStatus("connected");
      };
      pc.onicecandidate = (event) => {
        if (event.candidate) socket.emit("telemed:ice-candidate", { sessionId, candidate: event.candidate });
      };

      socket.on("telemed:peer-joined", async () => {
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        socket.emit("telemed:offer", { sessionId, offer });
      });

      socket.on("telemed:offer", async (offer: RTCSessionDescriptionInit) => {
        await pc.setRemoteDescription(offer);
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        socket.emit("telemed:answer", { sessionId, answer });
      });

      socket.on("telemed:answer", async (answer: RTCSessionDescriptionInit) => {
        await pc.setRemoteDescription(answer);
      });

      socket.on("telemed:ice-candidate", async (candidate: RTCIceCandidateInit) => {
        try {
          await pc.addIceCandidate(candidate);
        } catch {
          // ICE candidates that arrive before the remote description is set
          // are safe to drop — the browser will still connect via the rest.
        }
      });

      socket.on("telemed:peer-left", () => {
        setStatus("ended");
      });

      socket.emit("telemed:join", { sessionId });
      setStatus("waiting");
    }

    void start();

    return () => {
      cancelled = true;
      socketRef.current?.emit("telemed:leave", { sessionId });
      socketRef.current?.disconnect();
      pcRef.current?.close();
      localStreamRef.current?.getTracks().forEach((t) => t.stop());
    };
  }, [sessionId]);

  function leaveCall() {
    socketRef.current?.emit("telemed:leave", { sessionId });
    router.push(appointmentId ? "/patient" : "/doctor");
  }

  return (
    <div className="dashboard">
      <h1>Telemedicine visit</h1>
      <p className="dashboard-subtitle">
        {status === "connecting" && "Requesting camera and microphone access…"}
        {status === "waiting" && "Waiting for the other participant to join…"}
        {status === "connected" && "Connected"}
        {status === "ended" && "The other participant has left."}
        {status === "error" && error}
      </p>
      <div className="telemed-grid">
        <div className="telemed-tile">
          <video ref={localVideoRef} autoPlay muted playsInline />
          <span className="telemed-label">You</span>
        </div>
        <div className="telemed-tile">
          <video ref={remoteVideoRef} autoPlay playsInline />
          <span className="telemed-label">Other participant</span>
        </div>
      </div>
      <button type="button" className="btn-secondary" onClick={leaveCall} style={{ marginTop: "1rem" }}>
        Leave call
      </button>
    </div>
  );
}
