import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { isSameOriginRequest } from "../../../../lib/refresh";
import { loadSavedChances } from "../../../../lib/sorareChances";

export const dynamic = "force-dynamic";
const Body = z.object({ games: z.array(z.string().regex(/^Game:[0-9a-f-]{36}$/i)).max(300) });

/** Sorare's start % saved for the Arcade board's games (plans/set.md, step 2). One bounded, cached read; never polled. */
export async function POST(request: NextRequest) {
  if (!isSameOriginRequest(request.headers)) return NextResponse.json({ error: "Forbidden." }, { status: 403 });
  const body = Body.safeParse(await request.json().catch(() => null));
  if (!body.success) return NextResponse.json({ error: "Not a list of games." }, { status: 400 });
  return NextResponse.json({ chances: await loadSavedChances(body.data.games) }, { headers: { "Cache-Control": "no-store" } });
}
