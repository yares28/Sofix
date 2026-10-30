// Sofix extension, background worker.
// - Tells the app it is alive and which Sorare account is signed in: only when that changes, otherwise every
//   6 hours (each check-in wakes the free Neon database, so it stays rare).
// - Answers the app's "ping" so the app knows the extension is installed (externally_connectable).
// It never sends Sorare credentials anywhere: only the version and the account's public nickname.
import { CONFIG } from "./config.js";
import "./core.js"; // the page reader and the formula the overlay shares: sets globalThis.__sofixCore

const VERSION = chrome.runtime.getManifest().version;
const CHECKIN_MS = 6 * 60 * 60 * 1000;

async function checkIn(force = false) {
  const { sorareUser = null, lastCheckin = 0, lastPayload = null } = await chrome.storage.local.get([
    "sorareUser",
    "lastCheckin",
    "lastPayload",
  ]);
  const payload = { version: VERSION, sorare_user: sorareUser };
  const unchanged = lastPayload && JSON.stringify(lastPayload) === JSON.stringify(payload);
  if (!force && unchanged && Date.now() - lastCheckin < CHECKIN_MS - 60_000) return;
  try {
    const response = await fetch(`${CONFIG.appUrl}/api/ext/checkin`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${CONFIG.token}`,
        "x-vercel-protection-bypass": CONFIG.bypass,
      },
      body: JSON.stringify(payload),
    });
    await chrome.storage.local.set({
      lastCheckin: Date.now(),
      lastPayload: response.ok ? payload : null,
      appReachable: response.ok,
      lastError: response.ok ? null : `HTTP ${response.status}`,
    });
  } catch (error) {
    await chrome.storage.local.set({ appReachable: false, lastError: error?.name ?? "network error" });
  }
}

chrome.runtime.onInstalled.addListener(() => {
  chrome.alarms.create("checkin", { periodInMinutes: 60 });
  checkIn(true);
  refreshSession(); // a sorare.com tab that is already open has no content script until we put one there
});
chrome.runtime.onStartup.addListener(() => {
  checkIn();
  refreshSession();
});
chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === "checkin") checkIn();
});

// The daily missions of one rarity, sent to the app only when they changed (the app ranks your cards for them). `force` sends them
// anyway, so the app learns they were read today even when they are yesterday's again. True when the app has them.
async function sendMissions(rarity, missions, force = false) {
  const clean = missions.map(({ rarity: _rarity, ...mission }) => mission);
  const { missionsSent = {} } = await chrome.storage.local.get("missionsSent");
  const text = JSON.stringify(clean);
  if (!force && missionsSent[rarity] === text) return true;
  try {
    const response = await fetch(`${CONFIG.appUrl}/api/ext/missions`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${CONFIG.token}`, "x-vercel-protection-bypass": CONFIG.bypass },
      body: JSON.stringify({ rarity, missions: clean }),
    });
    if (response.ok) await chrome.storage.local.set({ missionsSent: { ...missionsSent, [rarity]: text } });
    return response.ok;
  } catch {
    return false; // the next visit to the page, or the Load button, tries again
  }
}

// Sorare's starting chances (plans/sorare-start-chances.md). Sorare gives them only to its own page, so the page bridge passes on what
// that page loads and the app keeps it: a reading then outlives the tab it was seen in. Read only; nothing is asked of Sorare here.
const GAME_ID = /^Game:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const PLAYER_SLUG = /^[a-z0-9-]{1,160}$/;
const ROUND_WAIT_MS = 12000; // how long one match's page gets to answer
const ROUND_GRACE_MS = 2500; // and how long after its first answer, for the rest of the page's answers
const roundTabs = new Map(); // tab id -> what "Read the round" waits for from that tab
const chanceSends = new Set();
let roundRunning = false;

function cleanChances(rows) {
  return rows
    .filter((row) => typeof row?.game === "string" && GAME_ID.test(row.game) && typeof row.player === "string" && PLAYER_SLUG.test(row.player)
      && Number.isInteger(row.basisPoints) && row.basisPoints >= 0 && row.basisPoints <= 10000)
    .slice(0, 500)
    .map(({ game, player, basisPoints }) => ({ game, player, basisPoints }));
}

async function sendChances(rows) {
  try {
    const response = await fetch(`${CONFIG.appUrl}/api/ext/chances`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${CONFIG.token}`, "x-vercel-protection-bypass": CONFIG.bypass },
      body: JSON.stringify({ version: 1, rows }),
    });
    return response.ok;
  } catch {
    return false; // the page says a number again after five minutes, and that one is sent
  }
}

/**
 * "Read the round" on the app's Lineups page: each match's Sorare page is opened in a background tab, one at a time, left to load
 * (its starting chances reach the app through `chances-seen`), and closed. Answers how many players each match's page gave.
 */
async function readRound(targets) {
  if (roundRunning) return { state: "busy" };
  const { sorareUser = null } = await chrome.storage.local.get("sorareUser");
  if (!sorareUser) return { state: "signed-out" };
  roundRunning = true;
  const read = {};
  const deadline = Date.now() + 240000;
  try {
    for (const { id, player } of targets) {
      if (Date.now() > deadline) break;
      let tab;
      try {
        tab = await chrome.tabs.create({ url: `https://sorare.com/football/players/${player}?game=${encodeURIComponent(id)}`, active: false });
      } catch {
        continue;
      }
      const players = new Set();
      await new Promise((resolve) => {
        const timer = setTimeout(resolve, ROUND_WAIT_MS);
        let grace = 0;
        roundTabs.set(tab.id, (rows, games) => {
          for (const row of rows) if (row.game === id) players.add(row.player);
          if (!grace && games.includes(id)) grace = setTimeout(() => { clearTimeout(timer); resolve(); }, ROUND_GRACE_MS);
        });
      });
      roundTabs.delete(tab.id);
      try {
        await chrome.tabs.remove(tab.id);
      } catch {
        // he closed it himself
      }
      read[id] = players.size;
    }
    await Promise.allSettled([...chanceSends]);
  } finally {
    roundRunning = false;
  }
  return { state: "ok", read };
}

