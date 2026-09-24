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
});
chrome.runtime.onStartup.addListener(() => checkIn());
chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === "checkin") checkIn();
});

// From content.js on sorare.com: the signed-in account (or null when signed out).
chrome.runtime.onMessage.addListener((message, sender) => {
  if (sender.id !== chrome.runtime.id || message?.type !== "sorare-user") return;
  chrome.storage.local.set({ sorareUser: message.user ?? null, sorareSeenAt: Date.now() }).then(() => checkIn());
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

/** Your Sorare session only exists in a sorare.com tab: without one open, no step can run. */
async function throughSorare(operation, variables) {
  const tabs = await chrome.tabs.query({ url: "https://sorare.com/*" });
  const tab = tabs.find((t) => !t.discarded) ?? tabs[0];
  if (!tab) return { state: "no-tab" };
  try {
    const answer = await chrome.tabs.sendMessage(tab.id, { type: "ask", operation, variables });
    return answer ?? { state: "error" };
  } catch {
    return { state: "no-bridge" }; // the tab is there but its content script isn't (a reload fixes it)
  }
}

// From the Sofix app (only its own origin can connect, see manifest externally_connectable).
chrome.runtime.onMessageExternal.addListener((message, sender, reply) => {
  if (!sender.url || new URL(sender.url).origin !== CONFIG.appUrl) return;
  if (message?.type === "ping") {
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
