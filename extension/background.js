// Sofix extension, background worker.
// - Tells the app it is alive and which Sorare account is signed in: only when that changes, otherwise every
//   6 hours (each check-in wakes the free Neon database, so it stays rare).
// - Answers the app's "ping" so the app knows the extension is installed (externally_connectable).
// It never sends Sorare credentials anywhere: only the version and the account's public nickname.
import { CONFIG } from "./config.js";
import "./core.js"; // the page reader and the formula the overlay shares: sets globalThis.__sofixCore

const VERSION = chrome.runtime.getManifest().version;

/**
 * The Sofix app's addresses in the order to try them: this computer's launcher first, then each Vercel address (configure.mjs).
 * Vercel was blocked on 2 Nov 2026 and the app moved to localhost: every call now tries them in turn and remembers the one that
 * answered, so the extension follows the app wherever it runs. An app answer is JSON; Vercel's "deployment disabled" page is not.
 */
const APP_BASES = [...new Set([...(CONFIG.appUrls ?? []), CONFIG.appUrl, ...(CONFIG.allowedOrigins ?? [])])];
let appBaseNow = null;
async function appBase() {
  if (appBaseNow) return appBaseNow;
  const { appBase: saved = null } = await chrome.storage.local.get("appBase");
  appBaseNow = APP_BASES.includes(saved) ? saved : APP_BASES[0];
  return appBaseNow;
}
async function appFetch(path, init) {
  const first = await appBase();
  let fallback = null;
  let failure = null;
  for (const base of [first, ...APP_BASES.filter((b) => b !== first)]) {
    try {
      const response = await fetch(base + path, init);
      if ((response.headers.get("content-type") ?? "").includes("application/json")) {
        if (base !== appBaseNow) {
          appBaseNow = base;
          await chrome.storage.local.set({ appBase: base });
        }
        return response;
      }
      fallback ??= response;
    } catch (error) {
      failure ??= error;
    }
  }
  if (fallback) return fallback;
  throw failure ?? new Error("Sofix app not reachable");
}
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
    const response = await appFetch(`/api/ext/checkin`, {
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
  if (alarm.name === "self-update") selfUpdate();
});

// It updates itself (TODO.md A, roadmap 9.7): once a minute it reads the manifest in its own folder, which `configure.mjs` rewrites
// with each release, and reloads when the version there is newer than the one running. Nothing is downloaded: Chrome loads the
// new files from the same folder, as a Reload in chrome://extensions does. Open sorare.com tabs get the new scripts on install.
chrome.alarms.create("self-update", { periodInMinutes: 1 });
const VERSION_PARTS = /^\d+(\.\d+){0,3}$/;
const newerThan = (disk, running) => {
  if (!VERSION_PARTS.test(disk) || !VERSION_PARTS.test(running)) return false;
  const a = disk.split(".").map(Number);
  const b = running.split(".").map(Number);
  for (let i = 0; i < Math.max(a.length, b.length); i += 1) {
    if ((a[i] ?? 0) !== (b[i] ?? 0)) return (a[i] ?? 0) > (b[i] ?? 0);
  }
  return false;
};
async function selfUpdate() {
  try {
    const disk = await (await fetch(chrome.runtime.getURL("manifest.json"), { cache: "no-store" })).json();
    if (typeof disk?.version === "string" && newerThan(disk.version, VERSION)) chrome.runtime.reload();
  } catch {
    // the folder is being rewritten: look again next minute
  }
}