/**
 * "Read Arcade's start %" on the app's Arcade page (plans/set.md, step 2): your set board's compose page is opened in a tab,
 * each position is opened and its bench scrolled to the end, so Sorare's page loads every card's start %, which reaches the app
 * through `chances-seen` like any other. A tab in the background may not load more cards on scroll; then it is brought forward
 * for the walk and the tab you were on is given back. Answers how many players and games gave a number.
 */
async function readArcade(config, step, from = null) {
  if (roundRunning) return { state: "busy" };
  const { sorareUser = null } = await chrome.storage.local.get("sorareUser");
  if (!sorareUser) return { state: "signed-out" };
  roundRunning = true;
  const players = new Set();
  const games = new Set();
  let tab;
  try {
    // Next to the Arcade tab, in its window: a tab opened in another window stays hidden behind it.
    const place = from ? { windowId: from.windowId, index: from.index + 1 } : {};
    tab = await chrome.tabs.create({ url: `https://sorare.com/football/play/boards/pro/${config}/${step}/compose-team`, active: false, ...place });
    roundTabs.set(tab.id, (rows) => {
      for (const row of rows) {
        players.add(row.player);
        games.add(row.game);
      }
    });
    if (!(await waitForPage(tab.id))) return { state: "no-page" };
    let walk = await askTab(tab.id, { type: "sofix-arcade-walk-9" }, 200000);
    if (walk?.state === "hidden") {
      await chrome.tabs.update(tab.id, { active: true });
      if (from) await chrome.windows.update(from.windowId, { focused: true }).catch(() => {});
      walk = await askTab(tab.id, { type: "sofix-arcade-walk-9", waitVisible: true }, 200000);
    }
    await Promise.allSettled([...chanceSends]);
    return { state: walk?.state === "ok" ? "ok" : walk?.state ?? "error", players: players.size, games: games.size, cards: walk?.cards ?? null };
  } catch {
    return { state: "error" };
  } finally {
    roundRunning = false;
    if (tab) {
      roundTabs.delete(tab.id);
      try {
        await chrome.tabs.remove(tab.id);
      } catch {
        // he closed it himself
      }
    }
    if (from) chrome.tabs.update(from.id, { active: true }).catch(() => {});
  }
}

