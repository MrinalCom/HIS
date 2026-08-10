"use client";

import { createContext, useContext, useEffect, useState, ReactNode } from "react";
import { useRouter } from "next/navigation";
import { apiFetch, apiJson, refreshAccessToken, setAccessToken, onUnauthorized } from "./apiClient";
import type { Role } from "./roles";

export interface AuthUser {
  id: string;
  name: string;
  email: string;
  role: Role;
  mfaEnabled: boolean;
}

interface AuthContextValue {
  user: AuthUser | null;
  ready: boolean;
  login: (user: AuthUser, accessToken: string) => void;
  logout: () => void;
  refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  const [user, setUser] = useState<AuthUser | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    onUnauthorized(() => {
      setUser(null);
      setAccessToken(null);
    });

    // No access token is persisted client-side (it's short-lived by design) —
    // a session survives a page reload only via the httpOnly refresh cookie.
    refreshAccessToken()
      .then((result) => {
        if (result) setUser(result.user as AuthUser);
      })
      .finally(() => setReady(true));
  }, []);

  function login(newUser: AuthUser, newAccessToken: string) {
    setAccessToken(newAccessToken);
    setUser(newUser);
  }

  function logout() {
    apiFetch("/api/identity/logout", { method: "POST" }).finally(() => {
      setAccessToken(null);
      setUser(null);
      router.push("/");
    });
  }

  async function refreshUser() {
    const data = await apiJson<{ user: AuthUser }>("/api/identity/me");
    setUser(data.user);
  }

  return (
    <AuthContext.Provider value={{ user, ready, login, logout, refreshUser }}>{children}</AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
