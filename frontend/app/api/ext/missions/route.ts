import { revalidateTag } from "next/cache";
import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { database } from "../../../../lib/db";
import { authorised } from "../../../../lib/extAuth";
import { recordHistoricalMissions, recordQuietly } from "../../../../lib/missionLog";
import { isToday, MISSIONS_TAG, type MissionRow, type MissionsModel } from "../../../../lib/missions";
import { MissionRarity, MissionSchema } from "../../../../lib/missionSchema";
import { mergeMissionRecord } from "../../../../lib/missionStore";

export const dynamic = "force-dynamic";
const Batch = z.object({ version: z.literal(2), requestedAt: z.string().datetime(), user: z.string().min(1).max(120), history: z.boolean().default(false),
  outcomes: z.record(MissionRarity, z.object({ complete: z.literal(true), missions: z.array(MissionSchema).max(200) })) });
const Legacy = z.object({ rarity: MissionRarity, missions: z.array(MissionSchema).min(1).max(12) });

export async function POST(request: NextRequest) {
  if (!authorised(request)) return NextResponse.json({ ok: false, error: "Not authorised." }, { status: 401 });
  const body: unknown = await request.json().catch(() => null);
  const batch = Batch.safeParse(body), legacy = Legacy.safeParse(body);
  if (!batch.success && !legacy.success) return NextResponse.json({ ok: false, error: "Incomplete missions. Update the extension and retry." }, { status: 400 });
  const sql = database();
  if (!sql) return NextResponse.json({ ok: false, error: "No database configured." }, { status: 503 });
  const now = new Date().toISOString();
  if (batch.success && (Date.parse(batch.data.requestedAt) > Date.now() + 60_000 || Date.parse(batch.data.requestedAt) < Date.now() - 120_000))
    return NextResponse.json({ ok: false, error: "Expired import; retry." }, { status: 409 });
  if (batch.success) {
    const rows = await sql`SELECT payload FROM read_models WHERE key = 'sorare'` as { payload: { user?: string } }[];
    if (rows[0]?.payload.user && rows[0].payload.user.toLowerCase() !== batch.data.user.toLowerCase())
      return NextResponse.json({ ok: false, error: "This Sorare account is not the Sofix owner." }, { status: 403 });
  }
  try {
    if (batch.success && batch.data.history) {
      const restored = await recordHistoricalMissions(batch.data.outcomes);
      revalidateTag(MISSIONS_TAG); revalidateTag("audit");
      return NextResponse.json({ ok: true, restored });
    }
    if (batch.success && Object.values(batch.data.outcomes).some((o) => o.missions.length > 12)) return NextResponse.json({ ok: false }, { status: 400 });
    const next = await mergeMissionRecord<MissionsModel>("missions", (before) => {
      const out = { ...before };
      const entries = batch.success ? Object.entries(batch.data.outcomes) : [[legacy.data!.rarity, { missions: legacy.data!.missions }]] as const;
      for (const [rarity, entry] of entries) {
        const requested = batch.success ? batch.data.requestedAt : now;
        if ((out[rarity]?.requested_at ?? "") > requested) continue;
        const previous = out[rarity];
        const missions: MissionRow[] = entry.missions.map((m) => ({ ...previous?.missions.find((p) => p.id === m.id), ...(batch.success ? { eligibleCards: undefined } : {}), ...m }));
        const sameDay = previous && isToday(previous.seen_at, new Date(now));
        if (!batch.success && sameDay) missions.push(...previous.missions.filter((p) => !missions.some((m) => m.id === p.id)));
        out[rarity] = { missions, seen_at: now, requested_at: requested, verified: batch.success || Boolean(sameDay && previous?.verified) };
      }
      return out;
    });
    await recordQuietly(next, true);
    revalidateTag(MISSIONS_TAG);
    revalidateTag("audit");
    return NextResponse.json({ ok: true, seen_at: now }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json({ ok: false, error: "Missions could not be saved; retry." }, { status: 409 });
  }
}