/** Until a tab's content script answers (its page has loaded), at most 20 s. */
async function waitForPage(tabId) {
  for (let i = 0; i < 40; i++) {
    const answer = await askTab(tabId, { type: "sofix-ping-9" }, 400);
    if (answer?.ok) return true;
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  return false;
}

// The rarities the app ranks missions for. One with no mission today is sent empty, so the app says so instead of showing an older list.
const MISSION_RARITIES = ["limited", "rare", "super_rare", "unique"];

/** Discover from the actual task, then page all owned eligible copies. Bounded reads, never a player-by-player loop. */
async function missionEligibility(outcomes, requestedAt) {
  const tasks = [...new Map(Object.values(outcomes).flatMap((o) => o.missions).map((m) => [m.id, m])).values()];
  const deadline = Date.parse(requestedAt) + 35_000;
  const start = new Date(requestedAt); start.setUTCHours(0, 0, 0, 0);
  const end = new Date(start.getTime() + 2 * 86400000);
  const games = new Map();
  const discovered = new Set();
  let pending = tasks.map((m) => ({ id: m.id }));
  for (let page = 0; pending.length && page < 4 && Date.now() < deadline; page++) {
    const again = [];
    for (let offset = 0; offset < pending.length && Date.now() < deadline; offset += 12) {
      const batch = pending.slice(offset, offset + 12);
      const answer = await throughSorare("SofixMissionGames", { tasks: batch, fromDate: start.toISOString(), toDate: end.toISOString() });
      if (answer.state !== "ok") return;
      batch.forEach((t, i) => {
        const result = answer.data?.currentUser?.[`t${i}`]?.pickableGames;
        if (!Array.isArray(result?.nodes)) return;
        const listed = games.get(t.id) ?? new Map();
        for (const n of result.nodes) if (/^Game:[a-f0-9-]{36}$/.test(n?.game?.id)) listed.set(n.game.id, n.game);
        games.set(t.id, listed);
        if (result.pageInfo?.hasNextPage === false) discovered.add(t.id);
        if (result.pageInfo?.hasNextPage && typeof result.pageInfo.endCursor === "string") again.push({ ...t, after: result.pageInfo.endCursor });
      });
    }
    pending = again;
  }
  const pairs = tasks.flatMap((m) => [...(games.get(m.id)?.keys() ?? [])].slice(0, 128).map((game) => ({ id: m.id, game, averageType: m.overperform?.averageType })));
  const collected = new Map();
  const completed = new Set();
  for (let offset = 0; offset < pairs.length && Date.now() < deadline; offset += 12) { // 24 pairs cost ~41,000 of the 30,000 complexity Sorare allows a query (20 Oct 2026)
    let batch = pairs.slice(offset, offset + 12);
    for (let page = 0; batch.length && page < 5 && Date.now() < deadline; page++) {
      const answer = await throughSorare("SofixMissionCards", { pairs: batch });
      if (answer.state !== "ok") break;
      const again = [];
      batch.forEach((p, i) => {
        const result = answer.data?.currentUser?.[`t${i}`]?.pickableCards;
        if (!Array.isArray(result?.nodes) || result.nodes.some((c) => typeof c.slug !== "string")) return;
        const key = `${p.id}:${p.game}`;
        const cards = [...(collected.get(key) ?? []), ...result.nodes];
        collected.set(key, cards);
        if (result.pageInfo?.hasNextPage && typeof result.pageInfo.endCursor === "string") {
          if (cards.length < 500) again.push({ ...p, after: result.pageInfo.endCursor });
        } else if (result.pageInfo?.hasNextPage === false) {
          completed.add(key);
          for (const o of Object.values(outcomes)) for (const m of o.missions) if (m.id === p.id) {
            (m.eligibleCards ??= {})[p.game] = [...new Set(cards.map((c) => c.slug))];
            m.inventory ??= [];
            const game = games.get(p.id)?.get(p.game);
            for (const c of cards) {
              const score = c.eligiblePlayerGameScores?.[0];
              const team = score?.anyPlayerGameStats?.anyTeam;
              const venue = team?.id === game?.homeTeam?.id ? "H" : team?.id === game?.awayTeam?.id ? "A" : null;
              if (!venue || !c.anyPlayer?.slug || m.inventory.length >= 1000) continue;
              const opponent = venue === "H" ? game.awayTeam : game.homeTeam;
              m.inventory.push({ card: c.slug, player: c.anyPlayer.slug, name: c.anyPlayer.displayName, pic: c.pictureUrl ?? "", pos: ({ Goalkeeper: "GK", Defender: "DEF", Midfielder: "MID", Forward: "FWD" })[c.anyPositions?.[0]] ?? "MID",
                game: { id: p.game, kickoff: game.date, competition: game.competition?.slug ?? "", team: team.name, teamCrest: team.pictureUrl ?? null, opponent: opponent.name, opponentCrest: opponent.pictureUrl ?? null, venue },
                ...(m.overperform && typeof score.averageScore === "number" ? { target: score.averageScore + m.overperform.by } : {}) });
            }
          }
        }
      });
      batch = again;
    }
  }
  for (const o of Object.values(outcomes)) for (const m of o.missions) {
    m.eligibilityComplete = discovered.has(m.id) && (games.get(m.id)?.size ?? 0) <= 128 && pairs.filter((p) => p.id === m.id).every((p) => completed.has(`${p.id}:${p.game}`));
    if (m.eligibilityComplete && !m.eligibleCards) m.eligibleCards = {};
  }
}

/**
 * The app's Load button: today's missions of every rarity, asked of Sorare through your signed-in tab (read only) and sent to the app.
 * It never opens a tab: with no sorare.com tab open it says so.
 */
async function loadMissions(history = false) {
  if (!(await sorareTabs()).length) return { ok: true, state: "no-tab" };
  {
    const requestedAt = new Date().toISOString();
    const answer = await throughSorare("SofixMissions", { archived: history });
    if (answer.state !== "ok") return { ok: true, state: answer.state === "rejected" ? "error" : answer.state };
    if (!answer.data?.currentUser) return { ok: true, state: "signed-out" };
    const user = answer.data.currentUser;
    if (typeof user.slug !== "string" || answer.errors?.length) return { ok: true, state: "incomplete" };
    const outcomes = {};
    const loaded = {};
    for (const rarity of MISSION_RARITIES) {
      const tasks = user[rarity]?.myTasks;
      if (!Array.isArray(tasks) || tasks.length > (history ? 2000 : 100)) return { ok: true, state: "incomplete" };
      const pickerTasks = tasks.filter((t) => t?.__typename === "DecisivePlayerPickerTask" && (!history || (Number.isFinite(Date.parse(t.startDate)) && Date.parse(t.startDate) >= Date.now() - 61 * 86400000 && Date.parse(t.startDate) <= Date.now())));
      if (pickerTasks.some((t) => !t.id || !t.title || !Array.isArray(t.taskAppearances) || t.taskAppearances.length > 10)) return { ok: true, state: "incomplete" };
      const mine = globalThis.__sofixCore.collectMissions(pickerTasks, 40000, history).filter((m) => !m.rarity || m.rarity === rarity);
      if (mine.some((m) => m.made !== m.appearances.length)) return { ok: true, state: "incomplete" };
      const expected = pickerTasks.filter((t) => (history || t.expired !== true) && (!t.rarity || t.rarity.toLowerCase() === rarity));
      if (mine.length !== new Set(expected.map((t) => t.id)).size) return { ok: true, state: "incomplete" };
      if (mine.length > (history ? 200 : 12)) return { ok: true, state: "incomplete" };
      outcomes[rarity] = { complete: true, missions: mine };
      loaded[rarity] = mine.length;
    }
    try {
      if (!history) {
        await missionEligibility(outcomes, requestedAt);
      }
      const response = await fetch(`${CONFIG.appUrl}/api/ext/missions`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${CONFIG.token}`, "x-vercel-protection-bypass": CONFIG.bypass },
        body: JSON.stringify({ version: 2, requestedAt, user: user.slug, outcomes, history }),
      });
      if (!response.ok) return { ok: true, state: "app-error" };
      return { ok: true, state: "ok", loaded };
    } catch { return { ok: true, state: "app-error" }; }
  }
}

// From content.js on sorare.com: the signed-in account (or null when signed out).
// The popup asks for a fresh look; the answer is whatever the open tab says.
chrome.runtime.onMessage.addListener((message, sender, reply) => {
  if (sender.id !== chrome.runtime.id) return;
  if (message?.type === "sorare-user") {
    chrome.storage.local.set({ sorareUser: message.user ?? null, sorareSeenAt: Date.now() }).then(() => checkIn());
    return;
  }
  if (message?.type === "refresh-session") {
    refreshSession().then((state) => reply({ ok: true, state }));
    return true;
  }
  // From overlay.js and content.js, and only from a sorare.com tab.
  if (!fromSorare(sender)) return;
  if (message?.type === "missions-seen" && typeof message.rarity === "string" && Array.isArray(message.missions)) {
    // The page's own answer can hold other rarities' missions (the free cards' one): keep the page's own, or those that do not say.
    const rarity = message.rarity.slice(0, 20);
    sendMissions(rarity, message.missions.filter((mission) => !mission?.rarity || mission.rarity === rarity).slice(0, 12));
    return;
  }
  if (message?.type === "chances-seen" && Array.isArray(message.rows)) {
    const rows = cleanChances(message.rows);
    const games = Array.isArray(message.games) ? message.games.filter((game) => typeof game === "string").slice(0, 100) : [];
    roundTabs.get(sender.tab.id)?.(rows, games);
    if (rows.length) {
      const sending = sendChances(rows);
      chanceSends.add(sending);
      sending.finally(() => chanceSends.delete(sending));
    }
    return;
  }
  if (message?.type === "overlay-numbers") {
    overlayNumbers(message.cards, message.players, fixtureOf(message.fixture)).then(reply);
    return true;
  }
  if (message?.type === "overlay-worth") {
    overlayWorth().then(reply);
    return true;
  }
  if (message?.type === "overlay-profile" && typeof message.slug === "string" && /^[a-z0-9][a-z0-9-]{0,80}$/.test(message.slug)) {
    overlayProfile(message.slug).then(reply);
    return true;
  }
  if (message?.type === "overlay-plan") {
    overlayPlan(fixtureOf(message.fixture), message.missions === true, message.fresh === true).then(reply);
    return true;
  }
  if (message?.type === "pro-rebuild") {
    proRebuild(message.week, message.plan).then(reply);
    return true;
  }
  // The dock's Apply, pressed on sorare.com itself: one step per press, run in the tab that asked, never chained here.
  if (message?.type === "dock-step" && DOCK_STEPS.has(message.step)) {
    const [operation, variables] = STEPS[message.step](message);
    throughSorare(operation, variables, sender.tab.id).then((answer) => reply({ ok: true, step: message.step, ...answer }));
    return true;
  }
  if (message?.type === "ff-live") {
    ffLive(message.matches).then(reply);
    return true;
  }
  if (message?.type === "overlay-stats") {
    const seen = Number(message.seen) || 0;
    const matched = Number(message.matched) || 0;
    chrome.storage.local.set({ overlayStats: { seen, matched, fixture: fixtureOf(message.fixture), at: Date.now() } });
    return;
  }
  if (message?.type === "open-app") {
    chrome.tabs.create({ url: CONFIG.appUrl + (APP_PATH.test(String(message.path)) ? message.path : "/") });
    return;
  }
});

// Where the overlay may send you in the app: home, Control, or the Play page of one gameweek. Nothing else.
const APP_PATH = /^(\/|\/control|\/play(\?gw=\d{1,4})?)$/;

function fromSorare(sender) {
  try {
    return Boolean(sender.tab) && new URL(sender.url).origin === "https://sorare.com";
  } catch {
    return false;
  }
}

// The numbers the overlay draws on sorare.com's cards (plans/overlay.md, O2). Which cards a page shows goes only to
// your own app, in batches, and the answers are kept for a few minutes in the browser's memory (storage.session:
// gone when Chrome closes), so scrolling a gallery never asks twice. An unknown slug is remembered as unknown too.
const OVERLAY_TTL_MS = 15 * 60 * 1000;
const OVERLAY_BATCH = 120; // the app's cap per call
const SLUG = /^[a-z0-9][a-z0-9_-]{0,119}$/;
const FIXTURE = /^football-[a-z0-9-]{1,80}-\d{4}$/; // the gameweek a page's address names (core.fixtureOf), or nothing
const fixtureOf = (value) => (typeof value === "string" && FIXTURE.test(value) ? value : null);
let overlayDown = { until: 0, state: "unreachable" }; // after a failure, do not ask again for a moment

const slugs = (value) => [...new Set(Array.isArray(value) ? value.filter((slug) => typeof slug === "string" && SLUG.test(slug)) : [])];

/** One call to the app's overlay endpoint. `{ body }` when it answered, `{ state }` ("auth" | "unreachable") when it did not. */
async function askApp(payload) {
  if (Date.now() < overlayDown.until) return { state: overlayDown.state };
  let response;
  try {
    response = await fetch(`${CONFIG.appUrl}/api/ext/overlay`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${CONFIG.token}`,
        "x-vercel-protection-bypass": CONFIG.bypass,
      },
      body: JSON.stringify(payload),
    });
  } catch {
    response = null;
  }
  const body = response?.ok ? await response.json().catch(() => null) : null;
  if (body?.ok) return { body };
  // 401: the app does not accept this extension's token. Anything else: the app is not answering. Either way, say
  // so once and leave it alone for 30 seconds (a 429 is honoured the same way).
  overlayDown = { until: Date.now() + 30_000, state: response?.status === 401 ? "auth" : "unreachable" };
  await chrome.storage.local.set(
    response?.status === 401 ? { lastError: "HTTP 401" } : { appReachable: false, lastError: response ? `HTTP ${response.status}` : "network error" },
  );
  return { state: overlayDown.state };
}

