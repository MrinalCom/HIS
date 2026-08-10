"use client";

import { useState, FormEvent } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "../lib/AuthContext";
import { apiJson } from "../lib/apiClient";
import { ROLES, ROLE_LABELS, dashboardPath, Role } from "../lib/roles";

type Mode = "login" | "register";

interface AuthResult {
  user: { id: string; name: string; email: string; role: Role; mfaEnabled: boolean };
  accessToken: string;
}

export default function LoginPage() {
  const router = useRouter();
  const { login } = useAuth();
  const [mode, setMode] = useState<Mode>("login");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<Role>("patient");
  const [mfaToken, setMfaToken] = useState<string | null>(null);
  const [mfaCode, setMfaCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  function onSuccess(data: AuthResult) {
    login(data.user, data.accessToken);
    router.push(dashboardPath(data.user.role));
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const path = mode === "login" ? "/api/identity/login" : "/api/identity/register";
      const body = mode === "login" ? { email, password } : { name, email, password, role };
      const data = await apiJson<AuthResult & { mfaRequired?: boolean; mfaToken?: string }>(path, {
        method: "POST",
        body: JSON.stringify(body),
      });
      if (data.mfaRequired && data.mfaToken) {
        setMfaToken(data.mfaToken);
      } else {
        onSuccess(data);
      }
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }

  async function submitMfa(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const data = await apiJson<AuthResult>("/api/identity/mfa/verify-login", {
        method: "POST",
        body: JSON.stringify({ mfaToken, code: mfaCode }),
      });
      onSuccess(data);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }

  if (mfaToken) {
    return (
      <div className="auth-wrap">
        <div className="auth-card">
          <h2>Verification code</h2>
          <p className="auth-hint">Enter the 6-digit code from your authenticator app.</p>
          <form onSubmit={submitMfa} className="auth-form">
            <label>
              Code
              <input
                value={mfaCode}
                onChange={(e) => setMfaCode(e.target.value)}
                maxLength={6}
                required
                autoFocus
              />
            </label>
            {error && <p className="auth-error">{error}</p>}
            <button type="submit" className="btn-primary" disabled={loading}>
              {loading ? "Verifying…" : "Verify"}
            </button>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div className="auth-wrap">
      <div className="auth-card">
        <div className="auth-tabs">
          <button
            type="button"
            className={mode === "login" ? "auth-tab active" : "auth-tab"}
            onClick={() => setMode("login")}
          >
            Log in
          </button>
          <button
            type="button"
            className={mode === "register" ? "auth-tab active" : "auth-tab"}
            onClick={() => setMode("register")}
          >
            Create account
          </button>
        </div>

        <form onSubmit={submit} className="auth-form">
          {mode === "register" && (
            <label>
              Name
              <input value={name} onChange={(e) => setName(e.target.value)} required />
            </label>
          )}
          <label>
            Email
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
          </label>
          <label>
            Password
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={8}
            />
          </label>
          {mode === "register" && (
            <label>
              Role
              <select value={role} onChange={(e) => setRole(e.target.value as Role)}>
                {ROLES.map((r) => (
                  <option key={r} value={r}>
                    {ROLE_LABELS[r]}
                  </option>
                ))}
              </select>
            </label>
          )}

          {error && <p className="auth-error">{error}</p>}

          <button type="submit" className="btn-primary" disabled={loading}>
            {loading ? "Please wait…" : mode === "login" ? "Log in" : "Create account"}
          </button>
        </form>
      </div>
    </div>
  );
}
