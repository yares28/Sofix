// Sofix popup: the link Sorare → extension → app at a glance, one switch and one button.
import { CONFIG } from "./config.js";

const $ = (id) => document.getElementById(id);

async function render() {
  const { sorareUser = null, appReachable = null } = await chrome.storage.local.get(["sorareUser", "appReachable"]);
  const { overlay = true } = await chrome.storage.sync.get(["overlay"]);
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
  $("go").textContent = signedIn ? "Open Sofix" : "Open sorare.com";
  $("go").onclick = () => chrome.tabs.create({ url: signedIn ? CONFIG.appUrl : "https://sorare.com/" });
}

$("overlay").addEventListener("click", async () => {
  const { overlay = true } = await chrome.storage.sync.get(["overlay"]);
  await chrome.storage.sync.set({ overlay: !overlay });
  render();
});

render();
