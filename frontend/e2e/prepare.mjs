// Start every end-to-end run from an empty Next.js data cache, so no grid from an earlier run is served.
import { rmSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { resolve, sep } from "node:path";

const root = fileURLToPath(new URL("../", import.meta.url));
const dist = process.env.E2E_PRODUCTION === "1" ? ".next" : ".next-e2e";
const target = resolve(root, dist, "cache");
if (!target.startsWith(resolve(root) + sep)) throw new Error("Test cache must stay inside the frontend workspace");
rmSync(target, { recursive: true, force: true });
