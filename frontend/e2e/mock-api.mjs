// Deterministic stand-in for the FastAPI backend during end-to-end tests: no database, no network.
// Serves a recorded grid (e2e/fixtures/grid-response.json), a Sorare gameweek (e2e/fixtures/sorare-response.json),
// a scripted refresh run, and the two GitHub Actions endpoints the Refresh button uses (the app's
// GITHUB_API_URL points at /github here).
import { readFileSync } from "node:fs";
import { createServer } from "node:http";

export const MOCK_PORT = Number(process.env.E2E_MOCK_PORT ?? 8765);
const TOKEN = process.env.E2E_REFRESH_TOKEN ?? "";
const GITHUB_TOKEN = process.env.E2E_GITHUB_TOKEN ?? "";
const GITHUB_POLLS = 3; // status checks before the scripted workflow run completes
const recorded = JSON.parse(readFileSync(new URL("./fixtures/grid-response.json", import.meta.url), "utf8"));
const sorareFixture = JSON.parse(readFileSync(new URL("./fixtures/sorare-response.json", import.meta.url), "utf8"));
const STEPS = ["sync", "odds", "predict", "sorare", "publish"]; // the steps the job really runs, in order
const COOLDOWN_S = 600;

// The Sorare page counts down to the lock, so the recorded gameweek is moved forward once, at start-up,
// to sit two days ahead of the machine's clock. Every date in the payload shifts by the same amount, so
// the gameweek that was played stays played.
const ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})$/;
const plannedWeek = sorareFixture.data.weeks.find((week) => week.gameweek.id === sorareFixture.data.nextId);
const SHIFT = Date.now() + 2 * 86_400_000 - new Date(plannedWeek.gameweek.lock).getTime();
const moved = (value) => {
  if (typeof value === "string") return ISO.test(value) ? new Date(new Date(value).getTime() + SHIFT).toISOString() : value;
  if (Array.isArray(value)) return value.map(moved);
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, moved(v)]));
  return value;
};
const sorare = { ...sorareFixture, data: moved(sorareFixture.data) };
// The grid moves by the same amount, so each LaLiga round keeps its place among Sorare's weeks whatever the day: the
// planned week holds no round, and rounds 8 and 9 lie beyond Sorare's weeks (their early plans). With the grid left
// where it was recorded, the Sorare weeks slid one day a day onto those rounds, and on 3 Oct 2026 the tests built on
// that broke.
const grid = { ...recorded, data: moved(recorded.data) };

// Two LaLiga rounds Sorare has not opened get an early plan the job kept apart (`read_models` key `sorare_ahead:<round>`):
// the week being planned, built again as an early plan for that round, with one plan.
const planning = sorare.data.weeks.find((week) => week.gameweek.id === sorare.data.nextId);
// Futbol Fantasy's page for each game of the planned week, as the job publishes it (`ffMatch`): the ten matches of the Lineups recording, in turn.
{
  const ids = JSON.parse(readFileSync(new URL("./fixtures/lineups-response.json", import.meta.url), "utf8")).data.matches.map((match) => match.id);
  planning.playing.players.forEach((player, index) => {
    const id = ids[index % ids.length];
    for (const game of player.games) game.ffMatch = { id, url: `https://www.futbolfantasy.com/laliga/partidos/${id}` };
  });
}
// Three of the planned week's playing players are cards of the recorded collection (the recording names others), each with what Futbol Fantasy,
// Sorare and Sofix say of his chance to start: all three, then Sorare's and Sofix's, then Sofix's alone. The rest say nothing.
[
  { pStart: 0.8, startSource: "futbolfantasy", sources: { futbolfantasy: 0.8, sorare: 0.7, sofix: 0.54 } },
  { pStart: 0.7, startSource: "sorare", sources: { sorare: 0.7, sofix: 0.6 } },
  { pStart: 0.6, startSource: "sofix", sources: { sofix: 0.6 } },
].forEach((extra, index) => Object.assign(planning.playing.players[index], { player: sorare.data.collection[index].player }, extra));
// The first of them carries the picture of his game the panel and the Players page draw (`shape`, `onShape`).
Object.assign(planning.playing.players[0], {
  start: 52,
  shape: { p: 0.28, dec: 84, plain: 51, sdDec: 9, sdPlain: 15, low: 41, high: 80, why: [["Form", 7], ["Attack", 5]] },
  onShape: { p: 0.07, dec: 70, plain: 43, sdDec: 8, sdPlain: 7, low: 33, high: 62, why: [["Minutes", -19]] },
});

