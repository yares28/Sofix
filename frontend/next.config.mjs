import path from "node:path";
import { fileURLToPath } from "node:url";

const isDev = process.env.NODE_ENV !== "production";

// App Router injects small inline scripts, so script-src needs 'unsafe-inline' without a nonce setup.
// Dev additionally needs eval (React refresh) and the HMR websocket.
const contentSecurityPolicy = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ""}`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: https://crests.football-data.org",
  "font-src 'self'",
  `connect-src 'self'${isDev ? " ws://127.0.0.1:3000 ws://localhost:3000" : ""}`,
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join("; ");

const securityHeaders = [
  { key: "Content-Security-Policy", value: contentSecurityPolicy },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "no-referrer" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=()" },
];

/** @type {import('next').NextConfig} */
const nextConfig = {
  // End-to-end tests run a second dev server; give it its own build and data cache.
  distDir: process.env.NEXT_DIST_DIR || ".next",
  // A pnpm lockfile higher up the disk confuses Next's workspace-root detection; pin it here.
  outputFileTracingRoot: path.dirname(fileURLToPath(import.meta.url)),
  poweredByHeader: false,
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;
