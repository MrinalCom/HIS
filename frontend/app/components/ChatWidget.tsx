"use client";

import { useState, FormEvent, ReactNode } from "react";
import { AnimatePresence, motion } from "framer-motion";
import type { ChatMessage } from "../lib/api";

export function ChatWidget<TResult extends { reply: string; degraded: boolean }>({
  greeting,
  sendMessage,
  renderBanner,
}: {
  greeting: string;
  sendMessage: (messages: ChatMessage[]) => Promise<TResult>;
  renderBanner?: (result: TResult) => ReactNode;
}) {
  const [messages, setMessages] = useState<ChatMessage[]>([{ role: "assistant", content: greeting }]);
  const [input, setInput] = useState("");
  const [pending, setPending] = useState(false);
  const [lastResult, setLastResult] = useState<TResult | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    const text = input.trim();
    if (!text || pending) return;
    const next = [...messages, { role: "user" as const, content: text }];
    setMessages(next);
    setInput("");
    setPending(true);
    try {
      const result = await sendMessage(next);
      setMessages([...next, { role: "assistant", content: result.reply }]);
      setLastResult(result);
    } catch {
      setMessages([...next, { role: "assistant", content: "Sorry, something went wrong. Please try again." }]);
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="chat-widget">
      <AnimatePresence>{lastResult && renderBanner?.(lastResult)}</AnimatePresence>
      <div className="chat-messages">
        <AnimatePresence initial={false}>
          {messages.map((m, i) => (
            <motion.div
              key={i}
              className={`chat-bubble chat-bubble-${m.role}`}
              initial={{ opacity: 0, y: 10, scale: 0.96 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              transition={{ duration: 0.2, ease: "easeOut" }}
            >
              {m.content}
            </motion.div>
          ))}
          {pending && (
            <motion.div
              key="pending"
              className="chat-bubble chat-bubble-assistant chat-bubble-pending"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
            >
              Thinking…
            </motion.div>
          )}
        </AnimatePresence>
      </div>
      <form className="chat-input-row" onSubmit={submit}>
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Type a message…"
          disabled={pending}
        />
        <button type="submit" className="btn-primary" disabled={pending || !input.trim()}>
          Send
        </button>
      </form>
    </div>
  );
}