// The daily missions of one rarity, sent to the app only when they changed (the app ranks your cards for them). `force` sends them
// anyway, so the app learns they were read today even when they are yesterday's again. True when the app has them.
async function sendMissions(rarity, missions, force = false) {
  const clean = missions.map(({ rarity: _rarity, ...mission }) => mission);
  const { missionsSent = {} } = await chrome.storage.local.get("missionsSent");
  const text = JSON.stringify(clean);
  if (!force && missionsSent[rarity] === text) return true;
  try {
    const response = await appFetch(`/api/ext/missions`, {
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
    const response = await appFetch(`/api/ext/chances`, {
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
      const response = await appFetch(`/api/ext/missions`, {
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
    overlayNumbers(message.cards, message.players, fixtureOf(message.fixture), message.games, boardOf(message.board)).then(reply);
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
  if (message?.type === "need-data") {
    needData(sender.tab?.id ?? null, Date.now(), message.fresh === true).then(reply).catch(() => reply(null));
    return true;
  }
  // The dock's Load missions: Sorare's missions read through the open tab and saved, as the Missions page's button does (plans/dock-v2.md).
  if (message?.type === "dock-load-missions") {
    loadMissions(false).then(reply).catch(() => reply({ ok: true, state: "error" }));
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
    const slowest = Math.min(60000, Math.max(0, Math.round(Number(message.slowest) || 0)));
    chrome.storage.local.set({ overlayStats: { seen, matched, fixture: fixtureOf(message.fixture), slowest, at: Date.now() } });
    return;
  }
  if (message?.type === "open-app") {
    appBase().then((base) => chrome.tabs.create({ url: base + (APP_PATH.test(String(message.path)) ? message.path : "/") }));
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
// "Sofix has nothing on him" is asked again sooner (9 Nov 2026: a card asked mid-refresh stayed blank 15 minutes); still minutes apart.
const OVERLAY_EMPTY_TTL_MS = 3 * 60 * 1000;
const OVERLAY_BATCH = 120; // the app's cap per call
const SLUG = /^[a-z0-9][a-z0-9_-]{0,119}$/;
const FIXTURE = /^football-[a-z0-9-]{1,80}-\d{4}$/; // the gameweek a page's address names (core.fixtureOf), or nothing
const fixtureOf = (value) => (typeof value === "string" && FIXTURE.test(value) ? value : null);
const BOARD = /^[a-z0-9][a-z0-9_-]{0,160}$/; // a lineup builder's leaderboard (core.composeBoard)
const boardOf = (value) => (typeof value === "string" && BOARD.test(value) ? value : null);
let overlayDown = { until: 0, state: "unreachable" }; // after a failure, do not ask again for a moment

const slugs = (value) => [...new Set(Array.isArray(value) ? value.filter((slug) => typeof slug === "string" && SLUG.test(slug)) : [])];

/** One call to the app's overlay endpoint. `{ body }` when it answered, `{ state }` ("auth" | "unreachable") when it did not. */
async function askApp(payload) {
  if (Date.now() < overlayDown.until) return { state: overlayDown.state };
  let response;
  try {
    response = await appFetch(`/api/ext/overlay`, {
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
  // 401: the app does not accept this extension's token, and a 429 asks for a rest: left alone 30 seconds. Anything else (one 500,
  // a slow cold start) only 10, so one failure does not blank every sorare.com tab for half a minute (9 Nov 2026).
  const rest = response?.status === 401 || response?.status === 429 ? 30_000 : 10_000;
  overlayDown = { until: Date.now() + rest, state: response?.status === 401 ? "auth" : "unreachable" };
  await chrome.storage.local.set(
    response?.status === 401 ? { lastError: "HTTP 401" } : { appReachable: false, lastError: response ? `HTTP ${response.status}` : "network error" },
  );
  return { state: overlayDown.state };
}

async function overlayNumbers(cards, players, fixture = null, games = {}, board = null) {
  const wanted = [...slugs(cards).map((slug) => `c:${slug}`), ...slugs(players).map((slug) => `p:${slug}`)].slice(0, 400);
  if (!wanted.length) return { state: "ok", cards: {}, players: {} };
  // A card a page puts in a game (a lineup's) is answered for that game: kept per game, never another game's numbers.
  const gameOf = Object.fromEntries(
    Object.entries(games && typeof games === "object" ? games : {}).filter(([key, id]) => wanted.includes(key) && typeof id === "string" && GAME_ID.test(id)),
  );
  // What is kept is kept per gameweek, builder and game: the numbers of one are never the answer for a page about another.
  const keyOf = (key) => `ov:${fixture || "now"}:${board || "-"}:${gameOf[key] || "-"}:${key}`;
  const cached = await chrome.storage.session.get(wanted.map(keyOf));
  const now = Date.now();
  const answers = {};
  const missing = [];
  // A builder's board (the team gauge's bonuses and reward levels, plans/overlay-v2.md step 5): kept once per gameweek and builder.
  const teamKey = `ov:team:${fixture || "now"}:${board || "-"}`;
  let team = null;
  for (const key of wanted) {
    const hit = cached[keyOf(key)];
    if (hit && now - hit.at < (hit.entry ? OVERLAY_TTL_MS : OVERLAY_EMPTY_TTL_MS)) answers[key] = hit.entry;
    else missing.push(key);
  }
  for (let i = 0; i < missing.length; i += OVERLAY_BATCH) {
    const batch = missing.slice(i, i + OVERLAY_BATCH);
    const asked = {
      cards: batch.filter((key) => key.startsWith("c:")).map((key) => key.slice(2)),
      players: batch.filter((key) => key.startsWith("p:")).map((key) => key.slice(2)),
    };
    const hints = Object.fromEntries(batch.filter((key) => gameOf[key]).map((key) => [key, gameOf[key]]));
    const answer = await askApp({ ...asked, ...(fixture ? { fixture } : {}), ...(board ? { board } : {}), ...(Object.keys(hints).length ? { games: hints } : {}) });
    if (!answer.body) return { state: answer.state };
    if (board && answer.body.team) team = answer.body.team;
    const fresh = {};
    for (const slug of asked.cards) fresh[`c:${slug}`] = answer.body.cards?.[slug] ?? null;
    for (const slug of asked.players) fresh[`p:${slug}`] = answer.body.players?.[slug] ?? null;
    Object.assign(answers, fresh);
    await chrome.storage.session.set(Object.fromEntries(Object.entries(fresh).map(([key, entry]) => [keyOf(key), { at: Date.now(), entry }])));
  }
  if (board && team) await chrome.storage.session.set({ [teamKey]: { at: Date.now(), team } });
  else if (board) {
    const kept = (await chrome.storage.session.get(teamKey))[teamKey];
    if (kept && now - kept.at < OVERLAY_TTL_MS) team = kept.team;
  }
  const out = { state: "ok", cards: {}, players: {}, ...(team ? { team } : {}) };
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

// -- points needed on sorare.com (plans/points-needed.md) ---------------------------------------------------------------
// A compact copy of what the pill needs, kept from the reads the app already makes through here (its Arcade page reads the board
// and your lineups) and from the overlay's own refresh of your lineups: steps and targets, and your open Arcade and Pro lineups with
// Sorare's score and multiplier per card. Nothing in it is a credential.
const NEED_KEY = "needData";
const NEED_FRESH_MS = 2 * 60 * 1000; // lineups are read again at most this often while a game of yours is live
const NEED_IDLE_MS = 10 * 60 * 1000; // and this often otherwise
const NEED_ENTRY_MS = 15 * 1000; // opening a lineup page reads them afresh, unless they were read this recently
const NEED_GAME_MS = 2.5 * 60 * 60 * 1000; // a game this long after its kick-off may still be scoring
const num = (value) => (typeof value === "number" && Number.isFinite(value) ? value : null);
/**
 * Whether a card's score can no longer move: Sorare has settled it, his game is over, or he has been taken off (or is not on the sheet
 * of a game under way). His points are then locked and the rest of the target falls on the cards still to play or playing.
 */
const doneScoring = (a) => {
  const field = a?.playerGameScore?.anyPlayerGameStats?.fieldStatus;
  const game = a?.game?.statusTyped;
  // Not REVIEWING or DID_NOT_PLAY: Sorare gives every card REVIEWING while its game is under way (seen 4 Nov 2026), bench players too.
  return a?.scoreStatus === "FINAL" || ["played", "cancelled", "postponed"].includes(game)
    || field === "SUBSTITUTED" || (game === "playing" && field === "NOT_ON_GAME_SHEET");
};
const appearancesOf = (lineup) => (Array.isArray(lineup?.taskAppearances) ? lineup.taskAppearances : []).flatMap((a) => (a?.anyCard?.slug
  ? [{ slug: String(a.anyCard.slug), score: num(a.score), bonus: num(a.bonus), captain: a.captain === true, kickoff: typeof a.game?.date === "string" ? a.game.date : null,
    game: typeof a.game?.id === "string" && GAME_ID.test(a.game.id) ? a.game.id : null, ...(doneScoring(a) ? { done: true } : {}) }] : []));
const openLineup = (l) => l && l.__typename === "TaskLineup" && !l.draft && !l.cancelledAt && !["SUCCESSFUL", "FAILED"].includes(l.aasmState);

/** What one read through here adds to the copy. */
function needFrom(step, data, input = {}, now = Date.now()) {
  const user = data?.currentUser;
  if (step === "arcade" && user?.setBoard) {
    const board = user.setBoard;
    const steps = Object.fromEntries((Array.isArray(board.steps) ? board.steps : []).map((st) => [String(st.id), {
      level: num(st.level), target: num(st.target), state: String(st.state ?? ""), captain: num(st.engineConfiguration?.captain), collection: st.engineConfiguration?.collection ?? null,
    }]));
    return { arcade: { config: board.configSlug ?? null, current: board.myCurrentStep?.id ?? null, steps }, arcadeAt: now };
  }
  if (step === "arcade-lineups" && user?.setBoard) {
    const lineups = (Array.isArray(user.setBoard.steps) ? user.setBoard.steps : []).flatMap((st) => (Array.isArray(st.myLineups) ? st.myLineups : [])
      .filter(openLineup).map((l) => ({ id: String(l.id), kind: "arcade", step: String(st.id), cards: appearancesOf(l) })));
    return { arcadeLineups: lineups, arcadeLineupsAt: now };
  }
  if (step === "pro-entered" && Array.isArray(user?.boards)) {
    const lineups = user.boards.flatMap((board) => (Array.isArray(board?.steps) ? board.steps : []).filter((st) => st?.__typename === "CareerProStep")
      .flatMap((st) => (Array.isArray(st.myLineups) ? st.myLineups : []).filter(openLineup)
        .map((l) => ({ id: String(l.id), kind: "pro", target: num(st.target), board: board.title ?? "Pro", cards: appearancesOf(l) }))));
    return { proLineups: lineups, proLineupsAt: now };
  }
  return null;
}

// One save at a time: the app's reads and the overlay's land together, and two read-then-write saves would undo each other.
let needSaving = Promise.resolve();
function keepNeed(step, answer, input = {}) {
  if (answer?.state !== "ok") return needSaving;
  const add = needFrom(step, answer.data, input);
  if (!add) return needSaving;
  needSaving = needSaving.then(async () => {
    const { [NEED_KEY]: kept = {} } = await chrome.storage.local.get(NEED_KEY);
    await chrome.storage.local.set({ [NEED_KEY]: { ...kept, ...add } });
  }).catch(() => {});
  return needSaving;
}

/** The overlay's question: the copy, after reading your lineups again when you open a lineup page, when it is old, or when nothing was read yet. */
async function needData(tabId, now = Date.now(), entered = false) {
  const { [NEED_KEY]: kept = {} } = await chrome.storage.local.get(NEED_KEY);
  const all = [...(kept.arcadeLineups ?? []), ...(kept.proLineups ?? [])];
  const live = all.some((l) => l.cards.some((c) => c.kickoff && Date.parse(c.kickoff) <= now && now - Date.parse(c.kickoff) < NEED_GAME_MS));
  // Afresh when you open a lineup page (not twice in 15 seconds), then every 2 minutes while a game is live, else every 10.
  const stale = (at) => !at || now - at > (entered ? NEED_ENTRY_MS : live ? NEED_FRESH_MS : NEED_IDLE_MS);
  const asks = [];
  if (!kept.arcadeAt || now - kept.arcadeAt > 6 * 60 * 60 * 1000) asks.push("arcade");
  if (stale(kept.arcadeLineupsAt)) asks.push("arcade-lineups");
  if (stale(kept.proLineupsAt)) asks.push("pro-entered");
  for (const step of asks) {
    const [operation, variables] = STEPS[step]({});
    await keepNeed(step, await throughSorare(operation, variables, tabId));
  }
  if (!asks.length) return kept;
  const { [NEED_KEY]: fresh = {} } = await chrome.storage.local.get(NEED_KEY);
  return fresh;
}

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
    await appFetch(`/api/ext/near-lock`, {
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
    throughSorare(operation, variables).then((answer) => {
      reply({ ok: true, step: message.step, ...answer });
      keepNeed(message.step, answer, message).catch(() => {}); // the pill on sorare.com keeps what the app read
    });
    return true;
  }
});

// -- The dock's Arcade tab (plans/dock-v2.md) ---------------------------------------------------------------------------------------
// The Arcade page's own code runs in a hidden extension page (arcade.html, bundled by configure.mjs) with a worker, so a long climb
// never freezes sorare.com and Chrome's 30-second rule for this background script never cuts it. That page reads Sorare through the
// handlers below, as the Arcade page does through onMessageExternal; it reports each stage here, and the dock reads the result from
// storage (`arcadeDock`), so it draws the last plan at once and follows a run as it goes. A failed run never replaces the last plan.

const ENGINE_PAGE = "arcade.html";
const ARCADE_APP_MS = 10 * 60_000; // Sofix's numbers for the dock: asked at most this often (Vercel CPU rule in AGENTS.md)
const WATCH_BEFORE_MS = 75 * 60_000; // lib/arcadeDock.ts: from this long before a kick-off, the elevens are read again
const WATCH_EVERY_MS = 5 * 60_000;
const ENGINE_MISSING = "The calculation engine is missing: run node extension/scripts/configure.mjs, then Sofix reloads itself.";

const fromEngine = (sender) => sender.id === chrome.runtime.id && sender.url === chrome.runtime.getURL(ENGINE_PAGE);

/** What the dock shows: the last good plan, the current run, and when a run last started. */
async function arcadeState() {
  const { arcadeDock = null } = await chrome.storage.local.get("arcadeDock");
  return arcadeDock && typeof arcadeDock === "object" ? arcadeDock : { model: null, run: null, lastRun: 0 };
}

/** The last ten errors with their times, which the popup lists. */
async function arcadeError(text) {
  const { arcadeErrors = [] } = await chrome.storage.local.get("arcadeErrors");
  await chrome.storage.local.set({ arcadeErrors: [{ text: String(text).slice(0, 300), at: Date.now() }, ...arcadeErrors].slice(0, 10) });
}

async function engineReady() {
  if (!chrome.offscreen) throw new Error("This Chrome cannot run the calculation in the background.");
  if (await chrome.offscreen.hasDocument?.()) return;
  try {
    await chrome.offscreen.createDocument({ url: ENGINE_PAGE, reasons: ["WORKERS"], justification: "Works out the Arcade climb for the dock without freezing sorare.com." });
  } catch (error) {
    if (!/single offscreen/i.test(String(error?.message))) throw error; // another call made it meanwhile
  }
}

/** Starts a run unless one is still going (one past its deadline counts as stopped and may be replaced). */
async function arcadeRun(force = false) {
  const state = await arcadeState();
  const now = Date.now();
  if (state.run?.state === "working" && now <= (state.run.deadline ?? 0) + 15_000) return { ok: true, state: "working" };
  const run = { state: "working", stage: "board", startedAt: now, deadline: now + 60_000, error: null, notes: [] };
  await chrome.storage.local.set({ arcadeDock: { ...state, run, lastRun: now } });
  const failed = async (text) => {
    await chrome.storage.local.set({ arcadeDock: { ...state, lastRun: now, run: { ...run, state: "failed", error: { stage: "board", text, at: Date.now() } } } });
    await arcadeError(text);
    return { ok: true, state: "failed" };
  };
  try {
    await engineReady();
  } catch (error) {
    return failed(error?.message || ENGINE_MISSING);
  }
  // The page needs a moment to load its script; an answer means it is listening. No answer: its files are missing.
  for (let i = 0; i < 6; i++) {
    const answered = await new Promise((resolve) => {
      chrome.runtime.sendMessage({ target: "arcade-engine", type: "run", prev: state.model ?? null, force }, (reply) => {
        void chrome.runtime.lastError;
        resolve(reply?.ok === true);
      });
    });
    if (answered) return { ok: true, state: "working" };
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  return failed(ENGINE_MISSING);
}

/** Sofix's numbers and saved start % for the dock's engine, kept ARCADE_APP_MS for the same cards and games. */
async function arcadeApp(games, players) {
  const key = `${games.length}:${players.length}:${games.slice(0, 5).join(",")}:${players.slice(0, 5).join(",")}`;
  const { arcadeApp: kept = null } = await chrome.storage.session.get("arcadeApp");
  if (kept && kept.key === key && Date.now() - kept.at < ARCADE_APP_MS) return kept.body;
  try {
    const response = await appFetch(`/api/ext/arcade`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${CONFIG.token}`, "x-vercel-protection-bypass": CONFIG.bypass },
      body: JSON.stringify({ games, players }),
    });
    const body = response.ok ? await response.json().catch(() => null) : null;
    if (!body?.ok) return null;
    await chrome.storage.session.set({ arcadeApp: { key, at: Date.now(), body } });
    return body;
  } catch {
    return null;
  }
}

chrome.runtime.onMessage.addListener((message, sender, reply) => {
  if (sender.id !== chrome.runtime.id) return;
  if (fromEngine(sender)) {
    if (message?.type === "ping") {
      chrome.storage.local.get(["sorareUser", "appReachable"]).then(({ sorareUser, appReachable }) =>
        reply({ ok: true, version: VERSION, sorareUser: sorareUser ?? null, appReachable: appReachable ?? null }));
      return true;
    }
    if (message?.type === "sorare" && Object.hasOwn(STEPS, message.step)) {
      const [operation, variables] = STEPS[message.step](message);
      throughSorare(operation, variables).then((answer) => reply({ ok: true, step: message.step, ...answer }), () => reply({ ok: true, state: "error" }));
      return true;
    }
    if (message?.type === "arcade-app") {
      const games = Array.isArray(message.games) ? message.games.filter((g) => typeof g === "string" && GAME_ID.test(g)).slice(0, 300) : [];
      arcadeApp(games, slugs(message.players).slice(0, 3000)).then(reply);
      return true;
    }
    if (message?.type === "arcade-aim-get") {
      chrome.storage.local.get("arcadeAim").then(({ arcadeAim }) => reply(arcadeAim && Date.now() - arcadeAim.at < 7 * 86_400_000 ? arcadeAim.step : null));
      return true;
    }
    if (message?.type === "arcade-state" && message.run && typeof message.run === "object") {
      arcadeState().then(async (state) => {
        await chrome.storage.local.set({ arcadeDock: { ...state, run: message.run, ...(message.model ? { model: message.model } : {}) } });
        if (message.run.state === "failed" && message.run.error?.text) await arcadeError(message.run.error.text);
      });
    }
    return;
  }
  // From the dock on a sorare.com tab: work the plan out (again).
  if (message?.type === "arcade-run" && fromSorare(sender)) {
    arcadeRun(message.force === true).then(reply);
    return true;
  }
});

// The Arcade page says which step you aim at (Pick teams), so the dock's "best to clear" list aims at the same one.
chrome.runtime.onMessageExternal.addListener((message, sender) => {
  if (!sender.url || !fromApp(sender.url)) return;
  if (message?.type === "arcade-aim" && Number.isInteger(message.step) && message.step >= 1 && message.step <= 50) {
    chrome.storage.local.set({ arcadeAim: { step: message.step, at: Date.now() } });
  }
});

// The watch: near a kick-off of the plan or of an entered lineup, while a sorare.com tab is open, read again every five minutes so
// announced elevens reach the plan (and a benched card in an entered lineup the tag) without opening the dock.
chrome.alarms.create("arcade-watch", { periodInMinutes: 5 });
chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name !== "arcade-watch") return;
  const state = await arcadeState();
  const now = Date.now();
  const near = (state.model?.kickoffs ?? []).some((t) => t > now && t - now <= WATCH_BEFORE_MS);
  if (!near || now - (state.lastRun ?? 0) < WATCH_EVERY_MS - 30_000) return;
  if (!(await sorareTabs()).length) return;
  arcadeRun(false);
});
