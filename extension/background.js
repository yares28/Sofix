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

// The rarities the app ranks missions for. One with no mission today is sent empty, so the app says so instead of showing an older list.
const MISSION_RARITIES = ["limited", "rare", "super_rare", "unique"];

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
        const inventory = await fetch(`${CONFIG.appUrl}/api/ext/missions/pool`, { headers: { Authorization: `Bearer ${CONFIG.token}`, "x-vercel-protection-bypass": CONFIG.bypass } }).then((r) => r.ok ? r.json() : null).catch(() => null);
        const games = Array.isArray(inventory?.games) ? inventory.games.filter((g) => /^Game:[a-f0-9-]{36}$/.test(g)) : [];
        const tasks = [...new Map(Object.values(outcomes).flatMap((o) => o.missions).map((m) => [m.id, m])).values()];
        const pairs = tasks.flatMap((m) => games.map((game) => ({ id: m.id, game }))).slice(0, 24);
        if (pairs.length) {
          const eligibility = await throughSorare("SofixMissionCards", { pairs });
          if (eligibility.state === "ok") for (const o of Object.values(outcomes)) for (const m of o.missions) {
            const cards = {};
            pairs.forEach((p, i) => {
              const page = eligibility.data?.currentUser?.[`t${i}`]?.pickableCards;
              if (p.id === m.id && Array.isArray(page?.nodes) && page.pageInfo?.hasNextPage === false && page.nodes.every((c) => typeof c.slug === "string")) cards[p.game] = page.nodes.map((c) => c.slug);
            });
            if (Object.keys(cards).length) m.eligibleCards = cards;
          }
        }
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
  if (message?.type === "overlay-numbers") {
    overlayNumbers(message.cards, message.players, fixtureOf(message.fixture)).then(reply);
    return true;
  }
  if (message?.type === "overlay-plan") {
    overlayPlan(fixtureOf(message.fixture)).then(reply);
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
 * The gameweek's plan, for the drawer: the one the page's address names, or the one being planned when it names none. Asked for
 * only when the drawer is opened, and kept as long as the numbers, one answer per gameweek (a page about GW21 once showed GW20's).
 */
async function overlayPlan(fixture = null) {
  const key = `ov:plan:${fixture || "now"}`;
  const held = (await chrome.storage.session.get(key))[key];
  if (held && Date.now() - held.at < OVERLAY_TTL_MS) return { state: "ok", plan: held.plan };
  const answer = await askApp({ cards: [], players: [], plan: true, ...(fixture ? { fixture } : {}) });
  if (!answer.body?.plan) return { state: answer.state ?? "unreachable" };
  await chrome.storage.session.set({ [key]: { at: Date.now(), plan: answer.body.plan } });
  return { state: "ok", plan: answer.body.plan };
}

// The fixed things the app may ask Sorare through your session, and the shape of each. The app names a step,
// never a query: nothing outside this table can be asked, and the two that write are separate steps so that
// saving a draft and entering a competition can never be one click (docs/sorare_plan.md, S6).
const STEPS = {
  entered: (input) => ["SofixMyLineups", { slug: input.slug }],
  "week-entered": (input) => ["SofixFixtureLineups", { slug: String(input.slug || "").slice(0, 120) }],
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
  const existing = await askTab(tabId, { type: "sofix-ping-4" }, 500);
  if (existing?.ok && existing.version === 4) return true;
  try {
    await chrome.scripting.executeScript({ target: { tabId }, files: ["core.js", "bridge.js"], world: "MAIN" });
    await chrome.scripting.executeScript({ target: { tabId }, files: ["core.js", "content.js", "overlay.js", "drawer.js"] });
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
      const answer = await askTab(tabId, { type: "sofix-ping-4" }, 400);
      if (answer?.ok && answer.version === 4) return true;
      await new Promise((resolve) => setTimeout(resolve, 300));
    }
    return false;
  }
  const answer = await askTab(tabId, { type: "sofix-ping-4" }, 800);
  return Boolean(answer?.ok && answer.version === 4);
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

async function refreshSession() {
  try {
    const found = await readOpenSession();
    if (found.state !== "signed-in" && found.state !== "signed-out") return found.state;
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
async function throughSorare(operation, variables) {
  const [tab] = await sorareTabs();
  if (!tab) return { state: "no-tab" };
  if (!(await ensureBridge(tab.id))) return { state: "no-bridge" };
  const answer = await askTab(tab.id, { type: "ask", operation, variables }, 20000);
  return answer ?? { state: "error" };
}

/** Production is APP_URL. Local dev is this machine, on whatever port Next bound. */
function fromApp(url) {
  let page;
  try {
    page = new URL(url);
  } catch {
    return false;
  }
  if (page.origin === CONFIG.appUrl) return true;
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
  if (message?.type === "sorare" && Object.hasOwn(STEPS, message.step)) {
    const [operation, variables] = STEPS[message.step](message);
    throughSorare(operation, variables).then((answer) => reply({ ok: true, step: message.step, ...answer }));
    return true;
  }
});
