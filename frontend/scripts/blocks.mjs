// The local copy of the published blocks for `npm run dev` (plans/neon-write-mostly.md "Local copy"): every block on R2
// into SOFIX_BLOCKS_DIR (frontend/.blocks), only the changed ones. `npm run blocks` brings it up to date now; `predev` runs
// it with --daily, which does nothing when the copy is under a day old. A failure keeps the copy there is.
// `--get <key>` prints one block straight from R2 instead.
import path from "node:path";

try {
  process.loadEnvFile(".env.local");
} catch {
  // no .env.local: the settings come from the environment, or the copy stays as it is
}
const dir = path.resolve(process.env.SOFIX_BLOCKS_DIR || ".blocks");
const get = process.argv.indexOf("--get");
if (get > 0) delete process.env.SOFIX_BLOCKS_DIR; // --get <key> prints one block as R2 holds it now (scripts/check.mjs)
const { blockAt, blockVersion, copyBlocks, copyAgeHours } = await import("../lib/r2.ts");
const age = await copyAgeHours(dir);
if (get > 0) {
  const key = process.argv[get + 1] ?? "";
  const version = await blockVersion(key);
  console.log(JSON.stringify(version ? await blockAt(key, version) : null));
} else if (process.argv.includes("--daily") && age < 24) {
  console.log(`[blocks] local copy is ${age.toFixed(1)} h old; npm run blocks brings it up to date`);
} else {
  try {
    const t = Date.now();
    const done = await copyBlocks(dir);
    console.log(`[blocks] ${done.blocks} blocks: ${done.downloaded} downloaded (${(done.bytes / 1e6).toFixed(1)} MB), ${done.removed} removed, ${((Date.now() - t) / 1000).toFixed(1)} s`);
  } catch (error) {
    console.warn(`[blocks] could not update the local copy (${error instanceof Error ? error.message : error}); ${age === Infinity ? "there is none yet" : `keeping the one from ${age.toFixed(1)} h ago`}`);
    if (process.argv.includes("--strict")) process.exit(1);
  }
}
