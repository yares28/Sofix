// Sofix extension, the drawer on sorare.com (plans/overlay.md, O4; design: docs/sorare/design/S7-overlay.html).
// An edge tab that opens your gameweek's plan: what it adds up to, the cards it puts first, what it uses. It reads
// and shows. The one button in it opens Apply in the Sofix app; entering a lineup is never done from here.
//
// It lives in a shadow root, so Sorare's styles cannot reach it and its own cannot leak out, and it is switched by
// the same popup switch as the ribbons ("Scores on sorare.com").
(() => {
  if (globalThis.__sofixDrawer === 1) return;
  const core = globalThis.__sofixCore;
  if (!core) return;
  globalThis.__sofixDrawer = 1;

  const STALE_MS = 60 * 1000; // opened again within a minute: what was drawn is still right
  const STYLE = `
    :host { all: initial; }
    * { box-sizing: border-box; }
    button { font: inherit; color: inherit; cursor: pointer; }
    .tab, .drawer {
      --panel: #161618; --panel-2: #1d1d20; --line: #2a2a2e;
      --text: #ffffff; --text-2: #a6a6ae;
      --sofix: #5cc58d; --sofix-deep: #1f7a4f; --sofix-ink: #05130c;
      --ease: cubic-bezier(.3, .7, .2, 1);
      font: 14px/1.45 -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", sans-serif;
      -webkit-font-smoothing: antialiased;
      color: var(--text);
    }
    .mark { display: block; width: 15px; height: 15px; border-radius: 5px; background: linear-gradient(135deg, var(--sofix-deep), var(--sofix)); flex: none; }
    .tab {
      position: fixed; right: 0; top: 40%; z-index: 2147483000; display: flex; align-items: center; gap: 8px;
      border: 0; border-radius: 12px 0 0 12px; padding: 12px 14px; background: var(--panel);
      box-shadow: inset 0 0 0 1px rgba(92, 197, 141, .3), -6px 0 20px rgba(0, 0, 0, .5);
      font-size: 12px; font-weight: 650; writing-mode: vertical-rl;
    }
    .tab .mark { width: 12px; height: 12px; border-radius: 4px; }
    .tab:focus-visible, .drawer button:focus-visible { outline: 2px solid var(--sofix); outline-offset: 2px; }
    .drawer {
      position: fixed; right: 0; top: 0; bottom: 0; width: 340px; max-width: 100vw; z-index: 2147483001;
      display: flex; flex-direction: column; gap: 14px; padding: 18px; background: var(--panel);
      box-shadow: -10px 0 40px rgba(0, 0, 0, .6);
      transform: translateX(100%); visibility: hidden; transition: transform .35s var(--ease), visibility 0s linear .35s;
      overflow-y: auto;
    }
    .drawer.open { transform: none; visibility: visible; transition: transform .35s var(--ease); }
    .head { display: flex; align-items: center; gap: 9px; font-size: 12px; letter-spacing: .06em; text-transform: uppercase; color: var(--text-2); }
    .x { margin-left: auto; width: 28px; height: 28px; border: 0; border-radius: 50%; background: var(--panel-2); color: var(--text-2); }
    .num { margin: 0; display: flex; align-items: baseline; gap: 9px; }
    .num b { font-size: 46px; line-height: .9; font-weight: 700; letter-spacing: -.04em; font-variant-numeric: tabular-nums; }
    .num i { font-style: normal; font-size: 13px; color: var(--text-2); font-weight: 600; }
    .cards { display: grid; grid-template-columns: repeat(5, 1fr); gap: 5px; margin: 0; padding: 0; list-style: none; }
    .cards li { aspect-ratio: 320 / 452; border-radius: 5px; overflow: hidden; background: #000; }
    .cards img { width: 100%; height: 100%; object-fit: cover; display: block; }
    .cards li.more { display: grid; place-items: center; background: var(--panel-2); box-shadow: inset 0 0 0 1px var(--line); color: var(--text-2); font-size: 13px; font-weight: 650; font-variant-numeric: tabular-nums; }
    .line { display: flex; justify-content: space-between; margin: 0; padding: 10px 0; border-top: 1px solid var(--line); font-size: 12px; color: var(--text-2); }
    .line b { color: var(--text); font-weight: 650; font-variant-numeric: tabular-nums; }
    .say { margin: 0; font-size: 15px; font-weight: 600; }
    .go { margin-top: auto; border: 0; border-radius: 12px; padding: 13px; background: linear-gradient(135deg, var(--sofix-deep), var(--sofix)); color: var(--sofix-ink); font-weight: 700; font-size: 13px; }
    .note { margin: 0; font-size: 11px; color: var(--text-2); text-align: center; }
    .in { animation: rise .4s var(--ease) both; }
    @keyframes rise { from { opacity: 0; transform: translateY(6px); } }
    @media (max-width: 900px) { .tab { display: none; } }
    @media (prefers-reduced-motion: reduce) { .drawer, .drawer.open { transition: none; } .in { animation: none; } }
  `;

  let host = null;
  let tab = null;
  let panel = null;
  let title = null;
  let body = null;
  let close = null;
  let open = false;
  let loadedAt = 0;
  let loadedFor = ""; // the gameweek of the address that plan was asked for
  let loading = false;

  function el(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  }

  function send(message, reply) {
    try {
      chrome.runtime.sendMessage(message, (answer) => {
        void chrome.runtime.lastError;
        if (reply) reply(answer);
      });
    } catch {
      teardown(); // the extension was reloaded under this tab
    }
  }

  const goTo = (path) => send({ type: "open-app", path });

  /** Puts what the drawer has to say into it, replacing what was there. */
  function show(heading, nodes) {
    title.textContent = heading;
    body.replaceChildren(...nodes);
    for (const node of nodes) node.classList.add("in");
  }

  function link(label, path) {
    const button = el("button", "go", label);
    button.type = "button";
    button.addEventListener("click", () => goTo(path));
    return button;
  }

  function render(answer) {
    if (!answer || answer.state !== "ok" || !answer.plan) {
      const why = answer && answer.state === "auth" ? "Sofix does not recognise this extension." : "Sofix is not reachable right now.";
      show("Your gameweek", [el("p", "say", why), link("Open Sofix", "/")]);
      return;
    }
    const plan = answer.plan;
    const heading = plan.week ? `Your gameweek ${plan.week}` : "Your gameweek"; // 0: a week Sofix holds nothing on, which has no number here
    const path = plan.week ? `/play?gw=${plan.week}` : "/play";
    if (plan.state !== "ready") {
      show(heading, [el("p", "say", plan.note), link("Open Sofix", path)]);
      return;
    }
    const hero = el("p", "num");
    hero.append(el("b", "", String(plan.x)), el("i", "", plan.lineups === 1 ? `xScore · ${plan.comp}` : `xScore · ${plan.lineups} lineups`));
    const pics = el("ul", "cards");
    pics.setAttribute("aria-label", `Cards of your best plan, ${plan.comp} leading`);
    const drawn = core.drawerCards(plan);
    for (const url of drawn.pics) {
      const item = el("li");
      const image = document.createElement("img");
      image.alt = "";
      image.referrerPolicy = "no-referrer";
      image.src = url;
      item.append(image);
      pics.append(item);
    }
    if (drawn.more > 0) {
      const rest = el("li", "more", `+${drawn.more}`);
      rest.setAttribute("aria-label", `${drawn.more} more cards in the plan`);
      pics.append(rest);
    }
    const line = (label, value) => {
      const row = el("p", "line", label);
      row.append(el("b", "", value));
      return row;
    };
    show(heading, [
      hero,
      pics,
      line("Reward chance", core.chanceLabel(plan.pAny)),
      line("Essence expected", `≈${plan.essence}`),
      line("Cards used", `${plan.cardsUsed} of ${plan.cardsAvailable}`),
      link("Open Apply in Sofix", path),
      el("p", "note", "Entering still takes three presses in the app."),
    ]);
  }

  /** The gameweek the page's address names ("" when it names none): the plan shown is that week's, as the tiles are. */
  const weekHere = () => core.fixtureOf(location.href) || "";

  function fetchPlan() {
    const week = weekHere();
    if (loading || (loadedAt && loadedFor === week && Date.now() - loadedAt < STALE_MS)) return;
    loading = true;
    if (!loadedAt || loadedFor !== week) show("Your gameweek", [el("p", "note", "Loading your gameweek…")]);
    send({ type: "overlay-plan", ...(week ? { fixture: week } : {}) }, (answer) => {
      loading = false;
      if (week !== weekHere()) {
        if (open) fetchPlan(); // the page moved to another gameweek while this was out: its answer is about the last one
        return;
      }
      if (answer && answer.state === "ok") {
        loadedAt = Date.now();
        loadedFor = week;
      }
      render(answer);
    });
  }

  function toggle(next) {
    open = next;
    panel.classList.toggle("open", open);
    panel.toggleAttribute("inert", !open);
    tab.setAttribute("aria-expanded", String(open));
    if (open) {
      fetchPlan();
      close.focus();
    } else {
      tab.focus();
    }
  }

  const onKey = (event) => {
    if (open && event.key === "Escape") toggle(false);
  };

  /** The tab belongs on Sorare's football pages; Sorare navigates without reloading, so this is checked on each move. */
  function place() {
    if (!host) return;
    const here = location.pathname.startsWith("/football");
    host.hidden = !here;
    if (!here && open) toggle(false);
    else if (open) fetchPlan(); // Sorare moved to another gameweek without a reload: an open drawer follows it
  }

  function setup() {
    if (host) return;
    host = document.createElement("div");
    host.setAttribute("data-sfx-drawer", "");
    const root = host.attachShadow({ mode: "open" });
    const style = document.createElement("style");
    style.textContent = STYLE;

    tab = el("button", "tab");
    tab.type = "button";
    tab.setAttribute("aria-expanded", "false");
    tab.setAttribute("aria-controls", "sofix-drawer");
    tab.append(el("i", "mark"), document.createTextNode("Sofix"));
    tab.addEventListener("click", () => toggle(!open));

    panel = el("div", "drawer");
    panel.id = "sofix-drawer";
    panel.setAttribute("role", "dialog");
    panel.setAttribute("aria-labelledby", "sofix-drawer-title");
    panel.setAttribute("inert", "");
    const head = el("div", "head");
    title = el("span", "", "Your gameweek");
    title.id = "sofix-drawer-title";
    close = el("button", "x", "✕");
    close.type = "button";
    close.setAttribute("aria-label", "Close");
    close.addEventListener("click", () => toggle(false));
    head.append(el("i", "mark"), title, close);
    body = el("div");
    body.style.display = "contents";
    body.setAttribute("aria-live", "polite");
    panel.append(head, body);

    root.append(style, tab, panel);
    document.body.append(host);
    document.addEventListener("keydown", onKey, true);
    if (globalThis.navigation) globalThis.navigation.addEventListener("navigatesuccess", place);
    window.addEventListener("popstate", place);
    place();
  }

  function teardown() {
    document.removeEventListener("keydown", onKey, true);
    window.removeEventListener("popstate", place);
    if (globalThis.navigation) globalThis.navigation.removeEventListener("navigatesuccess", place);
    if (host) host.remove();
    host = tab = panel = title = body = close = null;
    open = false;
    loadedAt = 0;
    loadedFor = "";
    loading = false;
  }

  const apply = (value) => {
    try {
      if (value === false) teardown();
      else if (document.body) setup();
      else document.addEventListener("DOMContentLoaded", () => apply(true), { once: true });
    } catch {
      // never break their page
    }
  };
  try {
    chrome.storage.sync.get({ overlay: true }).then(({ overlay }) => apply(overlay), () => apply(true));
    chrome.storage.onChanged.addListener((changes, area) => {
      if (area === "sync" && changes.overlay) apply(changes.overlay.newValue);
    });
  } catch {
    apply(true);
  }
})();
