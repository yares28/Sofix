import { revalidateTag } from "next/cache";
import { NextResponse, type NextRequest } from "next/server";
import { database, readModel } from "../../../../lib/db";
import { authorised } from "../../../../lib/extAuth";
import { ACTIVE, dispatchRefresh, latestWorkflowRun } from "../../../../lib/github";
import { mayRefresh, newsFor, type PlanWatch } from "../../../../lib/planNews";
import { ChanceBatch, CHANCES_TAG, saveChances } from "../../../../lib/sorareChances";

export const dynamic = "force-dynamic";

/** Starting chances the extension read from Sorare's own page, kept so they outlive the tab (plans/sorare-start-chances.md). A reading
 * that moves a planned starter's chance by a quarter or more starts a refresh, so the plan follows the news (lib/planNews.ts). */
export async function POST(request: NextRequest) {
  if (!authorised(request)) return NextResponse.json({ ok: false, error: "Not authorised." }, { status: 401 });
  const batch = ChanceBatch.safeParse(await request.json().catch(() => null));
  if (!batch.success) return NextResponse.json({ ok: false, error: "Not a list of starting chances." }, { status: 400 });
  if (!database()) return NextResponse.json({ ok: false, error: "No database configured." }, { status: 503 });
  let games: number;
  try {
    games = await saveChances(batch.data.rows);
    revalidateTag(CHANCES_TAG);
  } catch {
    return NextResponse.json({ ok: false, error: "Starting chances could not be saved; retry." }, { status: 503 });
  }
  const now = Date.now();
  const watch = await readModel<PlanWatch>("plan_watch").catch(() => null);
  const news = newsFor(watch?.payload ?? null, batch.data.rows, now);
  let started = false;
  const token = process.env.GITHUB_TOKEN;
  if (news.length && token) {
    try {
      const run = await latestWorkflowRun(token);
      if (mayRefresh(Boolean(run && ACTIVE.has(run.status)), run ? Date.parse(run.created_at) : null, now)) started = await dispatchRefresh(token);
    } catch {
      started = false; // the readings are kept; the next scheduled refresh picks the news up
    }
  }
  return NextResponse.json({ ok: true, games, players: batch.data.rows.length, news: news.length, started }, { headers: { "Cache-Control": "no-store" } });
}