// The Home's team news (`teamNews` of the gameweek being planned, built by backend/app/sorare/ff_news.py): four of the first lineup's
// starters under 70%, and five players who moved since a reading a day old, so the tile has something of each to draw.
{
  const first = planning.plans[0]?.lineups?.[0];
  const ago = (hours) => new Date(Date.now() - hours * 3_600_000).toISOString();
  const gameOf = (card, index) => ({
    id: `news-${index}`,
    kickoff: card.fixture?.kickoff ?? planning.gameweek.lock,
    team: card.fixture?.team ?? null,
    opponent: card.fixture?.opponent ?? "Opponent",
    venue: card.fixture?.venue ?? "H",
  });
  const who = (card) => ({ player: card.slug, name: card.name, pos: card.pos, rarity: card.rarity, pic: card.pic });
  const starters = first?.starters ?? [];
  // The first lineup's cards carry a start chance and whose it is, as the job publishes them: FF (with a doubt), SO, then SF.
  [
    { pStart: 0.5, startSource: "futbolfantasy", ffKind: "doubt" },
    { pStart: 0.8, startSource: "sorare" },
    { pStart: 0.54, startSource: "sofix" },
  ].forEach((extra, index) => starters[index] && Object.assign(starters[index], extra));
  const others = planning.playing.players.slice(0, 5);
  planning.teamNews = {
    readAt: ago(0.15),
    players: 73,
    without: 11,
    split: { likely: 35, doubtful: 21, unlikely: 16, out: 1 },
    atRisk: {
      total: Math.min(starters.length, 4),
      players: starters.slice(0, 4).map((card, index) => ({ ...who(card), comp: first.comp, captain: false, game: gameOf(card, index), p: 0.5, kind: index < 2 ? "doubt" : null })),
    },
    moved: {
      since: ago(24), // a reading a day old: "since yesterday" at any hour (20 h ago is still today after 20:00)
      total: others.length,
      players: others.map((player, index) => ({
        player: player.player ?? player.name, name: player.name, pos: player.pos, rarity: player.rarity, pic: player.pic,
        from: index % 2 ? 20 : 80, to: index % 2 ? 40 : index === 0 ? 0 : 50, kind: index === 0 ? "out" : index === 2 ? "doubt" : null,
        game: gameOf({ fixture: player.games[0] ? { ...player.games[0] } : null }, index),
      })),
    },
  };
}
// The same payload when Futbol Fantasy has told the job nothing about the planned week (no `teamNews`): once as a week of club games,
// once as a break whose games are all a national team's (GW19 in October), for the Home's team-news tile.
const idleSorare = Object.fromEntries(
  [["laliga", false], ["national", true]].map(([kind, national]) => {
    const data = structuredClone(sorare.data);
    const week = data.weeks.find((one) => one.gameweek.id === data.nextId);
    delete week.teamNews;
    // The recording names a game's competition by its display name; Sorare's API (and the job) give its slug.
    for (const player of week.playing.players) for (const game of player.games) if (game.competition === "LaLiga") game.competition = "laliga-es";
    if (national) {
      for (const player of week.playing.players) for (const game of player.games) game.competition = "uefa-nations-league";
      // A few players' clubs play on during the break (Segunda, Argentina: 4 of 19 on the first of October): still a national-team week.
      for (const player of week.playing.players.slice(-2)) for (const game of player.games) game.competition = "segunda-division-es";
      // And a week of Sorare's with national-team games only, far from any LaLiga round (GW19 of the real season): the one a Lineups link names.
      const gameweek = { ...week.gameweek, id: "9019", slug: "football-2-6-jan-2030", number: 19, name: "Game Week 19", start: "2030-01-02T14:00:00Z", end: "2030-01-06T14:00:00Z", lock: "2030-01-02T14:00:00Z" };
      data.weeks.push({ ...structuredClone(week), gameweek });
      data.timeline.push({ id: gameweek.id, slug: gameweek.slug, number: 19, start: gameweek.start, end: gameweek.end, lock: gameweek.lock, status: "later" });
    }
    return [kind, { ...sorare, data }];
  }),
);
// The planned week with its last lineup for a competition Sorare has not listed yet (copied from GW15): the mixed case.
idleSorare.expected = (() => {
  const data = structuredClone(sorare.data);
  const week = data.weeks.find((one) => one.gameweek.id === data.nextId);
  const key = week.plans[0].lineups.at(-1).key;
  for (const plan of week.plans) for (const lineup of plan.lineups) if (lineup.key === key) Object.assign(lineup, { expected: true, expectedFrom: "GW15" });
  for (const option of week.playable) if (option.key === key) Object.assign(option, { expected: true, expectedFrom: "GW15" });
  return { ...sorare, data };
})();
const earlyWeeks = new Map(
  recorded.data.matchdays
    .filter((matchday) => matchday.number === 8 || matchday.number === 9)
    .map((matchday) => {
      const gameweek = { ...planning.gameweek, id: `md${matchday.number}`, slug: `projected-md${matchday.number}`, number: 0, name: `LaLiga GW${matchday.number}` };
      const week = { ...structuredClone(planning), gameweek, source: "form", plans: structuredClone(planning.plans.slice(0, 1)), projected: { round: matchday.number, basedOn: "GW15", expected: true } };
      // The early plan's competitions are the ones Sorare is going to open, copied from a finished week (backend/app/sorare/expected.py).
      for (const lineup of week.plans[0]?.lineups ?? []) Object.assign(lineup, { expected: true, expectedFrom: "GW15" });
      for (const option of week.playable) Object.assign(option, { expected: true, expectedFrom: "GW15" });
      return [matchday.number, week];
    }),
);
sorare.data.projected = [...earlyWeeks].map(([round, week]) => ({
  round, id: week.gameweek.id, from: week.gameweek.start, to: week.gameweek.end, cards: week.playing.cards, plans: week.plans.length, expected: true,
}));

