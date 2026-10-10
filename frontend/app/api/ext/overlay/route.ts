import { NextResponse, type NextRequest } from "next/server";
import { loadGrid } from "../../../../lib/api";
import { authorised } from "../../../../lib/extAuth";
import { OverlayRequest, overlayNumbers } from "../../../../lib/overlay";
import { weekPlan } from "../../../../lib/play";
import { loadFrozenPlan, loadSorare, loadSorareWeek } from "../../../../lib/playData";

// The numbers the Chrome extension draws on sorare.com's cards (extension/overlay.js). Which cards a page shows
// is only ever sent here, to your own app; nothing goes to a third party. It reads the read models the app
// already caches, so a call costs no database query of its own. Every answer is private to the extension.
export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "no-store" };

export async function POST(request: NextRequest) {
  if (!authorised(request)) return NextResponse.json({ ok: false, error: "Not authorised." }, { status: 401, headers: NO_STORE });
  const parsed = OverlayRequest.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ ok: false, error: "Bad request." }, { status: 400, headers: NO_STORE });

  const [sorare, loaded] = await Promise.all([loadSorare(), loadGrid()]);
  if (!sorare) return NextResponse.json({ ok: false, error: "Sorare has not been synced yet." }, { status: 503, headers: NO_STORE });

  // A page about a finished gameweek the job kept apart (and the page no longer holds) is answered from that copy; one
  // about a week nobody kept is answered with nothing, so no read is made for it.
  const named = sorare.timeline?.find((item) => parsed.data.fixture ? item.slug === parsed.data.fixture : item.id === parsed.data.week);
  const archived = named?.kept && !weekPlan(sorare, named.id) ? await loadSorareWeek(named.slug) : null;
  const frozen = named?.status === "live" && !weekPlan(sorare, named.id) ? await loadFrozenPlan(named.slug, sorare) : null;
  const data = frozen ? { ...sorare, weeks: [...sorare.weeks, frozen] } : sorare;

  return NextResponse.json({ ok: true, ...overlayNumbers(data, loaded.grid, parsed.data, new Date(), archived) }, { headers: NO_STORE });
}