async function overlayNumbers(cards, players, fixture = null) {
  const wanted = [...slugs(cards).map((slug) => `c:${slug}`), ...slugs(players).map((slug) => `p:${slug}`)].slice(0, 400);
  if (!wanted.length) return { state: "ok", cards: {}, players: {} };
  // What is kept is kept per gameweek: the numbers of one week are never the answer for a page about another.
  const scope = `ov:${fixture || "now"}:`;
  const cached = await chrome.storage.session.get(wanted.map((key) => `${scope}${key}`));
  const now = Date.now();
  const answers = {};
  const missing = [];
  for (const key of wanted) {
    const hit = cached[`${scope}${key}`];
    if (hit && now - hit.at < OVERLAY_TTL_MS) answers[key] = hit.entry;
    else missing.push(key);
  }
  for (let i = 0; i < missing.length; i += OVERLAY_BATCH) {
    const batch = missing.slice(i, i + OVERLAY_BATCH);
    const asked = {
      cards: batch.filter((key) => key.startsWith("c:")).map((key) => key.slice(2)),
      players: batch.filter((key) => key.startsWith("p:")).map((key) => key.slice(2)),
    };
    const answer = await askApp(fixture ? { ...asked, fixture } : asked);
    if (!answer.body) return { state: answer.state };
    const fresh = {};
    for (const slug of asked.cards) fresh[`c:${slug}`] = answer.body.cards?.[slug] ?? null;
    for (const slug of asked.players) fresh[`p:${slug}`] = answer.body.players?.[slug] ?? null;
    Object.assign(answers, fresh);
    await chrome.storage.session.set(Object.fromEntries(Object.entries(fresh).map(([key, entry]) => [`${scope}${key}`, { at: Date.now(), entry }])));
  }
  const out = { state: "ok", cards: {}, players: {} };
  for (const [key, entry] of Object.entries(answers)) if (entry) out[key.startsWith("c:") ? "cards" : "players"][key.slice(2)] = entry;
  return out;
}

