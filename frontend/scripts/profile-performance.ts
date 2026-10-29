// Offline CPU probe: npx vite-node scripts/profile-performance.ts
import { performance } from "node:perf_hooks";
import { readFileSync, writeFileSync } from "node:fs";
import { gzipSync } from "node:zlib";
import { standings } from "../lib/standings";
import type { FixtureGrid } from "../lib/types";
import { seasonProgression } from "../lib/progression";

const probes: unknown[] = [];
const record = (value: unknown) => { probes.push(value); console.log(JSON.stringify(value)); };

const grid = JSON.parse(readFileSync(new URL("../e2e/fixtures/grid-response.json", import.meta.url), "utf8")).data as FixtureGrid;
for (const mode of ["actual", "expected", "predicted"] as const) {
  const start = performance.now();
  standings(grid, { mode });
  record({ probe: "standings", mode, simulations: 5000, teams: grid.teams.length, gameweeks: grid.matchdays.length, ms: +(performance.now() - start).toFixed(1) });
}
const chartStart = performance.now();
seasonProgression(grid);
record({ probe: "season-chart", simulations: 400, ms: +(performance.now() - chartStart).toFixed(1) });

// Optional local evidence: read one saved publication, emit sizes only. Never query a source or print owner data.
const blocks = process.env.PERFORMANCE_BLOCKS_DIR;
if (blocks) {
  const path = await import("node:path");
  const { readdirSync, statSync } = await import("node:fs");
  const sizes = readdirSync(blocks).filter(name => name.endsWith(".json")).map(name => ({ name, bytes: statSync(path.join(blocks, name)).size })).sort((a, b) => b.bytes - a.bytes);
  record({ probe: "local-blocks", count: sizes.length - 1, totalBytes: sizes.reduce((n, row) => n + row.bytes, 0), largest: sizes.slice(0, 12) });
  const sorare = JSON.parse(readFileSync(path.join(blocks, "sorare.json"), "utf8")).payload;
  const next = sorare.weeks.find((w: { gameweek: { id: string } }) => w.gameweek.id === sorare.nextId) ?? sorare.weeks[0];
  const slim = { data: { collection: sorare.collection, market: sorare.market }, nextId: sorare.nextId, projectionsAt: next?.projectionsAt ?? null };
  const before = JSON.stringify(sorare);
  const after = JSON.stringify(slim);
  record({ probe: "players-props", note: "Current publication with unchanged market; selected-GW overlays and RSC envelope not included", beforeBytes: Buffer.byteLength(before), afterBytes: Buffer.byteLength(after), beforeGzipBytes: gzipSync(before).byteLength, afterGzipBytes: gzipSync(after).byteLength, weeks: sorare.weeks.length, collection: sorare.collection?.length, market: sorare.market?.length });
  const runs = JSON.parse(readFileSync(path.join(blocks, "refresh_runs.json"), "utf8"));
  const latest = runs.payload.latest;
  const step = latest?.details?.sorare;
  record({ probe: "published-refresh", blockPublishedAt: runs.updatedAt, startedAt: latest?.started_at, finishedAt: latest?.finished_at,
    sorareSeconds: step?.seconds, calls: step?.result?.calls, neonMB: step?.neonMB, timings: step?.result?.parts?.step,
    sync: step?.result?.parts?.sync, planning: step?.result?.parts?.plans });
}
const output = process.argv.indexOf("--out");
if (output >= 0 && process.argv[output + 1]) writeFileSync(process.argv[output + 1]!, JSON.stringify({ measuredAt: new Date().toISOString(), probes }, null, 2) + "\n");
