import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Agent Diff Auditor",
  description: "Risk analysis for diffs produced by AI coding agents."
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="fr">
      <body>{children}</body>
    </html>
  );
}
