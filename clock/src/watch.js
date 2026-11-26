// The Pro teamsheet watch (plans/pro-page.md, "Teamsheet watch"). Every 5 minutes it reads the games the refresh listed
// (R2 blocks/pro_watch.json). For each one from 75 minutes before kickoff to kickoff whose two sides are not both on the Pro page,
// it asks Sorare's public API for the formations; when a side is newly out it starts pro-sheets.yml, which plans the week again.
// It writes when it last looked (blocks/pro_watch_beat.json) for the page. Vercel and Neon are never asked.

import { githubHeaders } from "./clock.js";

const EVERY = 5; // minutes: the owner's "Each 5 min from 1h -15min to game time until they are out"
const AHEAD = 75 * 60_000;
const GAP = 4 * 60_000; // a run started this recently is still working on it (pro-sheets.yml takes under a minute)
const SORARE = "https://api.sorare.com/graphql";
const QUERY = `query ProWatch($id:ID!){anyGame(id:$id){... on Game{
  homeFormation{startingLineupAvailable startingLineup{slug}} awayFormation{startingLineupAvailable startingLineup{slug}}}}}`;
export const WATCH = "blocks/pro_watch.json";
export const BEAT = "blocks/pro_watch_beat.json";

/** The games to look at now: from 75 minutes before kickoff to kickoff, while a side is not applied yet. */
export function watched(watch, now) {
  const at = now.getTime();
  return (watch?.games ?? []).filter((g) => {
    const kickoff = Date.parse(g.kickoff);
    return at >= kickoff - AHEAD && at < kickoff && (watch.applied?.[g.id] ?? 0) < 2;
  });
}

/** How many sides of a game Sorare has announced, counting a side only once all eleven are in (as the job does). */
export async function sides(id, fetch) {
  const response = await fetch(SORARE, {
    method: "POST",
    headers: { "content-type": "application/json", "user-agent": "Sofix-clock/1.0 (personal; Pro teamsheets)" },
    body: JSON.stringify({ query: QUERY, variables: { id } }),
  });
  if (!response.ok) throw new Error(`Sorare answered ${response.status}`);
  const game = (await response.json())?.data?.anyGame;
  if (!game) throw new Error("Sorare gave no game");
  return [game.homeFormation, game.awayFormation].filter((f) => f?.startingLineupAvailable && f.startingLineup.flat().length === 11).length;
}

async function start(timetable, env, now, fetch) {
  const headers = githubHeaders(env.GITHUB_TOKEN);
  const base = `https://api.github.com/repos/${timetable.repo}/actions/workflows/pro-sheets.yml`;
  const since = encodeURIComponent(`>=${new Date(now.getTime() - GAP).toISOString().slice(0, 19)}Z`);
  const list = await fetch(`${base}/runs?created=${since}&per_page=1`, { headers });
  if (!list.ok) throw new Error(`GitHub answered ${list.status}`);
  if ((await list.json()).total_count > 0) return "teams out: pro-sheets.yml already started";
  const go = await fetch(`${base}/dispatches`, { method: "POST", headers, body: JSON.stringify({ ref: timetable.ref }) });
  if (!go.ok) throw new Error(`GitHub answered ${go.status}`);
  return "teams out: started pro-sheets.yml";
}

/** One look, on the minutes divisible by 5. Returns one line per thing worth logging. */
export async function watch(timetable, env, now, fetch = globalThis.fetch) {
  if (now.getUTCMinutes() % EVERY) return [];
  if (!env.PAGES) return ["PAGES (R2) is not bound: no Pro teamsheet watch"];
  const object = await env.PAGES.get(WATCH);
  if (!object) return [];
  const payload = (await object.json()).payload;
  const list = watched(payload, now);
  if (!list.length) return [];
  const log = [];
  const seen = {};
  let fresh = false;
  for (const game of list) {
    try {
      seen[game.id] = await sides(game.id, fetch);
      fresh ||= seen[game.id] > (payload.applied?.[game.id] ?? 0);
    } catch (error) {
      seen[game.id] = null;
      log.push(`${game.id}: ${error.message}`);
    }
  }
  const at = now.toISOString();
  await env.PAGES.put(BEAT, JSON.stringify({ updatedAt: at, payload: { checkedAt: at, games: seen } }), {
    httpMetadata: { contentType: "application/json" },
  });
  if (!fresh) return log;
  if (!env.GITHUB_TOKEN) return [...log, "teams out, but GITHUB_TOKEN is not set: nothing started"];
  try {
    log.push(await start(timetable, env, now, fetch));
  } catch (error) {
    log.push(`teams out, pro-sheets.yml failed: ${error.message}`);
  }
  return log;
}
