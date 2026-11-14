import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { loadArcadeLaLiga } from "../../../../lib/arcadeLaLiga";
import { authorised } from "../../../../lib/extAuth";
import { loadSavedChances } from "../../../../lib/sorareChances";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

const Body = z.object({
  games: z.array(z.string().regex(/^Game:[0-9a-f-]{36}$/i)).max(300),
  players: z.array(z.string().regex(/^[a-z0-9][a-z0-9-]{0,80}$/)).max(3000),
});

/**
 * The dock's Arcade engine (plans/dock-v2.md): Sofix's numbers for your cards' players and Sorare's saved start % for the board's games,
 * in one call. The extension asks at most every 10 minutes, and only while it works a plan out; never polled.
 */
export async function POST(request: NextRequest) {
  if (!authorised(request)) return NextResponse.json({ ok: false, error: "Not authorised." }, { status: 401 });
  const body = Body.safeParse(await request.json().catch(() => null));
  if (!body.success) return NextResponse.json({ ok: false, error: "Not a list of games and players." }, { status: 400 });
  const wanted = new Set(body.data.players);
  const [all, chances] = await Promise.all([loadArcadeLaLiga(), loadSavedChances(body.data.games)]);
  // Only your cards' players: the whole table is every player of seven competitions.
  const laliga = Object.fromEntries(Object.entries(all).filter(([key]) => wanted.has(key.slice(0, key.lastIndexOf(":")))));
  return NextResponse.json({ ok: true, laliga, chances }, { headers: { "Cache-Control": "no-store" } });
}
