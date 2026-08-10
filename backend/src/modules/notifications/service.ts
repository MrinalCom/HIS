import nodemailer from "nodemailer";

const transport = nodemailer.createTransport({
  host: process.env.SMTP_HOST || "mailpit",
  port: Number(process.env.SMTP_PORT) || 1025,
  secure: false,
});

// Mailpit is a dev SMTP catcher (view sent mail at http://localhost:8025) —
// no real email provider is configured, so this never leaves the Docker
// network. See the scope-trim list in docs/compliance-checklist.md.
export async function sendEmail(to: string, subject: string, text: string): Promise<void> {
  try {
    await transport.sendMail({ from: "no-reply@his.local", to, subject, text });
  } catch (err) {
    console.error("Failed to send email (non-fatal):", (err as Error).message);
  }
}