// Futbol Fantasy, read live (plans/futbolfantasy.md, S7). While a sorare.com page is open with the overlay on, the match pages
// of the games its cards are about are read here, so a change in a lineup shows on the tile within minutes instead of at the
// next run. Read-only and polite: only `/partidos/<number>` pages, each at most once every ten minutes however often it is asked
// for, one page at a time with a pause between, and left alone for five minutes after one fails. The page is read as it is
// written (core.ffPlayersOf); nothing is sent anywhere, and nothing of Futbol Fantasy's is kept after the browser closes.
const FF_MATCH = /^https:\/\/www\.futbolfantasy\.com\/partidos\/(\d{1,7})(?:-[a-z0-9-]{1,120})?$/;
const FF_TTL_MS = 10 * 60 * 1000;
const FF_BACKOFF_MS = 5 * 60 * 1000;
const FF_PAUSE_MS = 2000;
const FF_PAGES = 8; // per ask
const FF_MAX_CHARS = 6_000_000;
let ffQueue = Promise.resolve();

function ffLive(matches) {
  const wanted = [];
  for (const item of Array.isArray(matches) ? matches : []) {
    const found = item && typeof item.url === "string" ? FF_MATCH.exec(item.url) : null;
    if (found && String(item.id) === found[1] && !wanted.some((one) => one.id === found[1])) wanted.push({ id: found[1], url: item.url });
  }
  // One ask at a time, so two tabs asking together read a page once.
  const answer = ffQueue.then(() => ffRead(wanted.slice(0, FF_PAGES)));
  ffQueue = answer.catch(() => {});
  return answer.catch(() => ({ state: "unreachable" }));
}

async function ffRead(wanted) {
  const keys = wanted.map((one) => `ff:${one.id}`);
  const held = keys.length ? await chrome.storage.session.get(keys) : {};
  const live = {};
  let fetched = 0;
  for (const one of wanted) {
    const key = `ff:${one.id}`;
    const hit = held[key];
    if (hit && hit.players && Date.now() - hit.at < FF_TTL_MS) {
      live[one.id] = { at: new Date(hit.at).toISOString(), players: hit.players };
      continue;
    }
    if (hit && hit.failedAt && Date.now() - hit.failedAt < FF_BACKOFF_MS) {
      if (hit.players) live[one.id] = { at: new Date(hit.at).toISOString(), players: hit.players }; // the last reading stands
      continue;
    }
    if (fetched) await new Promise((done) => setTimeout(done, FF_PAUSE_MS));
    fetched += 1;
    let players = null;
    try {
      const response = await fetch(one.url, { credentials: "omit", referrerPolicy: "no-referrer", cache: "no-store" });
      const text = response.ok ? await response.text() : "";
      players = text && text.length <= FF_MAX_CHARS ? globalThis.__sofixCore.ffPlayersOf(text) : null;
    } catch {
      players = null;
    }
    if (players && Object.keys(players).length) {
      const at = Date.now();
      await chrome.storage.session.set({ [key]: { at, players } });
      live[one.id] = { at: new Date(at).toISOString(), players };
    } else {
      await chrome.storage.session.set({ [key]: { ...(hit || {}), failedAt: Date.now() } });
      if (hit && hit.players) live[one.id] = { at: new Date(hit.at).toISOString(), players: hit.players };
    }
  }
  return { state: "ok", live };
}

