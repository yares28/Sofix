import { revalidateTag } from "next/cache";
import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { database } from "../../../../lib/db";
import { editMission, type MissionEdits } from "../../../../lib/missionEdits";
import { DAILY_PICKER, DAY_PREFIX, fillMissionDays, loadMissionLog, LOG_PREFIX, type MonthLog } from "../../../../lib/missionLog";
import { MissionPickSchema, MissionRarity } from "../../../../lib/missionSchema";
import { mergeMissionRecord } from "../../../../lib/missionStore";
import { isSameOriginRequest } from "../../../../lib/refresh";

const Body = z.object({ day: z.string().regex(/^20\d\d-\d\d-\d\d$/), rarity: MissionRarity, mission: z.string().min(1).max(120), revision: z.number().int().min(0),
  picks: z.array(MissionPickSchema).max(10), note: z.string().max(500), restore: z.boolean() });
export async function POST(request: NextRequest) {
  if (!isSameOriginRequest(request.headers)) return NextResponse.json({ ok: false, error: "Forbidden." }, { status: 403 });
  const parsed = Body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ ok: false, error: "Check the date and picks." }, { status: 400 });
  const input = parsed.data;
  const sql = database();
  if (!sql) return NextResponse.json({ ok: false, error: "History storage is unavailable." }, { status: 503 });
  const rows = await sql`SELECT key, payload FROM read_models WHERE key = ${`${DAY_PREFIX}${input.day}:${input.rarity}`} OR key = ${`${LOG_PREFIX}${input.day.slice(0, 7)}`}` as { key: string; payload: MonthLog }[];
  const log = rows.find((r) => r.key.startsWith(DAY_PREFIX)) ?? rows[0];
  let mission = log?.payload.days[input.day]?.[input.rarity]?.missions.find((m) => m.key === input.mission);
  if (!mission && input.mission === DAILY_PICKER.id) {
    const logs = await loadMissionLog();
    const owner = await sql`SELECT payload FROM read_models WHERE key = 'sorare'` as { payload: { collection?: { rarity: string }[] } }[];
    const owned = logs.some((l) => Object.values(l.days).some((d) => d[input.rarity])) || owner[0]?.payload.collection?.some((c) => c.rarity === input.rarity);
    const baseline = owned ? fillMissionDays(logs, [input.rarity], new Date())[0]?.days[input.day]?.[input.rarity] : undefined;
    if (baseline?.missions.some((m) => m.key === input.mission)) {
      const saved = await mergeMissionRecord<MonthLog>(`${DAY_PREFIX}${input.day}:${input.rarity}`, (before) => before ?? { days: { [input.day]: { [input.rarity]: baseline } } });
      mission = saved.days[input.day]?.[input.rarity]?.missions.find((m) => m.key === input.mission);
    }
  }
  if (!mission || input.picks.length > mission.picks || new Set(input.picks.map((p) => p.card ?? `${p.player}:${p.game}`)).size !== input.picks.length || input.picks.some((p) => p.rarity !== input.rarity))
    return NextResponse.json({ ok: false, error: "These picks do not match this mission." }, { status: 400 });
  // Corrections are user reports, never Sorare-confirmed verdicts or locked appearances.
  const selectedMission = mission;
  input.picks = input.picks.map(({ player, card, game, rarity }) => ({ player, card, game, rarity, status: null }));
  try {
    const data = await mergeMissionRecord<MissionEdits>(`missions_edit:${input.day}:${input.rarity}`, (before) => editMission(before, { ...input, aliases: selectedMission.aliases, sourcePicks: selectedMission.yours }, new Date().toISOString()));
    revalidateTag("missions"); revalidateTag("audit");
    return NextResponse.json({ ok: true, data: data.edits[input.mission] }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json({ ok: false, error: "Your picks changed while saving. Reload and retry." }, { status: 409 });
  }
}
