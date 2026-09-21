import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import type { ReactNode } from "react";
import "./globals.css";
import "./control-center.css";

// Self-hosted at build time by next/font (no request to Google from the browser, so the CSP stays 'self').
// Apple devices keep SF via -apple-system; everyone else gets Inter instead of the platform default.
const inter = Inter({ subsets: ["latin"], display: "swap", variable: "--font-inter" });

export const metadata: Metadata = {
  title: "Sofix — LaLiga fixture difficulty",
  description: "Every LaLiga run of games, rated at a glance: difficulty, expected points and planning tools.",
  applicationName: "Sofix",
  robots: { index: false, follow: false }, // personal board
  // Installed from the browser (Chrome "Install", iPhone "Add to Home Screen"): opens in its own window.
  appleWebApp: { capable: true, title: "Sofix", statusBarStyle: "default" },
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
