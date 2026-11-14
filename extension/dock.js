// Sofix extension, the dock on sorare.com (plans/dock-v2.md; design: the canvas https://claude.ai/artifact/4daWa7gp7cLGswDmu3MxgJ).
// Sofix's middleman on Sorare: a 22 px tag in the corner (lineups entered of the plan and the lock, or the live score), opening a small
// panel with two tabs:
//   Lineups  each lineup of the best plan as a ticket with its own reward %; a tap shows its cards as a field; tick several and enter them.
//   Missions Load missions reads Sorare's missions from this tab; then Sofix's picks per mission, and every candidate of an opened one.
// Entering runs Apply's three steps (Check, then Draft, then Enter), one press each, for every ticked lineup, in this tab's own session.
// Nothing is chained and nothing runs by itself. Sorare is read live through this tab; Sofix's numbers come from the app, asked again
// when the panel opens and at most every two minutes while it is open.
//
// It lives in a shadow root, so Sorare's styles cannot reach it and its own cannot leak out, and it is switched by the same popup
// switch as the tiles ("Scores on sorare.com").
(() => {
  if (globalThis.__sofixDock === 1) return;
  const core = globalThis.__sofixCore;
  if (!core) return;
  globalThis.__sofixDock = 1;

  const STALE_MS = 2 * 60 * 1000; // asked again within two minutes: what was drawn is still right
  const SHIRT = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linejoin="round" aria-hidden="true"><path d="M8 3l-5 3 2 5 3-1v11h8V10l3 1 2-5-5-3a4 4 0 0 1-8 0z"/></svg>';
  const STYLE = `
    :host { all: initial; }
    * { box-sizing: border-box; }
    button { font: inherit; color: inherit; cursor: pointer; border: 0; background: none; padding: 0; text-align: inherit; }
    button:disabled { cursor: default; opacity: .5; }
    button:focus-visible { outline: 2px solid var(--ivory); outline-offset: 2px; }
    .dock {
      --bg: #121413; --p2: #191c1a; --p3: #202421; --rule: rgba(255, 255, 255, .07);
      --t1: #f2f4f2; --t2: #b3b9b4; --t3: #8b928d; --ivory: #ebe3cf; --sky: #79c3ff; --vio: #b8a4ff; --ok: #8fd0a8; --amber: #f2cf3c; --red: #ff8a80;
      --ease: cubic-bezier(.3, .7, .2, 1);
      position: fixed; right: 16px; bottom: 16px; z-index: 2147483000; display: flex; flex-direction: column; align-items: flex-end; gap: 8px;
      font: 500 12px/1.3 Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; color: var(--t1); -webkit-font-smoothing: antialiased;
    }
    .cond { font-family: "Barlow Condensed", "Arial Narrow", -apple-system, sans-serif; font-weight: 700; font-variant-numeric: tabular-nums; }
    .caps { font-family: "Barlow Condensed", "Arial Narrow", -apple-system, sans-serif; font-weight: 600; text-transform: uppercase; letter-spacing: .09em; }
    .t2 { color: var(--t2); } .t3 { color: var(--t3); }
    small { font-size: 11px; font-weight: 600; color: var(--t3); }

    .tag { display: inline-flex; align-items: center; gap: 6px; height: 22px; padding: 0 8px 0 7px; border-radius: 6px; white-space: nowrap; font-size: 11px; color: var(--t3);
      background: rgba(18, 20, 19, .72); backdrop-filter: blur(10px); -webkit-backdrop-filter: blur(10px); box-shadow: inset 0 0 0 1px var(--rule); }
    .tag .cond { font-size: 13px; line-height: 1; color: var(--t1); }
    .tag[aria-expanded="true"] { background: var(--bg); }
    .glyph { position: relative; width: 9px; height: 9px; flex: none; }
    .glyph::before, .glyph::after { content: ""; position: absolute; left: 0; right: 0; height: 4px; border-radius: 1px; background: var(--t2); }
    .glyph::before { top: 0; } .glyph::after { bottom: 0; opacity: .45; }

    .pop { width: 316px; max-height: calc(100vh - 80px); display: flex; flex-direction: column; border-radius: 14px; background: var(--bg); overflow: hidden;
      box-shadow: inset 0 0 0 1px var(--rule), 0 24px 60px rgba(0, 0, 0, .65); transform-origin: bottom right; animation: pop .24s var(--ease) both; }
    .tabs { display: flex; align-items: stretch; height: 38px; padding: 0 12px; gap: 14px; border-bottom: 1px solid var(--rule); flex: none; }
    .tabs button { position: relative; display: flex; align-items: center; gap: 5px; font-size: 12px; color: var(--t3); }
    .tabs button b { font-family: "Barlow Condensed", sans-serif; font-weight: 700; font-size: 13px; color: var(--t2); letter-spacing: 0; }
    .tabs button[aria-selected="true"] { color: var(--t1); }
    .tabs button[aria-selected="true"]::after { content: ""; position: absolute; left: 0; right: 0; bottom: -1px; height: 2px; border-radius: 1px; background: var(--acc, var(--ivory)); }
    .tabs .lock { margin-left: auto; display: flex; align-items: center; font-size: 11px; color: var(--t3); }
    .tabs .lock.soon { color: var(--amber); }
    .body { overflow-y: auto; min-height: 0; }
    .list { display: flex; flex-direction: column; gap: 6px; margin: 0; padding: 8px; list-style: none; }

    .stub { position: relative; display: grid; grid-template-columns: 50px minmax(0, 1fr) 30px; align-items: stretch; min-height: 52px; border-radius: 9px; background: var(--p2); }
    .stub.sel { background: var(--p3); box-shadow: inset 0 0 0 1px rgba(235, 227, 207, .35); }
    .stub.done { opacity: .55; }
    .pct { position: relative; display: flex; align-items: baseline; justify-content: center; padding-top: 15px; border-right: 1.5px dashed rgba(255, 255, 255, .13); }
    .pct::before, .pct::after { content: ""; position: absolute; right: -6px; width: 10px; height: 10px; border-radius: 50%; background: var(--bg); }
    .pct::before { top: -5px; } .pct::after { bottom: -5px; }
    .pct .cond { font-size: 22px; line-height: .9; }
    .pct small { font-size: 11px; color: var(--t3); font-weight: 600; }
    .stub.sel .pct .cond { color: var(--ivory); }
    .open { min-width: 0; padding: 7px 4px 7px 10px; display: flex; flex-direction: column; justify-content: center; gap: 5px; }
    .r1 { display: flex; align-items: center; gap: 8px; min-width: 0; }
    .name { font-weight: 700; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .say { font-size: 11px; font-weight: 600; color: var(--t3); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .say.bad { color: var(--red); white-space: normal; }
    .say.ok { color: var(--ivory); }
    .fan { display: flex; margin-left: auto; flex: none; }
    .fan img { width: 17px; border-radius: 2px; display: block; box-shadow: -2px 1px 4px rgba(0, 0, 0, .6); }
    .fan img + img { margin-left: -6px; }
    .gauge { position: relative; flex: 1; height: 3px; border-radius: 2px; background: rgba(255, 255, 255, .08); }
    .gauge b { position: absolute; left: 0; top: 0; bottom: 0; border-radius: 2px; background: var(--t2); }
    .gauge i { position: absolute; left: 87%; top: -3px; width: 2px; height: 9px; border-radius: 1px; background: var(--ivory); }
    /* Ticking a lineup punches its ticket: an empty dashed ring becomes an ivory stamp with a hole through it. */
    .punch { display: grid; place-items: center; }
    .punch i { display: block; width: 18px; height: 18px; border-radius: 50%; border: 1.5px dashed rgba(255, 255, 255, .25); transition: transform .18s var(--ease); }
    .punch[aria-pressed="true"] i { border: 0; background: radial-gradient(circle, var(--p3) 0 3.5px, transparent 4px), conic-gradient(from 20deg, var(--ivory), #fff7e3, var(--ivory));
      box-shadow: 0 0 0 3px rgba(235, 227, 207, .12); transform: rotate(-12deg) scale(1.05); }

    .head { display: flex; align-items: center; gap: 10px; padding: 10px 12px 2px; }
    .back { font-weight: 800; font-size: 13px; }
    .field { margin: 6px 8px 8px; padding: 14px 10px 12px; border-radius: 10px; display: flex; flex-direction: column; gap: 12px; list-style: none;
      background: radial-gradient(120% 70% at 50% 100%, #1c2420 0%, #141816 60%, #121413 100%); box-shadow: inset 0 0 0 1px var(--rule); }
    .line { display: flex; justify-content: center; gap: 10px; }
    .card { position: relative; display: flex; flex-direction: column; align-items: center; gap: 5px; }
    .card img { width: 100%; display: block; border-radius: 6px; aspect-ratio: 770 / 1246; object-fit: cover; background: #000; box-shadow: 0 6px 16px rgba(0, 0, 0, .5); }
    .card .c { position: absolute; top: -6px; right: -6px; width: 18px; height: 18px; border-radius: 50%; display: grid; place-items: center; background: var(--ivory); color: #17150f; font-size: 11px; font-weight: 800; }
    .card .nums { display: flex; align-items: baseline; gap: 4px; }
    .card .nums .cond { font-size: 16px; line-height: 1; }
    .start { display: inline-flex; align-items: center; gap: 2px; font-size: 11px; font-weight: 600; color: var(--t3); }
    .start svg { width: 11px; height: 11px; flex: none; }
    .start.low { color: var(--amber); }

    .foot { display: flex; align-items: center; gap: 8px; padding: 8px; border-top: 1px solid var(--rule); flex: none; }
    .btn { display: inline-flex; align-items: center; justify-content: center; height: 32px; padding: 0 12px; border-radius: 8px; font-weight: 700; font-size: 12px; background: var(--p3); white-space: nowrap; }
    .btn.go { background: var(--ivory); color: #17150f; flex: 1; }
    .btn.sky { background: var(--sky); color: #04121f; }
    .btn.ghost { background: none; color: var(--t2); box-shadow: inset 0 0 0 1px var(--rule); }
    .btn.sm { height: 24px; padding: 0 10px; font-size: 11px; }
    .note { margin: 0; padding: 12px; font-size: 12px; color: var(--t2); }
    .empty { padding: 28px 16px 24px; display: flex; flex-direction: column; align-items: center; gap: 12px; }

    .mis { border-radius: 9px; background: var(--p2); }
    .mis > button { width: 100%; padding: 8px 10px; display: flex; flex-direction: column; gap: 7px; }
    .mhead { display: flex; align-items: baseline; justify-content: space-between; gap: 8px; width: 100%; }
    .mhead .caps { flex: none; white-space: nowrap; }
    .picks { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 6px; width: 100%; }
    .pick { display: grid; grid-template-columns: 20px minmax(0, 1fr); gap: 6px; align-items: center; padding: 4px; border-radius: 6px; background: rgba(255, 255, 255, .03); }
    .pick img, .cand img { width: 20px; border-radius: 2px; display: block; }
    .pick .n { font-size: 11px; font-weight: 600; color: var(--t2); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .pick .v { display: flex; align-items: baseline; gap: 4px; }
    .pick .cond { font-size: 15px; line-height: 1; }
    .cand { display: grid; grid-template-columns: 20px minmax(0, 1fr) 40px 44px; gap: 8px; align-items: center; padding: 6px; border-radius: 8px; }
    .cand.sofix { background: var(--p2); }
    .cand .cond { font-size: 17px; text-align: right; }
    .cand .start { justify-content: flex-end; font-size: 12px; }
    .sk { display: block; border-radius: 6px; background: linear-gradient(90deg, #1b1e1c 0, #262a27 50%, #1b1e1c 100%); background-size: 400px 100%; animation: shimmer 1.2s linear infinite; }
    .progress { width: 84px; height: 3px; border-radius: 2px; background: var(--p3); overflow: hidden; }
    .progress b { display: block; width: 40%; height: 100%; border-radius: 2px; background: var(--sky); animation: slide 1.1s var(--ease) infinite; }

    /* Arcade: violet is its accent. The step numeral leads, the run's state sits under it, then the tickets. */
    .arc-head { display: flex; align-items: center; gap: 10px; padding: 10px 12px 4px; }
    .arc-head .step { font-size: 30px; line-height: .9; color: var(--vio); text-shadow: 0 0 18px rgba(184, 164, 255, .35); }
    .arc-head .who { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
    .arc-head .big { font-weight: 800; font-size: 13px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .pips { margin-left: auto; display: flex; gap: 3px; flex: none; }
    .pips i { width: 14px; height: 6px; border-radius: 2px; background: var(--p3); }
    .pips i.on { background: var(--vio); box-shadow: 0 0 8px rgba(184, 164, 255, .35); }
    .arc-status { display: flex; align-items: center; gap: 8px; min-height: 30px; padding: 2px 12px; }
    .arc-status .say { white-space: normal; }
    .say.amber { color: var(--amber); } .say.red { color: var(--red); }
    .meter { display: flex; gap: 3px; flex: none; }
    .meter i { width: 16px; height: 3px; border-radius: 2px; background: var(--p3); }
    .meter i.done { background: var(--vio); }
    .meter i.now { background: linear-gradient(90deg, var(--p3), var(--vio), var(--p3)); background-size: 200% 100%; animation: flow 1.1s linear infinite; }
    .chips { display: flex; flex-wrap: wrap; gap: 4px; padding: 0 12px 4px; }
    .chip { font-size: 11px; font-weight: 600; color: var(--t2); padding: 3px 7px; border-radius: 999px; background: var(--p2); box-shadow: inset 0 0 0 1px var(--rule); }
    .chip.ok { color: var(--ok); box-shadow: inset 0 0 0 1px rgba(143, 208, 168, .3); }
    .chip.bad { color: var(--red); box-shadow: inset 0 0 0 1px rgba(255, 138, 128, .3); }
    .chip.warn { color: var(--amber); box-shadow: inset 0 0 0 1px rgba(242, 207, 60, .25); }
    .cap { font-size: 11px; color: var(--t3); padding: 6px 4px 0; list-style: none; }
    .banner { list-style: none; display: grid; grid-template-columns: 16px minmax(0, 1fr) auto; gap: 8px; align-items: center; padding: 8px 10px; border-radius: 9px; font-size: 12px; font-weight: 600; animation: drop .32s var(--ease) both; }
    .banner .ico { display: grid; place-items: center; width: 16px; height: 16px; border-radius: 50%; font-size: 11px; font-weight: 800; }
    .banner.vio { background: rgba(184, 164, 255, .1); box-shadow: inset 0 0 0 1px rgba(184, 164, 255, .28); }
    .banner.vio .ico { background: var(--vio); color: #120c24; }
    .banner.red { background: rgba(255, 138, 128, .1); box-shadow: inset 0 0 0 1px rgba(255, 138, 128, .3); }
    .banner.red .ico { background: var(--red); color: #210807; }
    .stub.arc { grid-template-columns: 50px minmax(0, 1fr) 22px; }
    .stub.arc .open { padding-right: 0; }
    .stub.arc.best { background: var(--p3); box-shadow: inset 0 0 0 1px rgba(184, 164, 255, .38); }
    .stub.arc.best .pct .cond { color: var(--vio); }
    .stub.arc .gauge i { left: 87%; background: var(--vio); }
    .stub.arc .chev { display: grid; place-items: center; font-weight: 800; font-size: 15px; color: var(--t3); }
    .fan img.off { filter: grayscale(1) brightness(.6); }
    .arc.stale > *:not(.arc-status):not(.note) { opacity: .5; }
    .clubs { padding: 0 8px 10px; }
    .club-row { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 6px; margin-top: 4px; }
    .club { display: flex; align-items: center; gap: 6px; min-width: 0; padding: 6px; border-radius: 8px; background: var(--p2); }
    .club img, .club .shield { width: 20px; height: 20px; flex: none; object-fit: contain; }
    .club .shield { border-radius: 4px 4px 10px 10px; background: var(--p3); }
    .club > span { min-width: 0; display: flex; flex-direction: column; }
    .club .n { font-size: 11px; font-weight: 700; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .club .say { font-size: 11px; }
    .src { margin-left: 3px; padding: 0 3px; border-radius: 3px; font-size: 11px; line-height: 14px; font-weight: 700; color: var(--t3); background: rgba(255, 255, 255, .06); }
    .src.xi { color: #0d1f14; background: var(--ok); }
    .arc-field .card.off img { filter: grayscale(1) brightness(.55); }
    .ribbon { position: absolute; top: 34%; left: -4px; right: -4px; text-align: center; font-size: 11px; font-weight: 800; padding: 2px 0; border-radius: 3px; background: var(--red); color: #210807; box-shadow: 0 4px 10px rgba(0, 0, 0, .5); }
    .alts { display: flex; gap: 4px; margin-top: 2px; }
    .alt { display: flex; align-items: center; gap: 2px; padding: 2px 4px 2px 2px; border-radius: 5px; background: rgba(255, 255, 255, .04); }
    .card .alt img { width: 13px; border-radius: 2px; box-shadow: none; aspect-ratio: 770 / 1246; }
    .alt .cond { font-size: 11px; color: var(--t2); }
    .tag .flag { width: 6px; height: 6px; border-radius: 50%; flex: none; }
    .tag .flag.red { background: var(--red); box-shadow: 0 0 0 3px rgba(255, 138, 128, .2); }
    .tag .flag.vio { background: var(--vio); box-shadow: 0 0 0 3px rgba(184, 164, 255, .2); }
    @keyframes flow { from { background-position: 100% 0; } to { background-position: -100% 0; } }
    @keyframes drop { from { opacity: 0; transform: translateY(-4px); } }
    @keyframes pop { from { opacity: 0; transform: translateY(8px) scale(.98); } }
    @keyframes shimmer { from { background-position: -200px 0; } to { background-position: 200px 0; } }
    @keyframes slide { from { transform: translateX(-100%); } to { transform: translateX(260%); } }
    @media (max-width: 900px) { .dock { display: none; } }
    @media (prefers-reduced-motion: reduce) { .pop, .sk, .progress b, .meter i.now, .banner { animation: none; } .punch i { transition: none; } }
  `;

  let host = null;
  let dock = null;
  let open = false;
  let tab = "lineups";
  let view = null; // the lineup (its key) or mission (its id) opened, or null for the list
  let data = null; // { state, plan, missions }
  let loadedAt = 0;
  let loadedFor = "";
  let loading = false;
  let busy = false;
  let sorare = null; // { at, fixture, entered, live } what Sorare holds for the gameweek, read through this tab; null before a read worked
  let sorareBusy = false;
  let sorareTimer = 0;
  let reading = { busy: false, said: "" }; // Load missions
  const ticked = new Set(); // lineup keys
  const applied = new Map(); // lineup key -> { stage 0 check, 1 draft, 2 enter, 3 entered; lineupId; note; failed }

  function el(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  }

  function img(src, alt = "") {
    const node = el("img");
    node.alt = alt;
    node.referrerPolicy = "no-referrer";
    node.loading = "lazy";
    node.src = core.sorarePic(src);
    return node;
  }

  function button(className, label, onClick, aria) {
    const node = el("button", className, label);
    node.type = "button";
    if (aria) node.setAttribute("aria-label", aria);
    node.addEventListener("click", (event) => {
      event.stopPropagation();
      onClick(event);
    });
    return node;
  }

  function send(message) {
    return new Promise((resolve) => {
      try {
        chrome.runtime.sendMessage(message, (answer) => {
          void chrome.runtime.lastError;
          resolve(answer);
        });
      } catch {
        teardown(); // the extension was reloaded under this tab
        resolve(null);
      }
    });
  }

  const goTo = (path) => send({ type: "open-app", path });

  /** A big number and its small unit, as the tickets draw a chance: "16" and "%". */
  function percent(p) {
    const said = core.chanceLabel(p);
    const node = el("span");
    node.append(el("span", "cond", said.replace("%", "")), el("small", "", "%"));
    return node;
  }

  /** His start %, marked by the shirt so it never reads as the other number beside it; amber under 50%. */
  function startNode(p) {
    const node = el("span", typeof p === "number" && p < core.DOUBTFUL ? "start low" : "start");
    node.innerHTML = SHIRT;
    node.append(typeof p === "number" ? core.chanceLabel(p) : "–");
    node.title = "Chance he starts";
    return node;
  }

  // -- data --------------------------------------------------------------------------------------------------------

  /** The gameweek the page's address names ("" when it names none): the plan shown is that week's, as the tiles are. */
  const weekHere = () => core.fixtureOf(location.href) || "";

  async function load(force = false, fresh = false) {
    const week = weekHere();
    if (loading || (!force && loadedAt && loadedFor === week && Date.now() - loadedAt < STALE_MS)) return;
    loading = true;
    const answer = await send({ type: "overlay-plan", missions: true, ...(fresh ? { fresh: true } : {}), ...(week ? { fixture: week } : {}) });
    loading = false;
    if (week !== weekHere()) return load(); // the page moved to another gameweek while this was out
    if (answer && answer.state === "ok") {
      if (data?.plan?.week !== answer.plan?.week) { applied.clear(); ticked.clear(); view = null; }
      loadedAt = Date.now();
      loadedFor = week;
    }
    data = answer || { state: "unreachable" };
    render();
    readSorare();
  }

  const ready = () => (data && data.state === "ok" && data.plan && data.plan.state === "ready" ? data.plan : null);
  const rows = () => (ready() && Array.isArray(ready().rows) ? ready().rows : []);
  const missions = () => (data && data.missions && Array.isArray(data.missions.missions) ? data.missions : null);
  const lockOf = (plan) => (plan ? (plan.pro ? plan.pro.starts : plan.lock) : null);
  const locked = () => Boolean(ready() && core.lockLabel(lockOf(ready())).text === "Locked");

  /** One lineup's own key: its competition and cards. Four lineups of a plan can share one competition (13 Nov: entering one marked them all). */
  const keyOf = (row) => `${row.board}:${row.cards.filter((card) => !card.sub).map((card) => card.slug).sort().join(",")}`;

  /** Each lineup's name, numbered when the plan has more than one in a competition ("LaLiga Limited 2"). */
  function namesOf(list) {
    const total = {};
    for (const row of list) total[row.comp] = (total[row.comp] || 0) + 1;
    const seen = {};
    return list.map((row) => (total[row.comp] > 1 ? `${row.comp} ${(seen[row.comp] = (seen[row.comp] || 0) + 1)}` : row.comp));
  }

  // -- what Sorare holds: read live through this tab ----------------------------------------------------------------

  /** Your lineups of the gameweek on Sorare (read only): which of the plan's are entered and, after the lock, what they have scored. */
  async function readSorare(force = false) {
    const plan = ready();
    if (!plan || !plan.fixture || sorareBusy) return;
    if (!force && sorare && sorare.fixture === plan.fixture && Date.now() - sorare.at < STALE_MS) return;
    sorareBusy = true;
    const answer = await send({ type: "dock-step", step: "week-entered", slug: plan.fixture });
    sorareBusy = false;
    const entered = core.enteredOf(answer);
    if (!entered || !ready() || ready().fixture !== plan.fixture) return; // a failed read changes nothing: never "nothing entered"
    sorare = { at: Date.now(), fixture: plan.fixture, entered, live: core.liveScores(answer) };
    render();
  }

  const sorareHere = () => (sorare && ready() && sorare.fixture === ready().fixture ? sorare : null);
  const stateOf = (row) => applied.get(keyOf(row)) || { stage: 0 };
  const isEntered = (row) => stateOf(row).stage >= 3 || Boolean(sorareHere() && core.alreadyEntered(sorareHere().entered, row.cards.filter((card) => !card.sub).map((card) => card.slug)));
  const canTick = (row) => !row.pro && !locked() && !isEntered(row);
  const liveHere = () => (locked() && sorareHere() && sorareHere().live ? sorareHere().live : null);
  /** The entry on Sorare with this lineup's cards (not a draft), whose score is this lineup's own, or null when it was not entered. */
  const entryOf = (row) => {
    const want = row.cards.filter((card) => !card.sub).map((card) => card.slug).sort().join(",");
    return (sorareHere() ? sorareHere().entered : []).find((one) => !one.draft && [...one.cards].sort().join(",") === want) || null;
  };

  /** While the panel is open, Sorare and Sofix are asked again every two minutes; closed, once when a page opens. */
  function watch() {
    clearInterval(sorareTimer);
    sorareTimer = 0;
    if (open) sorareTimer = setInterval(() => { load(); readSorare(true); }, STALE_MS);
  }

  // -- Apply, from here --------------------------------------------------------------------------------------------

  const CANNOT = {
    "no-bridge": "Reload this page: Sorare's page has not spoken to its own API yet.",
    timeout: "Sorare didn't answer. Check Sorare before pressing again.",
    error: "Sorare's answer could not be verified. Check Sorare before pressing again.",
    "no-tab": "This page lost its Sorare session. Reload it.",
  };

  async function step(name, input) {
    const answer = await send({ type: "dock-step", step: name, ...input });
    return core.stepAnswer(answer, name);
  }

  /** One press for the ticked lineups: each moves one step, the step it is at. A lineup that fails stops there, in Sorare's words. */
  async function press() {
    if (busy) return;
    const list = rows();
    const names = namesOf(list);
    const targets = list.map((row, i) => ({ row, name: names[i] })).filter(({ row }) => ticked.has(keyOf(row)) && canTick(row));
    const next = nextPress(targets.map(({ row }) => row));
    if (!next) return;
    busy = true;
    render();
    const plan = ready();
    for (const { row, name } of targets) {
      const key = keyOf(row);
      const now = stateOf(row);
      if (now.failed || now.stage !== next.stage) continue;
      if (now.stage === 0) {
        const held = await step("entered", { slug: row.board });
        if (held.state === "ok" && core.alreadyEntered(held.entered, row.appearances.map((a) => a.cardSlug))) {
          applied.set(key, { stage: 3, note: "Entered" });
          ticked.delete(key);
          continue;
        }
        const checked = await step("check", { slug: row.board, appearances: row.appearances });
        if (checked.state === "ok" && !checked.broken.length) applied.set(key, { stage: 1 });
        else applied.set(key, { stage: 0, failed: true, note: checked.state === "ok" ? checked.broken[0] : checked.state === "rejected" ? checked.errors[0] || "Sorare refused it." : CANNOT[checked.state] });
      } else if (now.stage === 1) {
        const saved = await step("draft", { boardId: row.boardId, appearances: row.appearances, name: `Sofix · plan 1 · GW${plan ? plan.week : ""} · ${name}` });
        if (saved.state === "ok" && saved.lineupId) applied.set(key, { stage: 2, lineupId: saved.lineupId });
        else applied.set(key, { stage: 1, failed: true, note: saved.state === "rejected" ? saved.errors[0] || "Sorare refused it." : CANNOT[saved.state] || CANNOT.error });
      } else if (now.stage === 2) {
        const entered = await step("enter", { lineupIds: [now.lineupId] });
        if (entered.state === "ok") {
          applied.set(key, { stage: 3, note: "Entered" });
          ticked.delete(key);
        } else applied.set(key, { ...now, failed: true, note: entered.state === "rejected" ? entered.errors[0] || "Sorare refused it." : CANNOT[entered.state] || CANNOT.error });
      }
      render();
    }
    busy = false;
    render();
    readSorare(true);
  }

  /** What the next press does for these lineups, and how many it moves. */
  function nextPress(targets) {
    const moving = targets.filter((row) => !stateOf(row).failed && stateOf(row).stage < 3);
    if (!moving.length) return null;
    const stage = Math.min(...moving.map((row) => stateOf(row).stage));
    return { stage, count: moving.filter((row) => stateOf(row).stage === stage).length };
  }

  function pressLabel(next) {
    if (!next) return "Check";
    const n = next.count;
    if (next.stage === 0) return `Check ${n}`;
    if (next.stage === 1) return n === 1 ? "Save as a draft" : `Save ${n} as drafts`;
    return n === 1 ? "Enter it now" : `Enter ${n} now`;
  }

  // -- Load missions: Sorare's missions read through this tab, then today's plan asked of the app again ---------------------

  const READ_FAILED = {
    "no-tab": "Open a Sorare page signed in, then load again.",
    "signed-out": "Sign in to Sorare, then load again.",
    incomplete: "Sorare gave part of your missions. Load again.",
    "app-error": "Sofix could not save them. Load again.",
    timeout: "Sorare didn't answer. Load again.",
    "no-bridge": "Reload this page, then load again.",
  };

  async function loadMissions() {
    if (reading.busy) return;
    reading = { busy: true, said: "" };
    render();
    const answer = await send({ type: "dock-load-missions" });
    if (answer && answer.state === "ok") await load(true, true);
    reading = { busy: false, said: answer && answer.state === "ok" ? "" : READ_FAILED[answer && answer.state] || "Sorare's missions could not be read. Load again." };
    render();
  }

  // -- drawing -----------------------------------------------------------------------------------------------------

  /** The lock as the tag says it: "16:00", "Fri 16:00", "in 42 min", "Locked". */
  const lockShort = (plan) => {
    const lock = core.lockLabel(lockOf(plan));
    return { text: lock.text.replace(/^Locks /, ""), soon: lock.soon };
  };

  function tag() {
    const plan = ready();
    const node = button("tag", "", () => setOpen(!open), open ? "Close Sofix" : "Open Sofix");
    node.setAttribute("aria-expanded", String(open));
    node.setAttribute("aria-controls", "sofix-dock");
    node.append(el("i", "glyph"));
    // An entered Arcade lineup with a card the announced eleven leaves out: red, open or closed; a fresh plan change: violet.
    if (arcadeAlerts().length) {
      const flag = el("i", "flag red");
      flag.title = "An entered Arcade lineup has a card not starting";
      node.append(flag);
      node.setAttribute("aria-label", `${node.getAttribute("aria-label")}: an Arcade lineup has a card not starting`);
    } else if (freshChange()) {
      const flag = el("i", "flag vio");
      flag.title = freshChange().text;
      node.append(flag);
    }
    const live = liveHere();
    if (!plan) node.append(el("span", "", data && data.plan && data.plan.week ? `GW${data.plan.week}` : "Sofix"));
    else if (live && live.lineups) node.append(el("span", "cond", String(live.total)), el("span", "", " live"));
    else {
      const list = rows();
      const lock = lockShort(plan);
      if (sorareHere()) node.append(el("span", "cond", `${list.filter(isEntered).length}/${list.length}`));
      else node.append(el("span", "cond", `GW${plan.week}`));
      if (lock.text) node.append(el("span", "", ` · ${lock.text}`));
      if (lock.soon) node.style.color = "var(--amber)";
    }
    return node;
  }

  function tabsNode() {
    const node = el("div", "tabs");
    node.setAttribute("role", "tablist");
    if (tab === "missions") node.style.setProperty("--acc", "var(--sky)");
    if (tab === "arcade") node.style.setProperty("--acc", "var(--vio)");
    const today = missions();
    const am = arcadeModel();
    const tabs = [["lineups", "Lineups", rows().length], ["missions", "Missions", today && today.status === "today" ? today.missions.length : 0], ["arcade", "Arcade", am ? (am.next ? 1 : 0) + (am.best.length ? 1 : 0) : 0]];
    for (const [key, label, count] of tabs) {
      const one = button("caps", label, () => { tab = key; view = null; arcadeView = null; if (key === "arcade") arcadeOpened(); render(); });
      one.setAttribute("role", "tab");
      one.setAttribute("aria-selected", String(tab === key));
      if (count) one.append(el("b", "", String(count)));
      node.append(one);
    }
    const plan = ready();
    if (tab === "arcade") {
      if (am && am.set.end) node.append(el("span", "lock", `ends ${whenShort(am.set.end).replace(/ \d\d:\d\d$/, "")}`));
    } else if (plan) {
      const lock = lockShort(plan);
      node.append(el("span", lock.soon ? "lock soon" : "lock", plan.week ? `GW${plan.week}${lock.text ? ` · ${lock.text}` : ""}` : lock.text));
    }
    return node;
  }

  function lineupItem(row, name) {
    const key = keyOf(row);
    const state = stateOf(row);
    const entered = isEntered(row);
    const live = liveHere();
    const entry = live ? entryOf(row) : null;
    const soFar = entry && typeof entry.score === "number" ? Math.round(entry.score) : null;
    const item = el("li", `stub${ticked.has(key) ? " sel" : ""}${entered && !live ? " done" : ""}`);
    const pct = el("div", "pct");
    pct.append(percent(row.p));
    pct.title = "Chance of a reward: essence, cash or a card";
    const body = button("open", "", () => { view = key; render(); });
    const r1 = el("span", "r1");
    const fan = el("span", "fan");
    fan.setAttribute("aria-hidden", "true");
    for (const card of row.cards.filter((one) => !one.sub).slice(0, 4)) fan.append(img(card.pic));
    r1.append(el("span", "name", name), fan);
    const r2 = el("span", "r1");
    const shown = soFar ?? row.x;
    const gauge = el("span", "gauge");
    const fill = el("b");
    fill.style.width = `${row.need ? Math.min(100, Math.round((shown / (row.need * 1.15)) * 100)) : 0}%`;
    gauge.append(fill);
    if (row.need) gauge.append(el("i"));
    r2.append(el("span", "cond", String(shown)), gauge);
    if (row.need) r2.append(el("span", "say", `of ${row.need}`));
    body.append(r1, r2);
    const note = soFar !== null && row.need && soFar >= row.need ? ["ok", "Reached"]
      : state.failed ? ["bad", state.note]
        : entered && !live ? ["ok", "Entered"] : null;
    if (note) body.append(el("span", `say ${note[0]}`, note[1]));
    item.append(pct, body);
    if (canTick(row)) {
      const punch = button("punch", "", () => {
        if (ticked.has(key)) ticked.delete(key);
        else { ticked.add(key); if (state.failed) applied.delete(key); }
        render();
      }, `Tick ${name}`);
      punch.setAttribute("aria-pressed", String(ticked.has(key)));
      punch.disabled = busy;
      punch.append(el("i"));
      item.append(punch);
    } else item.append(el("span"));
    return item;
  }

  /** A lineup's starters on a pitch, as Sorare lays them out: attack at the top, the keeper at the bottom; five cards make three lines. */
  function fieldLines(cards) {
    const starters = cards.filter((card) => !card.sub);
    const pick = (test) => starters.filter((card) => test(String(card.slot || "").toUpperCase()));
    const gk = pick((slot) => slot === "GK");
    const def = pick((slot) => slot === "DEF");
    const mid = pick((slot) => slot === "MID");
    const att = starters.filter((card) => !gk.includes(card) && !def.includes(card) && !mid.includes(card));
    const lines = starters.length <= 5 ? [att, [...def, ...mid], gk] : [att, mid, def, gk];
    return lines.filter((line) => line.length);
  }

  function lineupView(row, name) {
    const nodes = [];
    const head = el("div", "head");
    head.append(button("back", `‹ ${name}`, () => { view = null; render(); }, "Back to all lineups"));
    const sum = el("span", "t3");
    sum.style.marginLeft = "auto";
    sum.append(el("span", "cond", String(row.x)), document.createTextNode(row.need ? ` of ${row.need}` : ""));
    sum.querySelector(".cond").style.cssText = "font-size:18px;color:var(--t1)";
    const pct = percent(row.p);
    pct.style.color = "var(--ivory)";
    pct.querySelector(".cond").style.fontSize = "18px";
    head.append(sum, pct);
    nodes.push(head);
    const field = el("ul", "field");
    field.setAttribute("aria-label", `${name}: its cards`);
    const lines = fieldLines(row.cards);
    const width = row.cards.filter((card) => !card.sub).length > 5 ? "62px" : "80px";
    for (const line of lines) {
      const li = el("li", "line");
      for (const card of line) {
        const one = el("div", "card");
        one.style.width = width;
        one.append(img(card.pic, `${card.name}${card.captain ? ", captain" : ""}`));
        if (card.captain) {
          const c = el("span", "c", "C");
          c.setAttribute("aria-hidden", "true");
          one.append(c);
        }
        const nums = el("span", "nums");
        nums.append(el("span", "cond", String(card.s)));
        if (typeof card.start === "number") nums.append(startNode(card.start));
        one.append(nums);
        li.append(one);
      }
      field.append(li);
    }
    nodes.push(field);
    return nodes;
  }

  function lineupsView() {
    const plan = ready();
    if (!plan) {
      const why = !data ? "Loading your gameweek…"
        : data.state === "auth" ? "Sofix does not recognise this extension."
          : data.state !== "ok" ? "Sofix is not reachable right now."
            : data.plan && data.plan.note ? data.plan.note : "Nothing is planned for this gameweek yet.";
      const foot = el("div", "foot");
      foot.append(button("btn ghost", "Open Sofix", () => goTo("/")));
      return [el("p", "note", why), foot];
    }
    const list = rows();
    const names = namesOf(list);
    const opened = list.findIndex((row) => keyOf(row) === view);
    if (opened >= 0) return lineupView(list[opened], names[opened]);
    const ul = el("ul", "list");
    list.forEach((row, i) => ul.append(lineupItem(row, names[i])));
    const nodes = [ul];
    if (list.some(canTick)) {
      const foot = el("div", "foot");
      const tickable = list.filter(canTick);
      const all = tickable.every((row) => ticked.has(keyOf(row)));
      foot.append(button("btn ghost", all ? "None" : "All", () => {
        for (const row of tickable) all ? ticked.delete(keyOf(row)) : ticked.add(keyOf(row));
        render();
      }, all ? "Untick all" : "Tick all"));
      const next = nextPress(tickable.filter((row) => ticked.has(keyOf(row))));
      const go = button("btn go", busy ? "Asking Sorare…" : pressLabel(next), press);
      go.disabled = busy || !next;
      foot.append(go);
      nodes.push(foot);
    }
    return nodes;
  }

  function missionItem(mission) {
    const item = el("li", "mis");
    const line = button("", "", () => { view = mission.id; render(); });
    const head = el("span", "mhead");
    head.append(el("span", "name", mission.title), el("span", "caps t3", mission.reward || ""));
    head.lastChild.style.fontSize = "11px";
    line.append(head);
    const sofix = Array.isArray(mission.sofix) ? mission.sofix : [];
    if (sofix.length) {
      const picks = el("span", "picks");
      for (const one of sofix) {
        const box = el("span", "pick");
        box.append(img(one.pic, one.name));
        const text = el("span");
        text.style.minWidth = "0";
        const v = el("span", "v");
        const chance = el("span", "cond", one.chance === null ? "–" : core.chanceLabel(one.chance));
        chance.title = "Chance he does it if he plays";
        v.append(chance, startNode(one.start));
        text.append(el("span", "n", one.name), v);
        text.firstChild.style.display = "block";
        box.append(text);
        picks.append(box);
      }
      line.append(picks);
    } else line.append(el("span", "say", "No card of yours can play it today"));
    item.append(line);
    return item;
  }

  function missionView(mission) {
    const head = el("div", "head");
    head.append(button("back", `‹ ${mission.title}`, () => { view = null; render(); }, "Back to missions"));
    const meta = el("span", "caps t3", [`Pick ${mission.picks}`, mission.reward].filter(Boolean).join(" · "));
    meta.style.cssText = "margin-left:auto;font-size:11px";
    head.append(meta);
    const ul = el("ul", "list");
    ul.setAttribute("aria-label", `${mission.title}: every card that can play it`);
    ul.style.gap = "3px";
    // an app from before 13 Nov 2026 sends no candidates: Sofix's picks stand in for them
    const all = Array.isArray(mission.all) ? mission.all : (Array.isArray(mission.sofix) ? mission.sofix : []).map((one) => ({ ...one, sofix: true }));
    for (const one of all) {
      const li = el("li", one.sofix ? "cand sofix" : "cand");
      const who = el("div");
      who.style.minWidth = "0";
      who.append(el("div", "name", one.name));
      const sub = el("div", "say", [one.club, one.sofix ? "Sofix" : ""].filter(Boolean).join(" · "));
      if (one.sofix) sub.style.color = "var(--sky)";
      who.append(sub);
      const chance = el("span", "cond", one.chance === null ? "–" : core.chanceLabel(one.chance));
      chance.title = "Chance he does it if he plays";
      li.append(img(one.pic, ""), who, chance, startNode(one.start));
      ul.append(li);
    }
    return [head, ul];
  }

  function skeleton() {
    const ul = el("ul", "list");
    ul.setAttribute("aria-hidden", "true");
    for (let i = 0; i < 3; i++) {
      const li = el("li", "mis");
      li.style.cssText = "padding:8px 10px;display:flex;flex-direction:column;gap:7px";
      const head = el("span", "mhead");
      const a = el("span", "sk"); a.style.cssText = "width:120px;height:13px";
      const b = el("span", "sk"); b.style.cssText = "width:60px;height:11px";
      head.append(a, b);
      const picks = el("span", "picks");
      for (let j = 0; j < 3; j++) {
        const box = el("span", "pick");
        const pic = el("span", "sk"); pic.style.cssText = "width:20px;height:32px;border-radius:2px";
        const lines = el("span"); lines.style.cssText = "display:flex;flex-direction:column;gap:4px";
        const l1 = el("span", "sk"); l1.style.cssText = "width:44px;height:9px";
        const l2 = el("span", "sk"); l2.style.cssText = "width:30px;height:13px";
        lines.append(l1, l2);
        box.append(pic, lines);
        picks.append(box);
      }
      li.append(head, picks);
      ul.append(li);
    }
    return ul;
  }

  function missionsView() {
    const today = missions();
    const loaded = today && today.status === "today";
    if (reading.busy) {
      const head = el("div", "head");
      const said = el("span", "caps t3", "Reading Sorare");
      said.style.fontSize = "11px";
      said.setAttribute("role", "status");
      const bar = el("span", "progress");
      bar.style.marginLeft = "auto";
      bar.append(el("b"));
      head.append(said, bar);
      return [head, skeleton()];
    }
    if (!loaded) {
      const box = el("div", "empty");
      const said = el("span", reading.said ? "say bad" : "caps t3", reading.said || "Today's missions aren't read yet");
      if (reading.said) said.setAttribute("role", "status");
      box.append(said, button("btn sky", "Load missions", loadMissions));
      return [box];
    }
    const opened = today.missions.find((one) => one.id === view);
    if (opened) return missionView(opened);
    const head = el("div", "head");
    const ago = today.seenAt ? core.agoLabel(today.seenAt, Date.now()) : null;
    const said = el("span", reading.said ? "say bad" : "caps t3", reading.said || (ago ? `Read from Sorare ${ago}` : "Read from Sorare"));
    said.style.fontSize = "11px";
    const again = button("btn ghost sm", "↻ Load again", loadMissions, "Load missions again");
    again.style.marginLeft = "auto";
    head.append(said, again);
    const ul = el("ul", "list");
    today.missions.forEach((mission) => ul.append(missionItem(mission)));
    const nodes = [head, ul];
    if (!today.missions.length) nodes.push(el("p", "note", "No missions are open today."));
    return nodes;
  }

  // -- Arcade (plans/dock-v2.md): the extension's engine works the Arcade page's climb out; this draws what it stored -------------------

  const ARCADE_FRESH_MS = 10 * 60 * 1000; // opening the tab later than this after the last plan works it out again
  const GRACE_MS = 15 * 1000; // lib/arcadeEngine.ts: a run this far past its stage's deadline has stopped
  const STAGE_WORDS = { board: "Reading your board", forecasts: "Reading forecasts", lineups: "Checking lineups", plan: "Working out the climb" };
  const STAGE_ORDER = ["board", "forecasts", "lineups", "plan"];
  const SOURCE = { lineup: ["XI", "Announced lineup"], futbolfantasy: ["FF", "Futbol Fantasy"], sorare: ["SO", "Sorare"], sofix: ["SX", "Sofix"] };
  const EMPTY = {
    "no-set": "No Arcade set is running on Sorare right now.",
    "no-board": "Sorare has no set board for this account yet.",
    "no-games": "No game of your cards is left before the set ends.",
    ended: "This set has ended.",
  };
  let arcade = { model: null, run: null, lastRun: 0 };
  let arcadeView = null; // null, "best", or a lineup key
  let arcadeTimer = 0;
  let seenChange = 0;

  const madridDay = new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Madrid", weekday: "short" });
  const madridTime = new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Madrid", hour: "2-digit", minute: "2-digit" });
  const madridDate = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Madrid" });
  /** "Today 18:30", "Sun 14:00": when a lineup's first game kicks off, as the tickets say it. */
  function whenShort(value) {
    const at = typeof value === "number" ? value : Date.parse(value);
    if (!Number.isFinite(at)) return "Date TBC";
    const day = madridDate.format(at) === madridDate.format(Date.now()) ? "Today" : madridDay.format(at);
    return `${day} ${madridTime.format(at)}`;
  }
  const clock = (value) => madridTime.format(typeof value === "number" ? value : Date.parse(value));

  const arcadeModel = () => (arcade && arcade.model && arcade.model.v === 1 ? arcade.model : null);
  const arcadeRunState = () => (arcade && arcade.run ? arcade.run : null);
  const working = () => { const run = arcadeRunState(); return Boolean(run && run.state === "working" && Date.now() <= run.deadline + GRACE_MS); };
  const stoppedRun = () => { const run = arcadeRunState(); return Boolean(run && run.state === "working" && Date.now() > run.deadline + GRACE_MS); };
  const failedRun = () => { const run = arcadeRunState(); return run && run.state === "failed" ? run : null; };
  /** The plan on screen is older than a run that failed or stopped since: drawn greyed with its time. */
  const arcadeStale = () => Boolean(arcadeModel() && (failedRun() || stoppedRun()));
  const arcadeAlerts = () => (arcadeModel() ? arcadeModel().alerts : []);
  const freshChange = () => { const m = arcadeModel(); return m && m.change && m.change.at > seenChange && Date.now() - m.change.at < 60 * 60 * 1000 ? m.change : null; };

  function runArcade(force = false) {
    send({ type: "arcade-run", force }).then(() => render());
  }

  /** While a run goes, redraw every few seconds so its stage, and a stop past its deadline, show without a click. */
  function arcadeTick() {
    clearInterval(arcadeTimer);
    arcadeTimer = 0;
    if (open && tab === "arcade" && (working() || stoppedRun())) arcadeTimer = setInterval(render, 4000);
  }

  function arcadeOpened() {
    const m = arcadeModel();
    if (m && m.change) seenChange = m.change.at;
    if (!working() && (!m || Date.now() - m.at > ARCADE_FRESH_MS)) runArcade(false);
  }

  function onArcadeStored(changes, area) {
    if (area !== "local" || !changes.arcadeDock) return;
    arcade = changes.arcadeDock.newValue || { model: null, run: null, lastRun: 0 };
    if (open && tab === "arcade" && arcadeModel() && arcadeModel().change) seenChange = Math.max(seenChange, arcadeModel().change.at);
    render();
  }

  /** His start % with whose number it is: the announced eleven (XI), Futbol Fantasy, Sorare or Sofix. */
  function arcadeStart(card) {
    const node = startNode(card.start);
    const source = SOURCE[card.source];
    if (source) {
      const tag = el("b", `src${card.source === "lineup" ? " xi" : ""}`, source[0]);
      node.append(tag);
      node.title = `Chance he starts · ${source[1]}`;
    }
    return node;
  }

  function stub(lineup, { label, more, best, onOpen }) {
    const target = lineup.target || (arcadeModel() ? arcadeModel().step.target : 0);
    const item = el("li", `stub arc${best ? " best" : ""}`);
    const pct = el("div", "pct");
    pct.append(percent(lineup.p));
    pct.title = `Chance to reach ${target} pts`;
    const body = button("open", "", onOpen, `${label}: ${whenShort(lineup.first)}, ${Math.round(lineup.p * 100)}%`);
    const r1 = el("span", "r1");
    const fan = el("span", "fan");
    fan.setAttribute("aria-hidden", "true");
    for (const card of lineup.cards.slice(0, 5)) {
      const pic = img(card.pic);
      if (card.sheet === "bench" || card.sheet === "out") pic.className = "off";
      fan.append(pic);
    }
    r1.append(el("span", "name", whenShort(lineup.first)), fan);
    const r2 = el("span", "r1");
    const gauge = el("span", "gauge");
    const fill = el("b");
    fill.style.width = `${target ? Math.min(100, Math.round((lineup.x / (target * 1.15)) * 100)) : 0}%`;
    gauge.append(fill, el("i"));
    r2.append(el("span", "cond", String(lineup.x)), gauge, el("span", "say", `of ${target}`));
    body.append(r1, r2);
    const xi = lineup.cards.filter((card) => card.source === "lineup").length;
    if (lineup.play > 1 || xi) body.append(el("span", "say", [lineup.play > 1 ? `Play ${lineup.play} lineups` : "", xi ? `${xi} of ${lineup.cards.length} in announced lineups` : ""].filter(Boolean).join(" · ")));
    item.append(pct, body, el("span", "chev", more ? "›" : ""));
    return item;
  }

  function arcadeHead(m) {
    const head = el("div", "arc-head");
    head.append(el("span", "cond step", String(m.step.number)));
    const text = el("div", "who");
    text.append(el("span", "big", `Step ${m.step.number}${m.step.of ? ` of ${m.step.of}` : ""} · ${m.step.target} pts`));
    text.append(el("span", "say", [`${m.step.lives} ${m.step.lives === 1 ? "life" : "lives"} left`, m.step.reward].filter(Boolean).join(" · ")));
    const pips = el("span", "pips");
    pips.setAttribute("aria-hidden", "true");
    for (let i = 0; i < m.step.max; i++) pips.append(el("i", i < m.step.lives ? "on" : ""));
    head.append(text, pips);
    return head;
  }

  /** Where the run is: four segments that fill as it goes, in words; a stop or a failure in words with Retry. */
  function arcadeStatus() {
    const run = arcadeRunState();
    const m = arcadeModel();
    const row = el("div", "arc-status");
    row.setAttribute("role", "status");
    if (working()) {
      const at = Math.max(0, STAGE_ORDER.indexOf(run.stage));
      const meter = el("span", "meter");
      meter.setAttribute("aria-hidden", "true");
      STAGE_ORDER.forEach((_, i) => meter.append(el("i", i < at ? "done" : i === at ? "now" : "")));
      row.append(meter, el("span", "say", `${STAGE_WORDS[run.stage] || "Working"} · ${at + 1} of 4`));
      return row;
    }
    if (stoppedRun()) {
      row.className = "arc-status warn";
      row.append(el("span", "say amber", "Calculation stopped"));
    } else if (failedRun()) {
      row.className = "arc-status bad";
      row.append(el("span", "say red", failedRun().error ? failedRun().error.text : "The plan could not be worked out."));
    } else if (m) {
      row.append(el("span", "say", `Planned ${clock(m.at)}${m.state === "rough" ? " · rough" : ""}${m.sofix ? "" : " · Sorare's numbers only"}`));
    }
    const again = button("btn ghost sm", stoppedRun() || failedRun() ? "Retry" : "↻", () => runArcade(true), "Work the plan out again");
    again.style.marginLeft = "auto";
    row.append(again);
    return row;
  }

  /** The announced elevens: games out, not out yet (with when it checked), and those it could not read (with when it tries again). */
  function lineupsOut(m) {
    const out = m.lineupsOut;
    if (!out || (!out.announced.length && !out.waiting.length && !out.unread.length && !out.outdated)) return null;
    const box = el("div", "chips");
    box.setAttribute("aria-label", "Announced lineups");
    for (const name of out.announced) box.append(el("span", "chip ok", `XI · ${name}`));
    for (const name of out.waiting) box.append(el("span", "chip", `${name} · not out yet${out.checkedAt ? ` (${clock(out.checkedAt)})` : ""}`));
    for (const name of out.unread) box.append(el("span", "chip bad", `${name} · couldn't read${out.limited ? " (Sorare busy)" : ""}${out.retryAt ? ` · retry ${clock(out.retryAt)}` : ""}`));
    if (out.outdated) box.append(el("span", "chip bad", "Lineups need a newer extension: run configure"));
    return box;
  }

  function arcadeNotes() {
    const run = arcadeRunState();
    const notes = run && Array.isArray(run.notes) ? run.notes.filter((note) => !/Sorare's numbers only/.test(note)) : [];
    if (!notes.length || working()) return null;
    const box = el("div", "chips");
    for (const note of notes.slice(0, 3)) box.append(el("span", "chip warn", note));
    return box;
  }

  function arcadeSkeleton() {
    const wrap = el("div");
    wrap.setAttribute("aria-hidden", "true");
    const head = el("div", "arc-head");
    const a = el("span", "sk"); a.style.cssText = "width:18px;height:26px";
    const lines = el("div", "who");
    const l1 = el("span", "sk"); l1.style.cssText = "width:130px;height:13px";
    const l2 = el("span", "sk"); l2.style.cssText = "width:80px;height:11px";
    lines.append(l1, l2);
    head.append(a, lines);
    const ul = el("ul", "list");
    for (let i = 0; i < 2; i++) {
      const cap = el("span", "sk"); cap.style.cssText = "width:120px;height:11px;margin:6px 4px 0";
      const li = el("li", "stub arc");
      li.style.height = "52px";
      ul.append(cap, li);
    }
    wrap.append(head, ul);
    return wrap;
  }

  function arcadeList(m) {
    const nodes = [];
    const ul = el("ul", "list");
    const change = freshChange() || (m.change && Date.now() - m.change.at < 60 * 60 * 1000 ? m.change : null);
    if (change) {
      const strip = el("li", "banner vio");
      strip.append(el("span", "ico", "↻"), el("span", "", change.text), el("span", "say", clock(change.at)));
      ul.append(strip);
    }
    for (const alert of m.alerts) {
      const strip = el("li", "banner red");
      strip.setAttribute("role", "alert");
      strip.append(el("span", "ico", "!"), el("span", "", `Your step ${alert.step} lineup: ${alert.names.join(", ")} ${alert.names.length > 1 ? "are" : "is"} not starting`), el("span", "say", whenShort(alert.kickoff)));
      ul.append(strip);
    }
    // The next batch is often also the best lineup for the step: one ticket says both, and its › opens the others.
    const same = Boolean(m.next && m.best[0] && m.best[0].key === m.next.key);
    if (m.next) {
      ul.append(el("li", "caps cap", m.state === "rough" ? `Rough · best for step ${m.step.number}` : same ? `Next batch · best for step ${m.aim}` : "Next batch of players"));
      ul.append(stub(m.next, same
        ? { label: "Next batch", more: m.best.length > 1, best: true, onOpen: () => { arcadeView = "best"; render(); } }
        : { label: "Next batch", onOpen: () => { arcadeView = `next:${m.next.key}`; render(); } }));
    }
    if (m.best.length && !same) {
      ul.append(el("li", "caps cap", `Best to clear step ${m.aim}`));
      ul.append(stub(m.best[0], { label: `Best to clear step ${m.aim}`, more: m.best.length > 1, best: true, onOpen: () => { arcadeView = "best"; render(); } }));
    }
    if (!m.next && !m.best.length) ul.append(el("li", "note", EMPTY[m.state] || "No lineup can be built from your cards yet."));
    nodes.push(ul);
    if (m.clubs.length) {
      const clubs = el("div", "clubs");
      clubs.append(el("span", "caps cap", "Build around"));
      const row = el("div", "club-row");
      for (const club of m.clubs) {
        const chip = el("span", "club");
        if (club.crest) chip.append(img(club.crest, ""));
        else chip.append(el("i", "shield"));
        const text = el("span");
        text.append(el("span", "n", club.name), el("span", "say", `${club.likely} likely · ${whenShort(club.kickoff)}`));
        chip.append(text);
        chip.title = `${club.name}: ${club.likely} of your cards likely to start, about ${club.value} pts from the best three`;
        row.append(chip);
      }
      clubs.append(row);
      nodes.push(clubs);
    }
    return nodes;
  }

  function arcadeBest(m) {
    const head = el("div", "head");
    head.append(button("back", `‹ Best to clear step ${m.aim}`, () => { arcadeView = null; render(); }, "Back to Arcade"));
    const meta = el("span", "caps t3", `${m.best[0].target} pts`);
    meta.style.cssText = "margin-left:auto;font-size:11px";
    head.append(meta);
    const ul = el("ul", "list");
    m.best.forEach((lineup, i) => ul.append(stub(lineup, { label: `Lineup ${i + 1}`, best: i === 0, onOpen: () => { arcadeView = `best:${lineup.key}`; render(); } })));
    return [head, ul];
  }

  const SHEET = { bench: "Benched", out: "Not in squad" };

  function arcadeField(lineup, title, back) {
    const nodes = [];
    const head = el("div", "head");
    head.append(button("back", `‹ ${title}`, back, "Back"));
    const sum = el("span", "t3");
    sum.style.marginLeft = "auto";
    const x = el("span", "cond", String(lineup.x));
    x.style.cssText = "font-size:18px;color:var(--t1)";
    sum.append(x, document.createTextNode(` of ${lineup.target}`));
    const pct = percent(lineup.p);
    pct.style.color = "var(--vio)";
    pct.querySelector(".cond").style.fontSize = "18px";
    head.append(sum, pct);
    nodes.push(head);
    const when = el("p", "say");
    when.style.cssText = "margin:0;padding:0 12px";
    when.textContent = `${whenShort(lineup.first)}${lineup.play > 1 ? ` · play ${lineup.play} lineups in this window` : ""}`;
    nodes.push(when);
    const field = el("ul", "field arc-field");
    field.setAttribute("aria-label", `${title}: its cards`);
    for (const line of fieldLines(lineup.cards)) {
      const li = el("li", "line");
      for (const card of line) {
        const one = el("div", `card${card.sheet === "bench" || card.sheet === "out" ? " off" : ""}`);
        one.style.width = lineup.cards.length > 5 ? "58px" : "68px";
        one.append(img(card.pic, `${card.name}${card.captain ? ", captain" : ""}`));
        if (card.captain) { const c = el("span", "c", "C"); c.setAttribute("aria-hidden", "true"); one.append(c); }
        if (SHEET[card.sheet]) one.append(el("span", "ribbon", SHEET[card.sheet]));
        const nums = el("span", "nums");
        nums.append(el("span", "cond", card.points === null ? "–" : String(Math.round(card.points))), arcadeStart(card));
        one.append(nums);
        const alts = (lineup.alternatives && lineup.alternatives[card.slug]) || [];
        if (alts.length) {
          const or = el("span", "alts");
          or.setAttribute("aria-label", `Instead of ${card.name}`);
          for (const alt of alts) {
            const a = el("span", "alt");
            a.title = `${alt.name}: ${alt.points === null ? "–" : Math.round(alt.points)} pts${typeof alt.start === "number" ? `, ${core.chanceLabel(alt.start)} to start` : ""}`;
            a.append(img(alt.pic, alt.name), el("span", "cond", alt.points === null ? "–" : String(Math.round(alt.points))));
            or.append(a);
          }
          one.append(or);
        }
        li.append(one);
      }
      field.append(li);
    }
    nodes.push(field);
    return nodes;
  }

  function arcadeTab() {
    const m = arcadeModel();
    if (!m) {
      if (working()) return [arcadeStatus(), arcadeSkeleton()];
      const box = el("div", "empty");
      const run = failedRun();
      const said = el("span", run || stoppedRun() ? "say bad" : "caps t3", run && run.error ? run.error.text : stoppedRun() ? "Calculation stopped" : "Arcade isn't worked out yet");
      said.setAttribute("role", "status");
      box.append(said, button("btn vio", run || stoppedRun() ? "Retry" : "Work it out", () => runArcade(true)));
      return [box];
    }
    if (arcadeView && arcadeView.includes(":")) {
      const [kind, key] = [arcadeView.slice(0, arcadeView.indexOf(":")), arcadeView.slice(arcadeView.indexOf(":") + 1)];
      const lineup = kind === "next" ? (m.next && m.next.key === key ? m.next : null) : m.best.find((one) => one.key === key);
      if (lineup) return arcadeField(lineup, kind === "next" ? (m.state === "rough" ? "Rough lineup" : "Next batch") : `Best to clear step ${m.aim}`, () => { arcadeView = kind === "next" ? null : "best"; render(); });
      arcadeView = null;
    }
    if (arcadeView === "best" && m.best.length) return arcadeBest(m);
    arcadeView = null;
    const wrap = el("div", arcadeStale() ? "arc stale" : "arc");
    wrap.append(arcadeHead(m), arcadeStatus());
    for (const extra of [lineupsOut(m), arcadeNotes()]) if (extra) wrap.append(extra);
    wrap.append(...arcadeList(m));
    if (arcadeStale()) wrap.append(el("p", "note", `Showing the plan from ${whenShort(m.at)}.`));
    return [wrap];
  }

  function render() {
    if (!dock) return;
    const nodes = [];
    if (open) {
      const pop = el("section", "pop");
      pop.id = "sofix-dock";
      pop.setAttribute("role", "dialog");
      pop.setAttribute("aria-label", "Sofix");
      const body = el("div", "body");
      body.append(...(tab === "missions" ? missionsView() : tab === "arcade" ? arcadeTab() : lineupsView()));
      // the foot stays put under a list that scrolls
      const foot = body.querySelector(":scope > .foot");
      pop.append(tabsNode(), body);
      if (foot) pop.append(foot);
      nodes.push(pop);
    }
    nodes.push(tag());
    const focused = host && host.shadowRoot.activeElement ? host.shadowRoot.activeElement.getAttribute("aria-label") || host.shadowRoot.activeElement.textContent : null;
    dock.replaceChildren(...nodes);
    arcadeTick();
    if (focused) {
      const again = [...dock.querySelectorAll("button")].find((b) => (b.getAttribute("aria-label") || b.textContent) === focused);
      if (again) again.focus();
    }
  }

  function setOpen(next) {
    open = next;
    view = null;
    if (open) { load(); readSorare(); if (tab === "arcade") arcadeOpened(); }
    watch();
    render();
  }

  const onKey = (event) => {
    if (open && event.key === "Escape") setOpen(false);
  };

  // -- life --------------------------------------------------------------------------------------------------------

  /** The dock belongs on Sorare's football pages; Sorare navigates without reloading, so this is checked on each move. */
  function place() {
    if (!host) return;
    const here = location.pathname.startsWith("/football");
    host.hidden = !here;
    if (!here) {
      if (open) setOpen(false);
      return;
    }
    load(); // the tag says the week the page is about
  }

  function setup() {
    if (host) return;
    host = document.createElement("div");
    host.setAttribute("data-sfx-dock", "");
    const root = host.attachShadow({ mode: "open" });
    const style = document.createElement("style");
    style.textContent = STYLE;
    dock = el("aside", "dock");
    dock.setAttribute("aria-label", "Sofix dock");
    root.append(style, dock);
    document.body.append(host);
    document.addEventListener("keydown", onKey, true);
    chrome.storage.local.get("arcadeDock").then(({ arcadeDock }) => { if (arcadeDock) { arcade = arcadeDock; render(); } }, () => {});
    chrome.storage.onChanged.addListener(onArcadeStored);
    if (globalThis.navigation) globalThis.navigation.addEventListener("navigatesuccess", place);
    window.addEventListener("popstate", place);
    render();
    place();
  }

  function teardown() {
    document.removeEventListener("keydown", onKey, true);
    try { chrome.storage.onChanged.removeListener(onArcadeStored); } catch { /* the extension was reloaded */ }
    clearInterval(arcadeTimer);
    arcadeTimer = 0;
    window.removeEventListener("popstate", place);
    if (globalThis.navigation) globalThis.navigation.removeEventListener("navigatesuccess", place);
    if (host) host.remove();
    host = dock = null;
    open = false;
    clearInterval(sorareTimer);
    sorareTimer = 0;
    sorare = null;
    sorareBusy = false;
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
