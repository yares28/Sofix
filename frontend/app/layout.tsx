import type { Metadata, Viewport } from "next";
import { Geist } from "next/font/google";
import type { ReactNode } from "react";
import { INSTALL_CAPTURE_SCRIPT } from "../lib/install";
import { THEME_SCRIPT } from "../lib/theme";
import "./globals.css";
import "./control-center.css";
import "./home.css";
import "./recap.css";
import "./laliga.css";
import "./play.css";
import "./cards.css";
import "./lineups.css";
import "./audit.css";
import "./player.css";

// Self-hosted at build time by next/font (no request to Google from the browser, so the CSP stays 'self').
// Geist on every device (owner's pick, 5 Oct 2026).
const geist = Geist({ subsets: ["latin"], display: "swap", variable: "--font-geist" });

export const metadata: Metadata = {
  title: "Sofix — LaLiga fixture difficulty",
  description: "Every LaLiga run of games, rated at a glance: difficulty, expected points and planning tools.",
  applicationName: "Sofix",
  robots: { index: false, follow: false }, // personal board
  // Installed from the browser (Chrome "Install", iPhone "Add to Home Screen"): opens in its own window.
  appleWebApp: { capable: true, title: "Sofix", statusBarStyle: "default" },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#fbfbfd" },
    { media: "(prefers-color-scheme: dark)", color: "#0c0c0e" },
  ],
  colorScheme: "light dark",
};

export default function Layout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className={geist.variable} suppressHydrationWarning>
      <head>
        {/* With credentials: the manifest sits behind Vercel's login like every other path (see the route). */}
        <link rel="manifest" href="/manifest.webmanifest" crossOrigin="use-credentials" />
        <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
        <script dangerouslySetInnerHTML={{ __html: INSTALL_CAPTURE_SCRIPT }} />
      </head>
      <body>{children}</body>
    </html>
  );
}
