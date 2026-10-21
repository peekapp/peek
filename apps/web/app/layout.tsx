import type { Metadata } from "next";
import "./globals.css";
import { readState } from "../lib/server-state";

export const metadata: Metadata = {
  title: "Peek",
  description: "Meetings and deadlines that need your attention.",
  robots: { index: false, follow: false },
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  let locale = "en";
  try {
    locale = readState().locale ?? "en";
  } catch {}
  return (
    <html lang={locale}>
      <body>{children}</body>
    </html>
  );
}
