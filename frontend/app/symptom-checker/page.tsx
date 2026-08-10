"use client";

import Link from "next/link";
import { ChatWidget } from "../components/ChatWidget";
import * as api from "../lib/api";

const GREETING =
  "Hi, I'm here to help you figure out the right next step for how you're feeling. Describe your symptoms and I'll suggest whether to rest at home, book an appointment, seek urgent care, or seek emergency care. This isn't a diagnosis.";

export default function SymptomCheckerPage() {
  return (
    <div className="dashboard">
      <h1>Symptom checker</h1>
      <p className="dashboard-subtitle">
        Not a substitute for professional medical advice. In a medical emergency, call your local emergency
        number immediately.
      </p>
      <div className="dashboard-card">
        <ChatWidget
          greeting={GREETING}
          sendMessage={api.triageChat}
          renderBanner={(result) => (
            <>
              {result.recommendedAction === "emergency" && (
                <div className="chat-emergency-banner">
                  ⚠ This may be a medical emergency. Please call your local emergency number or go to the
                  nearest emergency room.
                </div>
              )}
              {result.degraded && (
                <div className="chat-degraded-banner">
                  The smart assistant is temporarily unavailable — showing a simpler, rule-based response.
                </div>
              )}
              {result.recommendedAction === "book_appointment" && (
                <div className="chat-degraded-banner" style={{ background: "#e3edff", color: "#2451c9" }}>
                  Suggested next step: <Link href="/patient">book an appointment</Link>.
                </div>
              )}
            </>
          )}
        />
      </div>
    </div>
  );
}
