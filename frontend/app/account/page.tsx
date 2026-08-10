"use client";

import { useState, FormEvent } from "react";
import { useMutation } from "@tanstack/react-query";
import { useAuth } from "../lib/AuthContext";
import * as api from "../lib/api";

export default function AccountPage() {
  const { user, refreshUser } = useAuth();
  const [setupData, setSetupData] = useState<{ secret: string; otpauthUrl: string } | null>(null);
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const setupMutation = useMutation({
    mutationFn: api.setupMfa,
    onSuccess: setSetupData,
  });

  const verifyMutation = useMutation({
    mutationFn: () => api.verifyMfaSetup(code),
    onSuccess: async () => {
      setDone(true);
      await refreshUser();
    },
    onError: (err) => setError((err as Error).message),
  });

  if (!user) return <div className="dashboard page-loading">Loading…</div>;

  return (
    <div className="dashboard">
      <h1>Account settings</h1>
      <div className="dashboard-card" style={{ maxWidth: 480 }}>
        <h2>Multi-factor authentication</h2>
        <p className="dashboard-subtitle">
          Status: <strong>{user.mfaEnabled ? "Enabled" : "Not enabled"}</strong>
          {user.role !== "patient" && !user.mfaEnabled && (
            <> — required before signing notes, dispensing medication, recording payments, and other sensitive actions.</>
          )}
        </p>

        {user.mfaEnabled ? (
          <p>MFA is active on your account.</p>
        ) : done ? (
          <p className="chat-degraded-banner" style={{ background: "#dff3e9", color: "#147a4c" }}>
            MFA is now enabled on your account.
          </p>
        ) : !setupData ? (
          <button type="button" className="btn-primary" onClick={() => setupMutation.mutate()} disabled={setupMutation.isPending}>
            {setupMutation.isPending ? "Generating…" : "Set up MFA"}
          </button>
        ) : (
          <form
            className="auth-form"
            onSubmit={(e: FormEvent) => {
              e.preventDefault();
              setError(null);
              verifyMutation.mutate();
            }}
          >
            <p>Add this key to your authenticator app (Google Authenticator, 1Password, etc):</p>
            <code style={{ wordBreak: "break-all", background: "var(--bg)", padding: "0.5rem", borderRadius: 6 }}>
              {setupData.secret}
            </code>
            <p className="auth-hint">Or add it manually via: {setupData.otpauthUrl}</p>
            <label>
              6-digit code
              <input value={code} onChange={(e) => setCode(e.target.value)} maxLength={6} required />
            </label>
            {error && <p className="auth-error">{error}</p>}
            <button type="submit" className="btn-primary" disabled={verifyMutation.isPending}>
              {verifyMutation.isPending ? "Verifying…" : "Verify and enable"}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
