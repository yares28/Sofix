import { NextResponse, type NextRequest } from "next/server";
import { authorised } from "../../../../../lib/extAuth";
import { loadMissionPool } from "../../../../../lib/missionsPool";
import { missionDay } from "../../../../../lib/missions";
export async function GET(request: NextRequest) {
  if (!authorised(request)) return NextResponse.json({ ok: false }, { status: 401 });
  const pool = await loadMissionPool(), day = missionDay(new Date());
  return NextResponse.json({ ok: true, games: [...new Set((pool?.players ?? []).flatMap((p) => p.games.filter((g) => g.id && missionDay(new Date(g.kickoff)) === day).map((g) => g.id)))].slice(0, 24) }, { headers: { "Cache-Control": "no-store" } });
}
