import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import type { ReactNode } from "react";
import "./globals.css";

// Self-hosted at build time by next/font (no request to Google from the browser, so the CSP stays 'self').
// Apple devices keep SF via -apple-system; everyone else gets Inter instead of the platform default.
const inter = Inter({ subsets: ["latin"], display: "swap", variable: "--font-inter" });

export const metadata: Metadata = {
  title: "FixtureDiff — LaLiga fixture difficulty",
  description: "Every LaLiga run of games, rated at a glance: difficulty, expected points and planning tools.",
  applicationName: "FixtureDiff",
  robots: { index: false, follow: false }, // personal board
};

export const viewport: Viewport = {
  themeColor: "#fbfbfd",
  colorScheme: "light",
};

export default function Layout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className={inter.variable}>
      <body>{children}</body>
    </html>
  );
}