// A finished week the job kept apart (`read_models` key `sorare_week:<slug>`): the timeline marks GW14 as kept, and it
// is served here by its slug as the played week with GW14's own dates.
const keptWeeks = new Map(
  sorare.data.timeline
    .filter((item) => item.kept && !sorare.data.weeks.some((week) => week.gameweek.id === item.id))
    .map((item) => {
      const played = sorare.data.weeks.find((week) => week.gameweek.id === sorare.data.lastId);
      const gameweek = { ...played.gameweek, id: item.id, slug: item.slug, number: item.number, name: `Game Week ${item.number}`, start: item.start, end: item.end, lock: item.lock };
      return [item.slug, { ...structuredClone(played), gameweek }];
    }),
);

// Futbol Fantasy's lineups (`read_models` key `lineups`): the ten real round-8 pages of 30 Sep 2026, moved forward once like the
// Sorare week so the first kickoff sits two days ahead; each reading is made a few minutes ago and each side's change a day or so ago.
const lineupsFixture = JSON.parse(readFileSync(new URL("./fixtures/lineups-response.json", import.meta.url), "utf8"));
const firstKickoff = Math.min(...lineupsFixture.data.matches.map((match) => new Date(match.kickoff).getTime()));
const LINEUPS_SHIFT = Date.now() + 2 * 86_400_000 - firstKickoff;
// What the site really writes beside an injury (the causes, dates and notes of its 1 Oct pages), on the Real Sociedad match, built from today's
// date so the "return has gone by" case stays true whenever the tests run: began 60 days ago, due back by the end of the month of 45 days ago.
function spanishInjuries(match) {
  const ES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
  const daysAgo = (days) => new Date(Date.now() - days * 86_400_000);
  const desde = (days) => `Desde ${daysAgo(days).getDate()}/${daysAgo(days).getMonth() + 1} (${days} días)`;
  const by = (name) => (match.home.absent.find((a) => a.name === name) ?? match.away.absent.find((a) => a.name === name));
  Object.assign(by("Álvaro Odriozola"), { cause: "Rotura de lig. cruzado anterior", since: desde(60), note: `Baja hasta finales de ${ES[daysAgo(45).getMonth()]}` });
  Object.assign(by("Igor Zubeldia"), { cause: "Molestias en los isquiotibiales", since: desde(12), note: "Duda para la jornada 8" });
  Object.assign(by("Orri Steinn Óskarsson"), { cause: "Roja directa", note: "Baja confirmada para la jornada 8" });
  Object.assign(by("Marc Casadó"), { cause: "Pubalgia" });
  Object.assign(by("Lorenzo Amatucci"), { cause: "Sobrecarga muscular", note: "Disponible para la jornada 8" });
}
// Two of each side's eleven are called up by their national team; only Deportivo has named its match squad, so only its two show it.
function calledUp(match) {
  for (const side of [match.home, match.away]) side.rows.flatMap((row) => row.players).filter((player) => !player.status?.kind).slice(0, 2).forEach((one, index) => (one.status = { ...one.status, international: true, nat: ["KE", "ES"][index] }));
  match.away.squad = true;
}
const lineupsPayload = (() => {
  const data = structuredClone(lineupsFixture.data);
  const ago = (hours) => new Date(Date.now() - hours * 3_600_000).toISOString();
  data.generatedAt = ago(0.1);
  data.readAt = ago(0.1);
  for (const match of data.matches) {
    match.kickoff = new Date(new Date(match.kickoff).getTime() + LINEUPS_SHIFT).toISOString();
    match.readAt = ago(0.1);
    for (const side of [match.home, match.away]) if (side.changedAt) side.changedAt = ago(20);
  }
  // One match that names none of the owner's players (Levante–Sevilla), so the strip's empty state has something to show.
  const quiet = data.matches.find((match) => match.id === 22496);
  for (const side of [quiet.home, quiet.away]) for (const one of [...side.rows.flatMap((row) => row.players), ...side.alternatives]) delete one.yours;
  // Who the live page of 2 Oct puts under each starter's own card on Alavés–Atlético (read with the parser, ids as the page has them): Valentini
  // under Jonny Castro, Mariano under Toni Martínez, Aleñá under Denis Suárez; and Lookman under both Lee and Grimaldo.
  const next = { home: { 189: ["14979"], 5032: ["3226"], 1778: ["2759"] }, away: { 6337: ["4434"], 12647: ["63"], 9573: ["10287"], 2771: ["4434"] } };
  const slots = data.matches.find((match) => match.id === 22493);
  for (const [place, mapping] of Object.entries(next)) for (const one of slots[place].rows.flatMap((row) => row.players)) if (mapping[one.id]) one.next = mapping[one.id];
  // A real Sorare card for each player of Alavés–Atlético the owner does not have (the job's `art`, by Futbol Fantasy id); the other matches have none.
  data.art = {};
  for (const side of [slots.home, slots.away]) for (const one of [...side.rows.flatMap((row) => row.players), ...side.alternatives]) if (!one.yours) data.art[one.id] = `https://assets.sorare.com/card/e2e-${one.id}/picture/card.png`;
  const sociedad = data.matches.find((match) => match.id === 22502);
  spanishInjuries(sociedad);
  calledUp(sociedad);
  return { success: true, data };
})();