/**
 * The gameweek's plan (and with `missions`, today's missions), for the dock: the one the page's address names, or the one being planned when it names none. Asked for
 * only by the dock, and kept as long as the numbers, one answer per gameweek (a page about GW21 once showed GW20's).
 */
/** Your gallery's prices (plans/overlay-bridge.md, B2): one ask, kept for this browser session as long as the other numbers. */
async function overlayWorth() {
  const key = "ov:worth";
  const held = (await chrome.storage.session.get(key))[key];
  if (held && Date.now() - held.at < OVERLAY_TTL_MS) return { state: "ok", worth: held.worth };
  const answer = await askApp({ cards: [], players: [], worth: true });
  if (!answer.body?.worth) return { state: answer.state ?? "unreachable" };
  await chrome.storage.session.set({ [key]: { at: Date.now(), worth: answer.body.worth } });
  return { state: "ok", worth: answer.body.worth };
}

/** Sofix's line on one player's Sorare page (plans/overlay-bridge.md, B3): kept as long as the cards' numbers. */
async function overlayProfile(slug) {
  const key = `ov:profile:${slug}`;
  const held = (await chrome.storage.session.get(key))[key];
  if (held && Date.now() - held.at < OVERLAY_TTL_MS) return { state: "ok", profile: held.profile };
  const answer = await askApp({ cards: [], players: [], profile: slug });
  if (!answer.body) return { state: answer.state ?? "unreachable" };
  const profile = answer.body.profile ?? null;
  await chrome.storage.session.set({ [key]: { at: Date.now(), profile } });
  return { state: "ok", profile };
}

async function overlayPlan(fixture = null, missions = false, fresh = false) {
  const key = `ov:plan:${fixture || "now"}${missions ? ":m" : ""}`;
  const held = (await chrome.storage.session.get(key))[key];
  if (!fresh && held && Date.now() - held.at < (missions ? DOCK_TTL_MS : OVERLAY_TTL_MS)) return { state: "ok", plan: held.plan, missions: held.missions ?? null };
  const answer = await askApp({ cards: [], players: [], plan: true, ...(missions ? { missions: true } : {}), ...(fixture ? { fixture } : {}) });
  if (!answer.body?.plan) return { state: answer.state ?? "unreachable" };
  await chrome.storage.session.set({ [key]: { at: Date.now(), plan: answer.body.plan, missions: answer.body.missions ?? null } });
  return { state: "ok", plan: answer.body.plan, missions: answer.body.missions ?? null };
}

