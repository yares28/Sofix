// Sofix extension, background worker.
// - Tells the app it is alive and which Sorare account is signed in: only when that changes, otherwise every
//   6 hours (each check-in wakes the free Neon database, so it stays rare).
// - Answers the app's "ping" so the app knows the extension is installed (externally_connectable).
// It never sends Sorare credentials anywhere: only the version and the account's public nickname.
import { CONFIG } from "./config.js";

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
});

// The four things the app may ask Sorare through your session, and the shape of each. The app names a step,
// never a query: nothing outside this table can be asked, and the two that write are separate steps so that
// saving a draft and entering a competition can never be one click (docs/sorare_plan.md, S6).
const STEPS = {
  entered: (input) => ["SofixMyLineups", { slug: input.slug }],
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
  if ((await askTab(tabId, { type: "sofix-ping" }, 500))?.ok) return true;
  try {
    await chrome.scripting.executeScript({ target: { tabId }, files: ["bridge.js"], world: "MAIN" });
    await chrome.scripting.executeScript({ target: { tabId }, files: ["content.js"] });
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
      if ((await askTab(tabId, { type: "sofix-ping" }, 400))?.ok) return true;
      await new Promise((resolve) => setTimeout(resolve, 300));
    }
    return false;
  }
  return Boolean((await askTab(tabId, { type: "sofix-ping" }, 800))?.ok);
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
  if (message?.type === "sorare" && Object.hasOwn(STEPS, message.step)) {
    const [operation, variables] = STEPS[message.step](message);
    throughSorare(operation, variables).then((answer) => reply({ ok: true, step: message.step, ...answer }));
    return true;
  }
});
