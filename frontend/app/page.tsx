"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { motion } from "framer-motion";
import {
  Sparkles,
  ArrowRight,
  User,
  Stethoscope,
  HeartPulse,
  Pill,
  FlaskConical,
  CalendarCheck,
  CreditCard,
  ShieldCheck,
  FileText,
  Video,
  BedDouble,
  Users,
  BarChart3,
  Siren,
} from "lucide-react";
import { useAuth } from "./lib/AuthContext";
import { dashboardPath } from "./lib/roles";

const ROLES = [
  { icon: User, label: "Patient", blurb: "Book visits, chat with AI triage, view your record" },
  { icon: Stethoscope, label: "Doctor", blurb: "Chart encounters, sign notes, draft with AI" },
  { icon: HeartPulse, label: "Nurse", blurb: "Live bed board, admissions & discharge" },
  { icon: Pill, label: "Pharmacist", blurb: "Formulary, inventory, dispensing" },
  { icon: FlaskConical, label: "Lab Tech", blurb: "Order-to-result workflow" },
  { icon: CalendarCheck, label: "Receptionist", blurb: "Scheduling & ambulance dispatch" },
  { icon: CreditCard, label: "Billing Clerk", blurb: "Invoices, payments, claims" },
  { icon: ShieldCheck, label: "Admin", blurb: "Analytics, HR, audit log" },
];

const FEATURES = [
  { icon: CalendarCheck, title: "Scheduling & booking", desc: "Live availability, real-time updates, and a booking concierge chatbot." },
  { icon: FileText, title: "Electronic health records", desc: "Encounters, vitals, diagnoses, medications, and a signed clinical-note workflow." },
  { icon: Sparkles, title: "AI triage & concierge", desc: "Deterministic red-flag safety net alongside every AI-generated recommendation." },
  { icon: Video, title: "Telemedicine", desc: "1:1 WebRTC video visits, signaled over the same real-time backbone as the rest of the app." },
  { icon: Pill, title: "Pharmacy & lab", desc: "Inventory-aware dispensing and a full order → sample → result pipeline." },
  { icon: CreditCard, title: "Billing & insurance", desc: "Line-itemed invoices, payments, and mock payer claims." },
  { icon: BedDouble, title: "Bed & ambulance ops", desc: "A live socket-driven bed board and an ambulance dispatch lifecycle." },
  { icon: Users, title: "HR & payroll", desc: "Staff profiles with encrypted bank details, shifts, and payroll runs." },
  { icon: BarChart3, title: "Analytics & audit trail", desc: "Admin dashboards plus an append-only, privilege-enforced audit log." },
];

const TECH = ["Next.js", "Express", "PostgreSQL", "Redis", "Socket.io", "Claude", "scikit-learn", "Docker"];

const fadeUp = {
  hidden: { opacity: 0, y: 16 },
  show: { opacity: 1, y: 0 },
};

export default function HomePage() {
  const { user, ready } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (ready && user) router.replace(dashboardPath(user.role));
  }, [ready, user, router]);

  if (!ready || user) return <div className="page-loading">Loading…</div>;

  return (
    <>
      <section className="hero">
        <div className="hero-glow" />
        <motion.span
          className="hero-eyebrow"
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4 }}
        >
          <Sparkles size={14} /> Full-stack + AI portfolio project
        </motion.span>
        <motion.h1
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.05 }}
        >
          A full hospital, one login screen away.
        </motion.h1>
        <motion.p
          className="hero-subtitle"
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.12 }}
        >
          HIS is a complete Hospital Information System — scheduling, EHR, pharmacy, lab, billing,
          telemedicine, bed management, HR, and four AI-assisted features — built end to end with a
          deterministic fallback behind every model call.
        </motion.p>
        <motion.div
          className="hero-cta"
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.18 }}
        >
          <Link href="/login" className="btn-primary">
            Log in / Register <ArrowRight size={16} />
          </Link>
          <Link href="/symptom-checker" className="btn-secondary">
            Try the symptom checker
          </Link>
        </motion.div>
      </section>

      <div className="landing">
        <motion.div
          className="landing-section"
          initial="hidden"
          whileInView="show"
          viewport={{ once: true, amount: 0.2 }}
          transition={{ staggerChildren: 0.06 }}
        >
          <div className="section-heading">
            <h2>Built for every role in the building</h2>
            <p>Eight role-scoped dashboards, each with only the capabilities that role needs.</p>
          </div>
          <div className="role-grid">
            {ROLES.map((r) => (
              <motion.div key={r.label} className="role-card" variants={fadeUp} transition={{ duration: 0.35 }}>
                <div className="role-card-icon">
                  <r.icon size={20} />
                </div>
                <strong>{r.label}</strong>
                <span>{r.blurb}</span>
              </motion.div>
            ))}
          </div>
        </motion.div>

        <motion.div
          className="landing-section"
          initial="hidden"
          whileInView="show"
          viewport={{ once: true, amount: 0.15 }}
          transition={{ staggerChildren: 0.05 }}
        >
          <div className="section-heading">
            <h2>Everything a hospital actually runs on</h2>
            <p>Nine modules, wired together end to end — not a demo of one feature in isolation.</p>
          </div>
          <div className="feature-grid">
            {FEATURES.map((f) => (
              <motion.div key={f.title} className="feature-card" variants={fadeUp} transition={{ duration: 0.35 }}>
                <div className="feature-card-icon">
                  <f.icon size={20} />
                </div>
                <h3>{f.title}</h3>
                <p>{f.desc}</p>
              </motion.div>
            ))}
          </div>
        </motion.div>

        <motion.div
          className="landing-section"
          initial={{ opacity: 0 }}
          whileInView={{ opacity: 1 }}
          viewport={{ once: true }}
          transition={{ duration: 0.4 }}
        >
          <div className="tech-pills">
            {TECH.map((t) => (
              <span key={t} className="tech-pill">
                {t}
              </span>
            ))}
          </div>
        </motion.div>

        <motion.div
          className="landing-section"
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.4 }}
        >
          <div className="cta-banner">
            <Siren size={28} />
            <h2>Ready to see it running?</h2>
            <p>Log in with any role, or start with the public AI symptom checker — no account required.</p>
            <Link href="/login" className="btn-primary">
              Get started <ArrowRight size={16} />
            </Link>
          </div>
        </motion.div>
      </div>

      <footer className="landing-footer">
        <div className="landing-footer-grid">
          <div className="landing-footer-brand">
            <strong>HIS</strong>
            <p>
              A portfolio-project Hospital Information System modeling a HIPAA-conscious security posture.
              Not certified, not audited, and never holds real patient data.
            </p>
          </div>
          <div className="landing-footer-col">
            <h4>Product</h4>
            <ul>
              <li>
                <Link href="/login">Log in / Register</Link>
              </li>
              <li>
                <Link href="/symptom-checker">Symptom checker</Link>
              </li>
            </ul>
          </div>
          <div className="landing-footer-col">
            <h4>Roles</h4>
            <ul>
              <li>
                <Link href="/login">Patient &amp; Doctor</Link>
              </li>
              <li>
                <Link href="/login">Clinical &amp; operations staff</Link>
              </li>
            </ul>
          </div>
        </div>
        <div className="landing-footer-bottom">
          <span>© {new Date().getFullYear()} HIS — portfolio project.</span>
        </div>
      </footer>
    </>
  );
}
