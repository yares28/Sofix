import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { isSameOriginRequest } from "../../../../lib/refresh";
import { loadArcadeRecords } from "../../../../lib/arcadeLaLiga";
import { loadChanceCheck } from "../../../../lib/arcadeLogStore";
import { loadSavedChances } from "../../../../lib/sorareChances";

export const dynamic = "force-dynamic";
const Body = z.object({
  games: z.array(z.string().regex(/^Game:[0-9a-f-]{36}$/i)).max(300),
  players: z.array(z.string().regex(/^[a-z0-9][a-z0-9-]{0,80}$/)).max(3000).optional(),
  set: z.string().regex(/^[a-z0-9][a-z0-9-]{0,80}$/).optional(),
});

/**
 * Sorare's start % saved for the Arcade board's games (plans/set.md, step 2) and, when players are listed, their start records and the
 * sources' ranking (plans/arcade-trust.md §4). Bounded, cached reads; never polled.
 */
export async function POST(request: NextRequest) {
  if (!isSameOriginRequest(request.headers)) return NextResponse.json({ error: "Forbidden." }, { status: 403 });
  const body = Body.safeParse(await request.json().catch(() => null));
  if (!body.success) return NextResponse.json({ error: "Not a list of games." }, { status: 400 });
  const [chances, records, check] = await Promise.all([loadSavedChances(body.data.games), loadArcadeRecords(body.data.players ?? []), body.data.set ? loadChanceCheck(body.data.set) : null]);
  return NextResponse.json({ chances, ...(records ? { records } : {}), ...(check ? { check } : {}) }, { headers: { "Cache-Control": "no-store" } });
}
