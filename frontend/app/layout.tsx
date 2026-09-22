import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import type { ReactNode } from "react";
import { INSTALL_CAPTURE_SCRIPT } from "../lib/install";
import "./globals.css";
import "./control-center.css";
import "./home.css";

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
      <head>
        {/* With credentials: the manifest sits behind Vercel's login like every other path (see the route). */}
        <link rel="manifest" href="/manifest.webmanifest" crossOrigin="use-credentials" />
        <script dangerouslySetInnerHTML={{ __html: INSTALL_CAPTURE_SCRIPT }} />
      </head>
      <body>{children}</body>
    </html>
  );
}
