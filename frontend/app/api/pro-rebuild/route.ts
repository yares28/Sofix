import { NextResponse, type NextRequest } from "next/server";
import { readElevens } from "../../../lib/actualLineupsData";
import { PRO_REBUILD_WORKFLOW, dispatchRefresh } from "../../../lib/github";
import { authorised } from "../../../lib/extAuth";
import { loadFrozenPlan, loadSorare } from "../../../lib/playData";
import { isSameOriginRequest } from "../../../lib/refresh";

// Play's "Load from Sorare" (plans/load-from-sorare.md, step 1): reads the announced elevens of the games about to start from
// Sorare's public API (cached 60 s) and starts pro-rebuild.yml with your players in them. Only when pressed; no extension needed.
// The week being planned or a locked one still being played (its Pro lineups change until their first kickoff); the dock asks too.
export const dynamic = "force-dynamic";

const AHEAD_MS = 3 * 3600_000; // elevens come out about an hour before kickoff; later games have none yet

type Reply = { success: boolean; data: { games: number; starters: number; bench: number } | null; error: string | null };
const reply = (status: number, body: Reply) => NextResponse.json(body, { status, headers: { "Cache-Control": "no-store" } });

export async function POST(request: NextRequest) {
  if (!isSameOriginRequest(request.headers) && !authorised(request)) return reply(403, { success: false, data: null, error: "Forbidden." });
  const token = process.env.GITHUB_TOKEN;
  if (!token) return reply(503, { success: false, data: null, error: "Rebuild is not configured." });
  const body = (await request.json().catch(() => null)) as { week?: unknown; plan?: unknown } | null;
  const slug = typeof body?.week === "string" ? body.week : "";
  const plan = Number(body?.plan);
  const sorare = await loadSorare();
  const week = sorare?.weeks.find((w) => w.gameweek.slug === slug) ?? (sorare ? await loadFrozenPlan(slug, sorare) : null);
  if (!week || !Number.isInteger(plan) || plan < 1) return reply(400, { success: false, data: null, error: "Unknown week." });
  const now = Date.now();
  const mine = new Set(week.playing.players.map((p) => p.player).filter((p): p is string => !!p));
  const ids = [...new Set(week.playing.players.flatMap((p) => p.games ?? []).filter((g) => g.id && Date.parse(g.kickoff) > now && Date.parse(g.kickoff) <= now + AHEAD_MS).map((g) => g.id!))];
  const elevens = await readElevens(ids);
  const starters = elevens.starters.filter((s) => mine.has(s));
  const bench = elevens.bench.filter((s) => mine.has(s));
  const data = { games: elevens.games.length, starters: starters.length, bench: bench.length };
  if (!elevens.games.length) return reply(200, { success: false, data, error: "No elevens are out yet for the next games: Sorare shows them about an hour before kickoff." });
  try {
    const started = await dispatchRefresh(token, PRO_REBUILD_WORKFLOW, { week: slug, plan: String(plan), starters: starters.join(","), bench: bench.join(",") });
    return started ? reply(202, { success: true, data, error: null }) : reply(502, { success: false, data, error: "GitHub did not start the rebuild." });
  } catch {
    return reply(503, { success: false, data, error: "GitHub is not reachable." });
  }
}
