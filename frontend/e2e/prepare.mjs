// Start every end-to-end run from an empty Next.js data cache, so no grid from an earlier run is served.
import { rmSync } from "node:fs";

rmSync(new URL("../.next-e2e/cache", import.meta.url), { recursive: true, force: true });
