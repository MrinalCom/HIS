"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { Settings, LogOut, ShieldCheck } from "lucide-react";
import { useAuth } from "../lib/AuthContext";
import { ROLE_LABELS, dashboardPath } from "../lib/roles";

export default function TopBar() {
  const { user, ready, logout } = useAuth();

  return (
    <header className="topbar">
      <Link href={user ? dashboardPath(user.role) : "/"} className="topbar-brand">
        HIS
      </Link>
      {ready && (
        <motion.div
          className="topbar-actions"
          initial={{ opacity: 0, y: -6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.2 }}
        >
          {user ? (
            <>
              <span className="topbar-user">
                {user.name} · {ROLE_LABELS[user.role]}
                {user.mfaEnabled && (
                  <ShieldCheck
                    size={14}
                    style={{ marginLeft: "0.35rem", verticalAlign: "-2px", color: "var(--success)" }}
                  />
                )}
              </span>
              <Link href="/account" className="btn-secondary" style={{ display: "inline-flex", alignItems: "center", gap: "0.35rem" }}>
                <Settings size={15} /> Account
              </Link>
              <button className="btn-secondary" onClick={logout} style={{ display: "inline-flex", alignItems: "center", gap: "0.35rem" }}>
                <LogOut size={15} /> Log out
              </button>
            </>
          ) : (
            <Link href="/login" className="btn-secondary">
              Log in
            </Link>
          )}
        </motion.div>
      )}
    </header>
  );
}
