import { revalidateTag } from "next/cache";
import { NextResponse, type NextRequest } from "next/server";
import { database } from "../../../lib/db";
import { weekWon } from "../../../lib/entered";
import { ENTERED_WEEK_PREFIX, finished, MY_WEEK_PREFIX, MY_WEEKS_TAG, WeekBody, withScoring, type SavedWeek } from "../../../lib/myWeeks";
import { loadEnteredSnapshots, loadMyWeeks } from "../../../lib/myWeeksData";
import { loadSorare } from "../../../lib/playData";
import { isSameOriginRequest } from "../../../lib/refresh";

export const dynamic = "force-dynamic";
const headers = { "Cache-Control": "no-store" };

export async function GET() {
  try {
    const [weeks, snapshots, sorare] = await Promise.all([loadMyWeeks(), loadEnteredSnapshots(), loadSorare()]);
    const saved = new Set(weeks.map((week) => week.slug));
    const pending = (sorare?.timeline ?? []).filter((week) => finished(week.end) && !saved.has(week.slug))
      .map(({ slug, number, start, end }) => ({ slug, number, start, end })).reverse();
    return NextResponse.json({ weeks, snapshots: snapshots.filter(week => !saved.has(week.slug)), pending }, { headers });
  } catch { return NextResponse.json({ error: "Saved weeks are temporarily unavailable." }, { status: 503, headers }); }
}

export async function POST(request: NextRequest) {
  if (!isSameOriginRequest(request.headers)) return NextResponse.json({ error: "Forbidden." }, { status: 403 });
  const raw = await request.text();
  if (raw.length > 512_000) return NextResponse.json({ error: "Week is too large." }, { status: 413 });
  let input: unknown;
  try { input = JSON.parse(raw); } catch { input = null; }
  const parsed = WeekBody.safeParse(input);
  if (!parsed.success) return NextResponse.json({ error: "Check the week and lineups." }, { status: 400 });
  const { slug, lineups } = parsed.data;
  const sql = database();
  if (!sql) return NextResponse.json({ error: "Week storage is unavailable." }, { status: 503 });
  try {
    const sorare = await loadSorare();
    const week = sorare?.timeline.find((item) => item.slug === slug) ?? sorare?.weeks?.find((item) => item.gameweek.slug === slug)?.gameweek;
    if (!week) return NextResponse.json({ error: "This week has not been read from Sorare." }, { status: 400 });
    const entered = lineups.filter((lineup) => !lineup.draft);
    const archived = finished(week.end) && weekWon(entered).final;
    const selected = archived ? entered : lineups;
    if (new Set(selected.map((lineup) => lineup.id)).size !== selected.length || selected.some((lineup) => (!lineup.draft && !lineup.cards.length) || new Set(lineup.cards.map((card) => card.slug)).size !== lineup.cards.length))
      return NextResponse.json({ error: "The lineup read is incomplete." }, { status: 400 });
    const players = new Map((sorare?.collection ?? []).map((card) => [card.slug, card.player]));
    const payload: SavedWeek = { slug, number: week.number, start: week.start, end: week.end, savedAt: new Date().toISOString(),
      lineups: selected.map((lineup) => ({ ...lineup, cards: lineup.cards.map((card) => ({ ...card, player: players.get(card.slug) ?? card.player ?? null })) })) };
    if (!archived) {
      await sql`INSERT INTO read_models (key, payload, updated_at) VALUES (${`${ENTERED_WEEK_PREFIX}${slug}`}, ${JSON.stringify(payload)}::jsonb, CURRENT_TIMESTAMP) ON CONFLICT (key) DO UPDATE SET payload = EXCLUDED.payload, updated_at = EXCLUDED.updated_at`;
      revalidateTag(MY_WEEKS_TAG);
      return NextResponse.json({ ok: true, archived: false, savedAt: payload.savedAt }, { headers });
    }
    const key = `${MY_WEEK_PREFIX}${slug}`;
    const previous = await sql`SELECT payload FROM read_models WHERE key = ${key}` as { payload: SavedWeek }[];
    if (previous[0]) {
      const old = previous[0].payload;
      const enriched = withScoring(old.lineups, payload.lineups);
      if (enriched !== old.lineups) {
        const updated = { ...old, lineups: enriched };
        // Compare-and-swap: concurrent reads cannot overwrite another tab's saved metadata or results.
        await sql`UPDATE read_models SET payload = ${JSON.stringify(updated)}::jsonb, updated_at = CURRENT_TIMESTAMP WHERE key = ${key} AND payload::jsonb = ${JSON.stringify(old)}::jsonb`;
      }
    }
    // The first complete post wins atomically, including two browser tabs saving at once.
    await sql`INSERT INTO read_models (key, payload, updated_at) VALUES (${`${MY_WEEK_PREFIX}${slug}`}, ${JSON.stringify(payload)}::jsonb, CURRENT_TIMESTAMP) ON CONFLICT (key) DO NOTHING`;
    revalidateTag(MY_WEEKS_TAG); revalidateTag("audit");
    return NextResponse.json({ ok: true, archived: true, savedAt: payload.savedAt }, { headers });
  } catch { return NextResponse.json({ error: "Could not save this week. Your existing weeks are kept." }, { status: 503, headers }); }
}
