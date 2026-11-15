// Sofix popup: the link Sorare → extension → app at a glance, one switch and one button.
import { CONFIG } from "./config.js";

const $ = (id) => document.getElementById(id);

const PARTS = globalThis.__sofixCore?.OVERLAY_PARTS ?? [];

/** One switch per overlay part (core.js OVERLAY_PARTS); greyed out while the master switch is off. */
function renderParts(overlay, overlayOff) {
  const off = new Set(overlayOff);
  $("partsn").textContent = `${PARTS.filter((p) => !off.has(p.key)).length} of ${PARTS.length} on`;
  $("partlist").replaceChildren(...PARTS.map((part) => {
    const row = document.createElement("div");
    row.className = "row";
    const what = document.createElement("span");
    what.className = "what";
    const name = document.createElement("span");
    name.textContent = part.label;
    const where = document.createElement("small");
    where.textContent = part.where;
    what.append(name, where);
    const sw = document.createElement("button");
    sw.className = "sw";
    sw.type = "button";
    sw.setAttribute("role", "switch");
    sw.setAttribute("aria-checked", String(!off.has(part.key)));
    sw.setAttribute("aria-label", part.label);
    sw.disabled = !overlay;
    sw.addEventListener("click", async () => {
      const { overlayOff: now = [] } = await chrome.storage.sync.get(["overlayOff"]);
      const next = now.includes(part.key) ? now.filter((k) => k !== part.key) : [...now, part.key];
      await chrome.storage.sync.set({ overlayOff: next });
      render();
    });
    const end = document.createElement("span");
    end.className = "end";
    end.append(sw);
    row.append(what, end);
    return row;
  }));
}

async function render() {
  const { sorareUser = null, appReachable = null, overlayStats = null, appBase = null } = await chrome.storage.local.get(["sorareUser", "appReachable", "overlayStats", "appBase"]);
  const { overlay = true, overlayOff = [] } = await chrome.storage.sync.get(["overlay", "overlayOff"]);
  renderParts(overlay, overlayOff);
  const signedIn = Boolean(sorareUser);
  const linked = signedIn && appReachable !== false;

  $("top").classList.toggle("warn", !linked);
  $("title").textContent = linked ? "Linked" : signedIn ? "App not reachable" : "Sign in to Sorare";
  $("lede").textContent = linked
    ? "Lineups can be saved from the app"
    : signedIn
      ? "Check your connection, then open the app"
      : "Open sorare.com and log in as usual";
  $("wire1").className = signedIn ? "" : "cut";
  $("wire2").className = appReachable === false ? "cut" : "";
  $("user").textContent = sorareUser ?? "—";
  $("app").textContent = appReachable === false ? "Not reachable" : appReachable ? "Online" : "Not checked yet";
  $("overlay").setAttribute("aria-checked", String(overlay));
  // What the last sorare.com page showed: a Sorare that changed its pictures reads "0 of 8", not silence.
  const fresh = overlayStats && Date.now() - overlayStats.at < 10 * 60 * 1000 && overlayStats.seen > 0;
  $("cards").textContent = !overlay ? "Switched off" : fresh ? `${overlayStats.matched} of ${overlayStats.seen}${overlayStats.slowest ? ` · slowest ${overlayStats.slowest} ms` : ""}` : "—";
  // Which gameweek the address of the last sorare.com page names ("25 29 sep 2026"): numbers for another week are not drawn.
  $("fixture").textContent = !overlay || !fresh ? "—" : overlayStats.fixture ? overlayStats.fixture.replace(/^football-/, "").replace(/-/g, " ") : "none named";
  $("go").textContent = signedIn ? "Open Sofix" : "Open sorare.com";
  // The address that last answered (this computer or Vercel), else the first configured one.
  const app = appBase ?? CONFIG.appUrls?.[0] ?? CONFIG.appUrl;
  // The dock's Arcade engine keeps its last ten errors with their times, so "it did nothing" can always be traced.
  const { arcadeErrors = [] } = await chrome.storage.local.get("arcadeErrors");
  $("errs").hidden = !arcadeErrors.length;
  $("errn").textContent = String(arcadeErrors.length);
  $("errlist").replaceChildren(...arcadeErrors.map((e) => {
    const li = document.createElement("li");
    li.textContent = `${new Date(e.at).toLocaleString("en-GB", { timeZone: "Europe/Madrid", weekday: "short", hour: "2-digit", minute: "2-digit" })} · ${e.text}`;
    return li;
  }));
  $("go").onclick = () => chrome.tabs.create({ url: signedIn ? app : "https://sorare.com/" });
}

$("overlay").addEventListener("click", async () => {
  const { overlay = true } = await chrome.storage.sync.get(["overlay"]);
  await chrome.storage.sync.set({ overlay: !overlay });
  render();
});

// The tab may already be open. Ask it before showing "sign in".
chrome.runtime.sendMessage({ type: "refresh-session" }, () => {
  void chrome.runtime.lastError;
  render();
});
render();