/** The dock's "Load from Sorare": starts the app's Pro rebuild on the announced elevens, as Play's button does. One press, one request. */
async function proRebuild(week, plan) {
  try {
    const response = await fetch(`${CONFIG.appUrl}/api/pro-rebuild`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${CONFIG.token}`, "x-vercel-protection-bypass": CONFIG.bypass },
      body: JSON.stringify({ week: String(week || "").slice(0, 120), plan: Number(plan) || 1 }),
    });
    const body = await response.json().catch(() => null);
    return body && typeof body.success === "boolean" ? body : { success: false, data: null, error: `Sofix answered HTTP ${response.status}.` };
  } catch {
    return { success: false, data: null, error: "Sofix is not reachable." };
  }
}

// The dock's numbers are asked once per page and again after two minutes at most: picks and entries change during the day.
const DOCK_TTL_MS = 2 * 60 * 1000;
// What the dock may run through your session: Apply's steps and the one read of your entered lineups' live scores, nothing else
// (the Pro read and the app's own copies of the gameweek stay the app's).
const DOCK_STEPS = new Set(["entered", "check", "draft", "enter", "week-entered"]);

// The fixed things the app may ask Sorare through your session, and the shape of each. The app names a step,
// never a query: nothing outside this table can be asked, and the two that write are separate steps so that
// saving a draft and entering a competition can never be one click (docs/sorare_plan.md, S6).
const STEPS = {
  entered: (input) => ["SofixMyLineups", { slug: input.slug }],
  "week-entered": (input) => ["SofixFixtureLineups", { slug: String(input.slug || "").slice(0, 120) }],
  "pro-entered": () => ["SofixProLineups", {}],
  arcade: () => ["SofixArcade", {}],
  "arcade-lineups": () => ["SofixArcadeLineups", {}],
  "arcade-missions": () => ["SofixArcadeMissions", {}],
  "arcade-collection": () => ["SofixArcadeCollection", {}],
  "arcade-cards": (input) => ["SofixArcadeCards", { after: typeof input.after === "string" ? input.after.slice(0, 500) : null }],
  "arcade-games": (input) => ["SofixArcadeGames", {
    after: typeof input.after === "string" ? input.after.slice(0, 500) : null,
    fromDate: String(input.fromDate ?? "").slice(0, 40),
    toDate: String(input.toDate ?? "").slice(0, 40),
  }],
  "arcade-bonuses": (input) => ["SofixArcadeBonuses", { cards: Array.isArray(input.cards) ? input.cards.slice(0, 50) : [] }],
  "arcade-past": (input) => ["SofixArcadePast", { players: Array.isArray(input.players) ? input.players.slice(0, 50) : [] }],
  "arcade-decisive": (input) => ["SofixArcadeDecisive", { players: Array.isArray(input.players) ? input.players.slice(0, 1) : [], before: input.before, after: input.after }],
  "arcade-projections": (input) => ["SofixArcadeProjections", { game: String(input.game ?? "").slice(0, 60) }],
  "arcade-elevens": (input) => ["SofixArcadeElevens", { game: String(input.game ?? "").slice(0, 60) }],
  "arcade-pack-odds": (input) => ["SofixArcadePackOdds", { slots: Array.isArray(input.slots) ? input.slots.slice(0, 2) : [] }],
  // Arcade's start % without opening a page: Sorare's own bench question, one position and date window a page (the bridge checks each value).
  "arcade-bench": (input) => ["SofixArcadeBench", {
    task: String(input.task ?? "").slice(0, 60), position: String(input.position ?? "").slice(0, 20),
    minDate: String(input.minDate ?? "").slice(0, 40), maxDate: String(input.maxDate ?? "").slice(0, 40),
    after: typeof input.after === "string" ? input.after.slice(0, 500) : null,
  }],
  check: (input) => ["SofixPreviewLineup", { slug: input.slug, appearances: appearances(input) }],
  draft: (input) => [
    "SofixSaveDraft",
    {
      input: {
        so5LeaderboardId: input.boardId,
        so5Appearances: appearances(input),
        draft: true, // saved, not entered
        ...(input.lineupId ? { so5LineupId: input.lineupId } : {}),
        ...(input.entryItemId ? { entryItemId: input.entryItemId } : {}),
        ...(input.name ? { name: String(input.name).slice(0, 60) } : {}),
      },
    },
  ],
  enter: (input) => ["SofixConfirmLineups", { input: { so5LineupIds: ids(input.lineupIds) } }],
};

/** The lineup as Sorare takes it: a card per slot, in order, one captain. Anything else is dropped. */
function appearances(input) {
  return (Array.isArray(input.appearances) ? input.appearances : []).slice(0, 12).map((slot, index) => ({
    cardSlug: String(slot.cardSlug),
    captain: Boolean(slot.captain),
    index: Number.isInteger(slot.index) ? slot.index : index,
    ...(slot.benchObjectId ? { composeTeamBenchObjectId: String(slot.benchObjectId) } : {}),
  }));
}

function ids(value) {
  return (Array.isArray(value) ? value : []).slice(0, 8).map(String);
}

function askTab(tabId, message, timeoutMs = 8000) {
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve(null), timeoutMs);
    chrome.tabs.sendMessage(tabId, message, (response) => {
      clearTimeout(timer);
      void chrome.runtime.lastError;
      resolve(response ?? null);
    });
  });
}

const revived = new Set();

/** Content scripts do not appear in a tab that was already open. Put them there, or reload the tab once so they do. */
async function ensureBridge(tabId) {
  const existing = await askTab(tabId, { type: "sofix-ping-9" }, 500);
  if (existing?.ok && existing.version === 9) return true;
  try {
    await chrome.scripting.executeScript({ target: { tabId }, files: ["core.js", "bridge.js"], world: "MAIN" });
    await chrome.scripting.executeScript({ target: { tabId }, files: ["core.js", "content.js", "overlay.js", "dock.js"] });
    await chrome.scripting.insertCSS({ target: { tabId }, files: ["overlay.css"] });
  } catch {
    // The loaded manifest may not have "scripting" yet. Reloading the tab lets its content scripts start.
    if (revived.has(tabId)) return false;
    revived.add(tabId);
    try {
      await chrome.tabs.reload(tabId);
    } catch {
      return false;
    }
    await new Promise((resolve) => {
      const timer = setTimeout(done, 8000);
      function done() {
        clearTimeout(timer);
        chrome.tabs.onUpdated.removeListener(onUpdated);
        resolve();
      }
      function onUpdated(id, info) {
        if (id === tabId && info.status === "complete") done();
      }
      chrome.tabs.onUpdated.addListener(onUpdated);
    });
    for (let i = 0; i < 8; i++) {
      const answer = await askTab(tabId, { type: "sofix-ping-9" }, 400);
      if (answer?.ok && answer.version === 9) return true;
      await new Promise((resolve) => setTimeout(resolve, 300));
    }
    return false;
  }
  const answer = await askTab(tabId, { type: "sofix-ping-9" }, 800);
  return Boolean(answer?.ok && answer.version === 9);
}

async function sorareTabs() {
  const tabs = await chrome.tabs.query({ url: "https://sorare.com/*" });
  return tabs
    .filter((tab) => tab.id != null && !tab.discarded)
    .sort((a, b) => Number(b.active) - Number(a.active));
}

/**
 * Who is signed in on an open sorare.com tab. `no-tab` when none is open; `unknown` when a tab is there but
 * did not answer. Neither of those clears an account we already learned.
 */
async function readOpenSession() {
  const tabs = await sorareTabs();
  if (!tabs.length) return { state: "no-tab" };
  for (const tab of tabs.slice(0, 2)) {
    if (!(await ensureBridge(tab.id))) continue;
    const answer = await askTab(tab.id, { type: "whoami" }, 2500);
    if (answer?.state === "signed-in" || answer?.state === "signed-out") return answer;
  }
  return { state: "unknown" };
}

// Asks the app to start a refresh when a lock is under three hours away (the app decides; roadmap 9.8). At most every 10 minutes.
async function nearLock() {
  const { lastNearLock = 0 } = await chrome.storage.local.get("lastNearLock");
  if (Date.now() - lastNearLock < 10 * 60_000) return;
  await chrome.storage.local.set({ lastNearLock: Date.now() });
  try {
    await fetch(`${CONFIG.appUrl}/api/ext/near-lock`, {
      method: "POST",
      headers: { Authorization: `Bearer ${CONFIG.token}`, "x-vercel-protection-bypass": CONFIG.bypass },
    });
  } catch {
    // offline: the next sorare.com visit asks again
  }
}

async function refreshSession() {
  try {
    const found = await readOpenSession();
    if (found.state !== "signed-in" && found.state !== "signed-out") return found.state;
    nearLock(); // a sorare.com tab is open
    const user = found.state === "signed-in" ? found.user || null : null;
    const { sorareUser = null } = await chrome.storage.local.get(["sorareUser"]);
    if (sorareUser !== user) {
      await chrome.storage.local.set({ sorareUser: user, sorareSeenAt: Date.now() });
      await checkIn();
    }
    return found.state;
  } catch {
    return "unknown";
  }
}

/** Your Sorare session only exists in a sorare.com tab: without one open, no step can run. */
async function throughSorare(operation, variables, tabId = null) {
  const [tab] = tabId ? [{ id: tabId }] : await sorareTabs();
  if (!tab) return { state: "no-tab" };
  if (!(await ensureBridge(tab.id))) return { state: "no-bridge" };
  const answer = await askTab(tab.id, { type: "sofix-ask-9", operation, variables }, 20000);
  return answer ?? { state: "error" };
}

/** Native odds may have been read in another open tab. Merge only recent readings for this exact game. */
async function lineupChances(game) {
  const tabs = await sorareTabs();
  if (!tabs.length) return { state: "no-tab" };
  const answers = await Promise.all(tabs.slice(0, 8).map(async (tab) => {
    if (!(await ensureBridge(tab.id))) return null;
    return askTab(tab.id, { type: "sofix-ask-9", operation: "SofixLineupChances", variables: { id: game } }, 2500);
  }));
  const players = new Map();
  const now = Date.now();
  for (const answer of answers) {
    const match = answer?.data?.anyGame;
    if (answer?.state !== "ok" || answer.native !== true || match?.id !== game || !Array.isArray(match.playerGameScores)) continue;
    for (const row of match.playerGameScores.slice(0, 500)) {
      const slug = row?.anyPlayer?.slug;
      const at = row?.observedAt;
      const odds = row?.anyPlayerGameStats?.footballPlayingStatusOdds;
      const n = odds?.starterOddsBasisPoints;
      if (typeof slug !== "string" || !/^[a-z0-9-]{1,160}$/.test(slug) || !Number.isFinite(at) || at > now || now - at >= 15 * 60000) continue;
      if (odds !== null && !(Number.isInteger(n) && n >= 0 && n <= 10000)) continue;
      if (!players.has(slug) || players.get(slug).observedAt < at) players.set(slug, row);
    }
  }
  return players.size ? { state: "ok", native: true, data: { anyGame: { id: game, playerGameScores: [...players.values()] } } }
    : { state: answers.some((answer) => answer?.state === "unseen" || answer?.native === true) ? "unseen" : "no-bridge" };
}

/** Production is APP_URL. Local dev is this machine, on whatever port Next bound. */
function fromApp(url) {
  let page;
  try {
    page = new URL(url);
  } catch {
    return false;
  }
  if (page.origin === CONFIG.appUrl || (CONFIG.allowedOrigins ?? []).includes(page.origin)) return true;
  return page.protocol === "http:" && (page.hostname === "localhost" || page.hostname === "127.0.0.1");
}

// From the Sofix app. Production is APP_URL; local dev is http://localhost or http://127.0.0.1
// on any port (see manifest externally_connectable). Anything else is dropped.
chrome.runtime.onMessageExternal.addListener((message, sender, reply) => {
  if (!sender.url || !fromApp(sender.url)) return;
  if (message?.type === "ping") {
    // Look at the open tab, but answer with whoever we already know so a slow page never hides the extension.
    refreshSession();
    chrome.storage.local
      .get(["sorareUser", "appReachable"])
      .then(({ sorareUser, appReachable }) =>
        reply({ ok: true, version: VERSION, sorareUser: sorareUser ?? null, appReachable: appReachable ?? null }),
      );
    return true; // reply asynchronously
  }
  if (message?.type === "load-missions" || message?.type === "load-mission-history") {
    loadMissions(message.type === "load-mission-history").then(reply).catch(() => reply({ ok: true, state: "error" }));
    return true;
  }
  if (message?.type === "lineup-chances" && typeof message.game === "string" && /^Game:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(message.game)) {
    lineupChances(message.game).then((answer) => reply({ ok: true, ...answer })).catch(() => reply({ ok: true, state: "error" }));
    return true;
  }
  if (message?.type === "read-round" && Array.isArray(message.games) && message.games.length && message.games.length <= 40
    && message.games.every((one) => typeof one?.id === "string" && GAME_ID.test(one.id) && typeof one.player === "string" && PLAYER_SLUG.test(one.player))) {
    readRound(message.games.map(({ id, player }) => ({ id, player }))).then((answer) => reply({ ok: true, ...answer })).catch(() => reply({ ok: true, state: "error" }));
    return true;
  }
  if (message?.type === "read-arcade" && typeof message.config === "string" && /^[a-z0-9-]{1,80}$/.test(message.config)
    && typeof message.step === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(message.step)) {
    readArcade(message.config, message.step, sender.tab?.id != null ? { id: sender.tab.id, windowId: sender.tab.windowId, index: sender.tab.index } : null).then((answer) => reply({ ok: true, ...answer })).catch(() => reply({ ok: true, state: "error" }));
    return true;
  }
  if (message?.type === "sorare" && Object.hasOwn(STEPS, message.step)) {
    const [operation, variables] = STEPS[message.step](message);
    throughSorare(operation, variables).then((answer) => reply({ ok: true, step: message.step, ...answer }));
    return true;
  }
});
