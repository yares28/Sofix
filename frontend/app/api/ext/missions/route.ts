import { revalidateTag } from "next/cache";
import { after, NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { database } from "../../../../lib/db";
import { authorised } from "../../../../lib/extAuth";
import { recordQuietly } from "../../../../lib/missionLog";
import { MISSIONS_TAG, type MissionsModel } from "../../../../lib/missions";

// The daily missions the Missions page of Sorare lists, as the extension read them from the signed-in tab (extension/background.js, `sendMissions`).
// Read only on Sorare's side: the extension sends the names and rules of the pickers, nothing of the account. Kept per rarity in the read model `missions`.
export const dynamic = "force-dynamic";

const RARITY = /^(limited|rare|super_rare|unique|custom_series)$/;
const Body = z.object({
  rarity: z.string().regex(RARITY),
  missions: z
    .array(
      z.object({
        id: z.string().min(1).max(120),
        title: z.string().max(80),
        description: z.string().max(300),
        mode: z.enum(["DECISIVE", "SCORE"]),
        picks: z.number().int().min(1).max(10),
        made: z.number().int().min(0).max(10),
        period: z.string().max(20).nullable(),
        state: z.string().max(20).nullable(),
        // From extension 0.3.6: the stats the mission counts, and your picks with Sorare's verdict. An older build sends neither.
        stats: z.array(z.string().max(40)).max(20).default([]),
        appearances: z
          .array(
            z.object({
              player: z.string().min(1).max(120),
              game: z.string().max(80).nullable(),
              rarity: z.string().max(20).nullable(),
              status: z.string().max(20).nullable(),
            }),
          )
          .max(10)
          .default([]),
      }),
    )
    .max(12),
});

export async function POST(request: NextRequest) {
  if (!authorised(request)) return NextResponse.json({ ok: false, error: "Not authorised." }, { status: 401 });
  const parsed = Body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ ok: false, error: "Bad missions." }, { status: 400 });
  const sql = database();
  if (!sql) return NextResponse.json({ ok: false, error: "No database configured." }, { status: 503 });

  const rows = (await sql`SELECT payload FROM read_models WHERE key = 'missions'`) as { payload: MissionsModel }[];
  const before = rows[0]?.payload ?? {};
  const now = new Date().toISOString();
  // A mission without a name cannot be shown or ranked (an earlier build kept two such on 4 Oct): it is left out. An empty list is kept, since
  // "no mission today" is worth knowing.
  const named = parsed.data.missions.filter((mission) => mission.title.trim());
  const next: MissionsModel = { ...before, [parsed.data.rarity]: { missions: named, seen_at: now } };
  await sql`
    INSERT INTO read_models (key, payload, updated_at)
    VALUES ('missions', ${JSON.stringify(next)}::json, now())
    ON CONFLICT (key) DO UPDATE SET payload = EXCLUDED.payload, updated_at = EXCLUDED.updated_at`;
  revalidateTag(MISSIONS_TAG);
  after(() => recordQuietly(next)); // today's picks into the missions log, with the list just loaded
  return NextResponse.json({ ok: true, seen_at: now }, { headers: { "Cache-Control": "no-store" } });
}
