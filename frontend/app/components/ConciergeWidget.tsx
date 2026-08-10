"use client";

import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { MessageCircle, X } from "lucide-react";
import { ChatWidget } from "./ChatWidget";
import * as api from "../lib/api";

const GREETING = "Hi! I can help with hours, departments, and booking an appointment. What do you need?";

export function ConciergeWidget() {
  const [open, setOpen] = useState(false);

  return (
    <div className="concierge-widget">
      <AnimatePresence>
        {open && (
          <motion.div
            className="concierge-panel dashboard-card"
            initial={{ opacity: 0, scale: 0.92, y: 12 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.92, y: 12 }}
            transition={{ duration: 0.18, ease: "easeOut" }}
          >
            <div className="concierge-panel-header">
              <h2 style={{ margin: 0, fontSize: "1rem" }}>Booking concierge</h2>
              <button type="button" className="btn-secondary" onClick={() => setOpen(false)}>
                Close
              </button>
            </div>
            <ChatWidget
              greeting={GREETING}
              sendMessage={api.conciergeChat}
              renderBanner={(result) =>
                result.degraded ? (
                  <div className="chat-degraded-banner">Smart assistant unavailable — showing FAQ answers only.</div>
                ) : null
              }
            />
          </motion.div>
        )}
      </AnimatePresence>
      <motion.button
        type="button"
        className="btn-primary concierge-toggle"
        onClick={() => setOpen((o) => !o)}
        whileHover={{ scale: 1.06 }}
        whileTap={{ scale: 0.94 }}
        aria-label={open ? "Close booking concierge" : "Open booking concierge"}
      >
        {open ? <X size={22} /> : <MessageCircle size={22} />}
      </motion.button>
    </div>
  );
}
