import "./globals.css";
import type { ReactNode } from "react";
import { AuthProvider } from "./lib/AuthContext";
import { QueryProvider } from "./lib/QueryProvider";
import { ToastProvider } from "./lib/ToastContext";
import TopBar from "./components/TopBar";
import { PageTransition } from "./components/PageTransition";

export const metadata = {
  title: "HIS",
  description: "Hospital Information System — portfolio project",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" data-scroll-behavior="smooth">
      <body>
        <QueryProvider>
          <AuthProvider>
            <ToastProvider>
              <TopBar />
              <PageTransition>{children}</PageTransition>
            </ToastProvider>
          </AuthProvider>
        </QueryProvider>
      </body>
    </html>
  );
}
