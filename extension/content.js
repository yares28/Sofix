// Sofix extension, sorare.com content script.
// The only way between the extension and your Sorare session: it passes a question to the page bridge
// (bridge.js) and passes the answer back. It starts by asking who is signed in; the rest it does on request,
// when you press a step of Apply in the app, or when the app pings and the background asks again.
(() => {
  if (globalThis.__sofixContent === 9) return;
  globalThis.__sofixContent = 9;

  let asked = 0;
  let tries = 0;
  let known = false;

  /** Put one question to the page bridge and wait for its answer. overlay.js, loaded after this, asks through it too. */
  function bridge(message, timeoutMs = 8000) {
    return new Promise((resolve) => {
      const id = `sofix-${Date.now()}-${asked++}`;
      const timer = setTimeout(() => {
        window.removeEventListener("message", onReply);
        resolve({ state: "timeout" });
      }, timeoutMs);
      const onReply = (event) => {
        if (event.source !== window || !event.data || event.data.source !== "sofix-bridge-9" || event.data.id !== id) return;
        clearTimeout(timer);
        window.removeEventListener("message", onReply);
        const { source, id: _id, type, ...answer } = event.data;
        resolve(answer);
      };
      window.addEventListener("message", onReply);
      window.postMessage({ source: "sofix-content-9", id, ...message }, location.origin);
    });
  }

  globalThis.__sofixAsk = bridge;

  function remember(answer) {
    if (answer.state === "signed-in") {
      known = true;
      chrome.runtime.sendMessage({ type: "sorare-user", user: answer.user });
    } else if (answer.state === "signed-out") {
      known = false;
      chrome.runtime.sendMessage({ type: "sorare-user", user: null });
    } else if (tries++ < 12) setTimeout(whoAmI, 4000);
    return answer;
  }

  function whoAmI() {
    return bridge({ type: "whoami" }).then(remember);
  }

  // A GraphQL call of the page's own just landed: ask again, in case the first look was too early.
  window.addEventListener("message", (event) => {
    if (event.source !== window || !event.data || event.data.source !== "sofix-bridge-9" || event.data.type !== "ready" || known) return;
    tries = 0;
    whoAmI();
  });

  // The page's own missions answer, seen by the bridge: pass the daily missions on, with the rarity of the page they are on. Read only.
  window.addEventListener("message", (event) => {
    if (event.source !== window || !event.data || event.data.source !== "sofix-bridge-9" || event.data.type !== "missions") return;
    // The rarity the question asked for; the page's address only when the question did not say.
    const rarity = event.data.rarity || globalThis.__sofixCore?.missionsRarity(location.pathname);
    if (!rarity || !Array.isArray(event.data.missions)) return;
    chrome.runtime.sendMessage({ type: "missions-seen", rarity, missions: event.data.missions.slice(0, 12) });
  });

  // Starting chances Sorare's own page just loaded: pass them on to be saved. Read only.
  window.addEventListener("message", (event) => {
    if (event.source !== window || !event.data || event.data.source !== "sofix-bridge-9" || event.data.type !== "chances") return;
    if (!Array.isArray(event.data.rows) || !Array.isArray(event.data.games)) return;
    chrome.runtime.sendMessage({ type: "chances-seen", rows: event.data.rows.slice(0, 500), games: event.data.games.slice(0, 100) });
  });

  // From the background worker: a liveness check, a fresh "who is signed in", or a step the app asked for.
  chrome.runtime.onMessage.addListener((message, sender, reply) => {
    if (sender.id !== chrome.runtime.id) return;
    if (message?.type === "sofix-ping-9") {
      reply({ ok: true, version: 9 });
      return;
    }
    if (message?.type === "whoami") {
      bridge({ type: "whoami" }).then((answer) => {
        remember(answer);
        reply(answer);
      });
      return true;
    }
    if (message?.type === "sofix-arcade-walk-9") {
      walkArcade(Boolean(message.waitVisible)).then(reply, () => reply({ state: "error" }));
      return true;
    }
    if (message?.type !== "sofix-ask-9") return;
    bridge({ type: "ask", operation: message.operation, variables: message.variables }, 20000).then(reply);
    return true;
  });

  /**
   * Arcade's compose page, for "Read Arcade's start %": open each position and scroll its bench until no more cards come, so
   * Sorare's page loads (and the bridge passes on) every card's start %. Only clicks Sorare's own "Select GK/DEF/MID/FWD"
   * buttons and scrolls; never picks a card or saves a lineup. A hidden tab may not load on scroll: it says so first.
   */
  async function walkArcade(waitVisible = false) {
    const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
    for (let i = 0; i < 20 && !document.querySelector('button[aria-label="Select GK"]'); i++) await sleep(500);
    if (!document.querySelector('button[aria-label="Select GK"]')) return { state: "no-page" };
    // Just brought forward: the page notices it is visible a moment later.
    for (let i = 0; waitVisible && i < 24 && document.visibilityState === "hidden"; i++) await sleep(250);
    if (document.visibilityState === "hidden") return { state: "hidden" };
    const shown = () => document.querySelectorAll("img[alt]").length;
    const scrollAll = () => {
      window.scrollTo(0, document.body.scrollHeight);
      for (const el of document.querySelectorAll("*")) {
        if (el.scrollHeight > el.clientHeight + 20 && /(auto|scroll)/.test(getComputedStyle(el).overflowY)) el.scrollTop = el.scrollHeight;
      }
    };
    const cards = {};
    const deadline = Date.now() + 180000;
    for (const position of ["GK", "DEF", "MID", "FWD"]) {
      document.querySelector(`button[aria-label="Select ${position}"]`)?.click();
      await sleep(3000);
      let still = 0;
      let last = shown();
      while (still < 2 && Date.now() < deadline) {
        scrollAll();
        await sleep(1500);
        const now = shown();
        still = now === last ? still + 1 : 0;
        last = now;
      }
      cards[position] = last;
    }
    return { state: Date.now() < deadline ? "ok" : "partial", cards };
  }

  setTimeout(whoAmI, 1000);
})();
