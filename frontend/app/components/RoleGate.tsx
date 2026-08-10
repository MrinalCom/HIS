"use client";

import { useEffect, ReactNode } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "../lib/AuthContext";
import { dashboardPath, Role } from "../lib/roles";

// Wraps every role dashboard: redirects to /login if unauthenticated, or to
// the user's own dashboard if they're logged in as a different role.
export function RoleGate({ allow, children }: { allow: Role[]; children: ReactNode }) {
  const { user, ready } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!ready) return;
    if (!user) {
      router.replace("/login");
    } else if (!allow.includes(user.role)) {
      router.replace(dashboardPath(user.role));
    }
  }, [ready, user, allow, router]);

  if (!ready || !user || !allow.includes(user.role)) {
    return <div className="page-loading">Loading…</div>;
  }

  return <>{children}</>;
}