// Give the three scripted source forecasts their recorded FF match/player identity for the Lineups source switch.
for (const player of planning.playing.players.slice(0, 3)) {
  const first = [...player.games].sort((a, b) => a.kickoff.localeCompare(b.kickoff))[0];
  if (!first) continue;
  for (const match of lineupsPayload.data.matches) for (const side of [match.home, match.away]) {
    const linked = [...side.rows.flatMap((row) => row.players), ...side.alternatives].find((one) => one.yours === player.player);
    if (linked) Object.assign(first, { ffMatch: { id: match.id, url: match.url }, ffPlayer: linked.id });
  }
}

// The Audit page (`read_models` key `audit`): the page the job would publish on 2 Oct as it is (Sofix's chance written down for GW19's games, none
// played yet; the replay of the past from the committed file), and the same page once the record has enough games to give figures, so the figures,
// their wording and the bands have something to draw.
const auditFixture = JSON.parse(readFileSync(new URL("./fixtures/audit-response.json", import.meta.url), "utf8"));
function auditPayload(kind) {
  const data = structuredClone(auditFixture.data);
  data.generatedAt = new Date(Date.now() - 30 * 60_000).toISOString();
  if (kind === "enough") {
    const band = (from, to, n, said, was) => ({ from, to, n, said, was });
    Object.assign(data.starts.live.futbolfantasy, {
      state: "enough", recorded: 140, settled: 120, right: 0.74, brier: 0.17, mean: 0.52, started: 0.5,
      buckets: [band(0, 0.2, 30, 0.1, 0.12), band(0.2, 0.5, 20, 0.35, 0.4), band(0.5, 0.8, 30, 0.65, 0.7), band(0.8, 1, 40, 0.9, 0.88)],
    });
    Object.assign(data.starts.live.sofix, { state: "few", recorded: 64, settled: 40 });
    Object.assign(data.xscore.live, { state: "enough", noted: 40, marked: 38, pairs: 130, weeks: 8, rate: 0.64, lo: 0.58, hi: 0.69 });
  }
  return { success: true, data };
}

