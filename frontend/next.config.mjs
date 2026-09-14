import path from "node:path";
import { fileURLToPath } from "node:url";

/** @type {import('next').NextConfig} */
const nextConfig = {
  // A pnpm lockfile higher up the disk confuses Next's workspace-root detection; pin it here.
  outputFileTracingRoot: path.dirname(fileURLToPath(import.meta.url)),
  // Self-contained server (`node .next/standalone/server.js`) for the production Docker image.
  output: "standalone",
};

export default nextConfig;
