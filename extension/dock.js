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
      --t1: #f2f4f2; --t2: #b3b9b4; --t3: #8b928d; --ivory: #ebe3cf; --sky: #79c3ff; --amber: #f2cf3c; --red: #ff8a80;
      --ease: cubic-bezier(.3, .7, .2, 1);
      position: fixed; right: 16px; bottom: 16px; z-index: 2147483000; display: flex; flex-direction: column; align-items: flex-end; gap: 8px;
      font: 500 12px/1.3 Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; color: var(--t1); -webkit-font-smoothing: antialiased;
    }
    .cond { font-family: "Barlow Condensed", "Arial Narrow", -apple-system, sans-serif; font-weight: 700; font-variant-numeric: tabular-nums; }
    .caps { font-family: "Barlow Condensed", "Arial Narrow", -apple-system, sans-serif; font-weight: 600; text-transform: uppercase; letter-spacing: .09em; }
    .t2 { color: var(--t2); } .t3 { color: var(--t3); }

    .tag { display: inline-flex; align-items: center; gap: 6px; height: 22px; padding: 0 8px 0 7px; border-radius: 6px; white-space: nowrap; font-size: 11px; color: var(--t3);
      background: rgba(18, 20, 19, .72); backdrop-filter: blur(10px); -webkit-backdrop-filter: blur(10px); box-shadow: inset 0 0 0 1px var(--rule); }
    .tag .cond { font-size: 13px; line-height: 1; color: var(--t1); }
    .tag[aria-expanded="true"] { background: var(--bg); }
    .glyph { position: relative; width: 9px; height: 9px; flex: none; }
    .glyph::before, .glyph::after { content: ""; position: absolute; left: 0; right: 0; height: 4px; border-radius: 1px; background: var(--t2); }
    .glyph::before { top: 0; } .glyph::after { bottom: 0; opacity: .45; }

    .pop { width: 316px; max-height: calc(100vh - 80px); display: flex; flex-direction: column; border-radius: 14px; background: var(--bg); overflow: hidden;
      box-shadow: inset 0 0 0 1px var(--rule), 0 24px 60px rgba(0, 0, 0, .65); transform-origin: bottom right; animation: pop .24s var(--ease) both; }
    .tabs { display: flex; align-items: stretch; height: 38px; padding: 0 12px; gap: 16px; border-bottom: 1px solid var(--rule); flex: none; }
    .tabs button { position: relative; display: flex; align-items: center; gap: 5px; font-size: 12px; color: var(--t3); }
    .tabs button b { font-family: "Barlow Condensed", sans-serif; font-weight: 700; font-size: 13px; color: var(--t2); letter-spacing: 0; }
    .tabs button[aria-selected="true"] { color: var(--t1); }
    .tabs button[aria-selected="true"]::after { content: ""; position: absolute; left: 0; right: 0; bottom: -1px; height: 2px; border-radius: 1px; background: var(--acc, var(--ivory)); }
    .tabs .lock { margin-left: auto; display: flex; align-items: center; font-size: 11px; color: var(--t3); }
    .tabs .lock.soon { color: var(--amber); }
    .body { overflow-y: auto; }
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
    @keyframes pop { from { opacity: 0; transform: translateY(8px) scale(.98); } }
    @keyframes shimmer { from { background-position: -200px 0; } to { background-position: 200px 0; } }
    @keyframes slide { from { transform: translateX(-100%); } to { transform: translateX(260%); } }
    @media (max-width: 900px) { .dock { display: none; } }
    @media (prefers-reduced-motion: reduce) { .pop, .sk, .progress b { animation: none; } .punch i { transition: none; } }
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
    const today = missions();
    for (const [key, label, count] of [["lineups", "Lineups", rows().length], ["missions", "Missions", today && today.status === "today" ? today.missions.length : 0]]) {
      const one = button("caps", label, () => { tab = key; view = null; render(); });
      one.setAttribute("role", "tab");
      one.setAttribute("aria-selected", String(tab === key));
      if (count) one.append(el("b", "", String(count)));
      node.append(one);
    }
    const plan = ready();
    if (plan) {
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

  function render() {
    if (!dock) return;
    const nodes = [];
    if (open) {
      const pop = el("section", "pop");
      pop.id = "sofix-dock";
      pop.setAttribute("role", "dialog");
      pop.setAttribute("aria-label", "Sofix");
      const body = el("div", "body");
      body.append(...(tab === "missions" ? missionsView() : lineupsView()));
      // the foot stays put under a list that scrolls
      const foot = body.querySelector(":scope > .foot");
      pop.append(tabsNode(), body);
      if (foot) pop.append(foot);
      nodes.push(pop);
    }
    nodes.push(tag());
    const focused = host && host.shadowRoot.activeElement ? host.shadowRoot.activeElement.getAttribute("aria-label") || host.shadowRoot.activeElement.textContent : null;
    dock.replaceChildren(...nodes);
    if (focused) {
      const again = [...dock.querySelectorAll("button")].find((b) => (b.getAttribute("aria-label") || b.textContent) === focused);
      if (again) again.focus();
    }
  }

  function setOpen(next) {
    open = next;
    view = null;
    if (open) { load(); readSorare(); }
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
    if (globalThis.navigation) globalThis.navigation.addEventListener("navigatesuccess", place);
    window.addEventListener("popstate", place);
    render();
    place();
  }

  function teardown() {
    document.removeEventListener("keydown", onKey, true);
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