let state;
function reset() {
  state = { mode: "ok", sorare: "ok", news: null, audit: "ok", nextId: 1, run: null, polls: 0 };
}
reset();

function runOut(run) {
  return {
    id: run.id, trigger: run.trigger, status: run.status, step: run.step,
    started_at: new Date(run.startedAt).toISOString(),
    finished_at: run.finishedAt ? new Date(run.finishedAt).toISOString() : null,
    error: null, steps: run.steps,
  };
}
function status() {
  const run = state.run;
  const retryAfter = run ? Math.max(0, Math.ceil(COOLDOWN_S - (Date.now() - run.startedAt) / 1000)) : 0;
  return { run: run ? runOut(run) : null, retry_after: retryAfter };
}
function finishedRun(trigger) {
  const now = Date.now();
  return { id: state.nextId++, trigger, status: "succeeded", step: null, startedAt: now - COOLDOWN_S * 1000, finishedAt: now, steps: {} };
}

function send(res, code, body) {
  res.writeHead(code, { "content-type": "application/json", "cache-control": "no-store" });
  res.end(JSON.stringify(body));
}

const server = createServer((req, res) => {
  const url = new URL(req.url ?? "/", `http://127.0.0.1:${MOCK_PORT}`);
  const admin = url.pathname.startsWith("/api/admin/");
  if (admin && req.headers.authorization !== `Bearer ${TOKEN}`) {
    return send(res, 401, { success: false, data: null, error: "Not authorised.", meta: null });
  }

  if (req.method === "GET" && url.pathname === "/api/health") return send(res, 200, { ok: true });

  if (req.method === "GET" && url.pathname === "/api/fixture-grid") {
    if (state.mode === "malformed") return send(res, 200, { success: true, data: { season: 2026, teams: "broken" }, meta: null });
    const minutesAgo = (m) => new Date(Date.now() - m * 60_000).toISOString();
    return send(res, 200, {
      ...grid,
      meta: { ...grid.meta, last_synced_at: minutesAgo(12), last_predicted_at: minutesAgo(12) },
    });
  }

  if (req.method === "GET" && url.pathname === "/api/sorare") {
    if (state.sorare === "missing") {
      return send(res, 200, { success: false, data: null, error: "Sorare has not been synced yet.", meta: null });
    }
    return send(res, 200, idleSorare[state.news] ?? sorare);
  }

  if (req.method === "GET" && url.pathname === "/api/missions") {
    // The three pickers of the Limited tab, as the extension reads them from Sorare's Missions page (`collectMissions` in extension/core.js).
    const picker = (id, title, description) => ({ id, title, description, mode: "DECISIVE", picks: 3, made: 0, period: "DAILY", state: "READY" });
    return send(res, 200, {
      success: true,
      data: {
        limited: {
          seen_at: new Date(Date.now() - (state.missions === "stale" ? 2 * 86_400_000 : 0)).toISOString(),
          missions: [
            picker("t1", "Decisive Picker", "Earn 200 XP for each player you select who gets a positive decisive action in today's matches."),
            picker("t2", "Interception - All Matches", "Classic: Pick a player who makes 2+ interceptions in any match and win 50 All-Star Essence per correct choice."),
            picker("t3", "Assist - All Matches", "Classic: Pick a player who gets an assist in any match and win 50 All-Star Essence per correct choice."),
          ],
        },
      },
    });
  }
  if (req.method === "GET" && url.pathname === "/api/lineups") {
    if (state.sorare === "missing") return send(res, 200, { success: false, data: null, error: "Futbol Fantasy's lineups have not been read yet." });
    return send(res, 200, lineupsPayload);
  }

  if (req.method === "GET" && url.pathname === "/api/audit") {
    if (state.audit === "missing") return send(res, 200, { success: false, data: null, error: "The audit has not been written yet." });
    return send(res, 200, auditPayload(state.audit));
  }

  const earlyWeek = url.pathname.match(/^\/api\/sorare\/ahead\/(\d+)$/);
  if (req.method === "GET" && earlyWeek) {
    const early = state.sorare === "ok" ? earlyWeeks.get(Number(earlyWeek[1])) : undefined;
    return send(res, 200, early ? { success: true, data: early } : { success: false, data: null, error: "There is no early plan for this round." });
  }

  const keptWeek = url.pathname.match(/^\/api\/sorare\/week\/([a-z0-9-]+)$/);
  if (req.method === "GET" && keptWeek) {
    const kept = state.sorare === "ok" ? keptWeeks.get(keptWeek[1]) : undefined;
    return send(res, 200, kept ? { success: true, data: kept } : { success: false, data: null, error: "Sofix did not keep this gameweek." });
  }

  if (req.method === "POST" && url.pathname === "/api/admin/refresh") {
    const run = state.run;
    if (run?.status === "running") return send(res, 409, { success: false, data: status(), error: "A refresh is already running.", meta: null });
    if (run && status().retry_after > 0) {
      res.setHeader("retry-after", String(status().retry_after));
      return send(res, 429, { success: false, data: status(), error: "Refreshed recently. Try again later.", meta: null });
    }
    state.run = { id: state.nextId++, trigger: "button", status: "running", step: null, startedAt: Date.now(), finishedAt: null, steps: {} };
    state.polls = 0;
    return send(res, 202, { success: true, data: status(), error: null, meta: null });
  }

  if (req.method === "GET" && url.pathname === "/api/admin/refresh/latest") {
    const run = state.run;
    if (run?.status === "running") {
      state.polls += 1;
      if (state.polls > STEPS.length) {
        Object.assign(run, { status: "succeeded", step: null, finishedAt: Date.now() });
      } else {
        const step = STEPS[state.polls - 1];
        for (const done of STEPS.slice(0, state.polls - 1)) run.steps[done] = "succeeded";
        run.step = step;
      }
    }
    return send(res, 200, { success: true, data: status(), error: null, meta: null });
  }

  // GitHub Actions stand-in: start the refresh workflow, and report its latest run.
  const gh = url.pathname.match(/^\/github\/repos\/[^/]+\/[^/]+\/actions\/workflows\/refresh\.yml\/(runs|dispatches)$/);
  if (gh) {
    if (req.headers.authorization !== `Bearer ${GITHUB_TOKEN}`) return send(res, 401, { message: "Bad credentials" });
    if (gh[1] === "dispatches" && req.method === "POST") {
      state.run = { id: state.nextId++, trigger: "button", status: "running", step: null, startedAt: Date.now(), finishedAt: null, steps: {} };
      state.polls = 0;
      res.writeHead(204);
      return res.end();
    }
    if (gh[1] === "runs" && req.method === "GET") {
      const run = state.run;
      if (run?.status === "running") {
        state.polls += 1;
        if (state.polls > GITHUB_POLLS) Object.assign(run, { status: "succeeded", finishedAt: Date.now() });
      }
      const workflow = run && {
        id: run.id,
        status: run.status === "running" ? (state.polls <= 1 ? "queued" : "in_progress") : "completed",
        conclusion: run.status === "running" ? null : "success",
        created_at: new Date(run.startedAt).toISOString(),
        updated_at: new Date(run.finishedAt ?? Date.now()).toISOString(),
      };
      return send(res, 200, { total_count: workflow ? 1 : 0, workflow_runs: workflow ? [workflow] : [] });
    }
  }

  // Test controls. Switching the payload also records a finished run, so the app's refresh route
  // revalidates its cached grid on the next status check.
  if (req.method === "POST" && url.pathname === "/__test/reset") {
    reset();
    state.run = finishedRun("cli");
    return send(res, 200, { ok: true });
  }
  if (req.method === "POST" && url.pathname === "/__test/mode") {
    state.mode = url.searchParams.get("mode") === "malformed" ? "malformed" : "ok";
    state.sorare = url.searchParams.get("sorare") === "missing" ? "missing" : "ok";
    state.news = url.searchParams.get("news"); // "laliga" or "national": the planned week with no team news
    state.missions = url.searchParams.get("missions") ?? "ok"; // "stale": the last list was loaded two days ago
    state.audit = url.searchParams.get("audit") ?? "ok"; // "missing": the page was never written; "enough": the record has enough games for figures
    state.run = finishedRun("cli");
    return send(res, 200, { ok: true, mode: state.mode, sorare: state.sorare, news: state.news, audit: state.audit });
  }

  send(res, 404, { success: false, error: "Not found." });
});

server.listen(MOCK_PORT, "127.0.0.1", () => {
  console.info(`[mock-api] listening on http://127.0.0.1:${MOCK_PORT}`);
});
