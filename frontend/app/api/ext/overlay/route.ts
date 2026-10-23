import { NextResponse, type NextRequest } from "next/server";
import { loadGrid } from "../../../../lib/api";
import { authorised } from "../../../../lib/extAuth";
import { dockMissions, OverlayRequest, overlayNumbers, overlayProfile, overlayWorth, proPlan, withRebuild } from "../../../../lib/overlay";
import { loadMissions } from "../../../../lib/missionsData";
import { loadMissionPool } from "../../../../lib/missionsPool";
import { missionsToday } from "../../../../lib/missionsToday";
import { scoringWeek, weekPlan } from "../../../../lib/play";
import { loadFrozenPlan, loadLeagueMarket, loadPlayerForecasts, loadProRebuild, loadSorare, loadSorareWeek } from "../../../../lib/playData";
import { planPlayer } from "../../../../lib/playerPage";
import { weekContext } from "../../../../lib/weeks";
import { marketForWeek } from "../../../../lib/playerForecasts";
import { BOARD_OF } from "../../../../lib/arcadeFdr";

// The numbers the Chrome extension draws on sorare.com's cards (extension/overlay.js). Which cards a page shows
// is only ever sent here, to your own app; nothing goes to a third party. It reads the read models the app
// already caches, so a call costs no database query of its own. Every answer is private to the extension.
export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "no-store" };

export async function POST(request: NextRequest) {
  if (!authorised(request)) return NextResponse.json({ ok: false, error: "Not authorised." }, { status: 401, headers: NO_STORE });
  const parsed = OverlayRequest.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ ok: false, error: "Bad request." }, { status: 400, headers: NO_STORE });

  const [sorare, loaded, pl, bl, fl, plPlayers, blPlayers, flPlayers, cl, el, clPlayers, elPlayers] = await Promise.all([
    loadSorare(), loadGrid(), loadGrid("PL"), loadGrid("BL1"), loadGrid("FL1"), loadLeagueMarket("PL"), loadLeagueMarket("BL1"), loadLeagueMarket("FL1"), loadGrid("CL"), loadGrid("EL"), loadLeagueMarket("CL"), loadLeagueMarket("EL"),
  ]);
  if (!sorare) return NextResponse.json({ ok: false, error: "Sorare has not been synced yet." }, { status: 503, headers: NO_STORE });

  // A page about a finished gameweek the job kept apart (and the page no longer holds) is answered from that copy; one
  // about a week nobody kept is answered with nothing, so no read is made for it.
  const named = sorare.timeline?.find((item) => parsed.data.fixture ? item.slug === parsed.data.fixture : item.id === parsed.data.week);
  const archived = named?.kept && !weekPlan(sorare, named.id) ? await loadSorareWeek(named.slug) : null;
  const frozen = named?.status === "live" && !weekPlan(sorare, named.id) ? await loadFrozenPlan(named.slug, sorare) : null;
  const data = frozen ? { ...sorare, weeks: [...sorare.weeks, frozen] } : sorare;

  // Today's missions only when the dock asks (its Missions tab): the same cached reads and picks as the Missions page.
  const now = new Date();
  const missions = parsed.data.missions
    ? dockMissions(await missionsToday(sorare, await loadMissions(), undefined, now, await loadMissionPool()))
    : undefined;
  // Every LaLiga, Premier League, Bundesliga and Ligue 1 player Sofix rates, so Arcade commons and players you do not hold get numbers too.
  const others = { market: [...(sorare.market ?? []), ...plPlayers, ...blPlayers, ...flPlayers, ...clPlayers, ...elPlayers], grids: [loaded.grid, pl.grid, bl.grid, fl.grid, cl.grid, el.grid] };
  const numbers = overlayNumbers(data, loaded.grid, parsed.data, now, archived, others);
  // The dock, on a page naming no gameweek or the one being played: while that week has Pro lineups before their first kickoff,
  // those come first (they are the only lineups still open); else the week asked for, or the one being planned.
  const scoring = parsed.data.plan && !parsed.data.week ? scoringWeek(sorare) : null;
  const live = scoring && (!parsed.data.fixture || parsed.data.fixture === scoring.slug) ? scoring : null;
  const playing = live ? (weekPlan(sorare, live.id) ?? await loadFrozenPlan(live.slug, sorare)) : null;
  const pro = playing ? proPlan(playing, now) : null;
  // Pro rebuilt on the announced elevens, for Guide me (plans/load-from-sorare.md)
  const planned = pro ? playing : weekPlan(sorare, sorare.nextId);
  const shown = pro ?? numbers.plan;
  const rebuild = shown?.state === "ready" && planned && shown.fixture === planned.gameweek.slug ? await loadProRebuild(planned.gameweek.slug) : null;
  const plan = shown && planned?.plans[0] ? withRebuild(shown, rebuild, planned.plans[0].rank) : shown;
  const worth = parsed.data.worth ? overlayWorth(sorare) : undefined; // your gallery's prices, from the same cached read
  // A player's Sorare page: read as /players/<slug> reads him for the week in the top bar (cached reads), so the two agree.
  let profile = null;
  if (parsed.data.profile) {
    const slug = parsed.data.profile;
    const week = weekContext(loaded.grid, sorare, now);
    const forecasts = week.current?.gw ? await loadPlayerForecasts(sorare, week.current.gw) : null;
    const planned = forecasts?.plan?.playing.players.find((p) => p.player === slug) ?? planPlayer(sorare, slug, week.current?.gw ?? sorare.nextId);
    const selected = week.current?.gw ? sorare.timeline.find(w => w.id === week.current!.gw) : undefined;
    const foreign = selected ? marketForWeek(others.market, sorare.nextId, selected, forecasts?.plan ?? null, forecasts?.record ?? null) : [];
    const market = (forecasts?.market ?? sorare.market)?.find((p) => p.slug === slug) ?? foreign.find(p => p.slug === slug) ?? null;
    const code = BOARD_OF[planned?.games[0]?.competition ?? market?.fixture?.competition ?? ""];
    const board = code ? others.grids.find(g => (g?.competition ?? "PD") === code) ?? null : loaded.grid;
    profile = overlayProfile(sorare, board, slug, { plan: forecasts?.plan ?? weekPlan(sorare, sorare.nextId), planned, market }, now);
  }
  return NextResponse.json(
    { ok: true, ...numbers, ...(plan ? { plan } : {}), ...(missions ? { missions } : {}), ...(worth ? { worth } : {}), ...(parsed.data.profile ? { profile } : {}) },
    { headers: NO_STORE },
  );
}
