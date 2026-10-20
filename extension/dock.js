// Sofix extension, the dock on sorare.com (plans/overlay.md, O15; design: the "A′ · Small dock" boards of the overlay canvas).
// A pill in the corner says the gameweek and when it locks; pressed, it opens a small panel above it with two tabs:
//   Lineups  the best plan's lineups, likeliest to pay first; one opens to its cards, Enter and Guide me.
//   Missions today's missions, your picks against Sofix's, and the swap Sofix would make.
// Enter runs Apply's three steps from here (Check, then Draft, then Enter), one press each, in this tab's own session. Nothing is
// chained and nothing runs by itself. Guide me lights the next card to pick on Sorare's own page (overlay.js draws the ring).
//
// It lives in a shadow root, so Sorare's styles cannot reach it and its own cannot leak out, and it is switched by the same popup
// switch as the tiles ("Scores on sorare.com").
(() => {
  if (globalThis.__sofixDock === 1) return;
  const core = globalThis.__sofixCore;
  if (!core) return;
  globalThis.__sofixDock = 1;

  const STALE_MS = 2 * 60 * 1000; // opened again within two minutes: what was drawn is still right
  const STYLE = `
    :host { all: initial; }
    * { box-sizing: border-box; }
    button { font: inherit; color: inherit; cursor: pointer; border: 0; background: none; padding: 0; }
    button:disabled { cursor: default; opacity: .55; }
    button:focus-visible, a:focus-visible { outline: 2px solid var(--mint); outline-offset: 2px; }
    .dock {
      --panel: #161618; --row: #1c1c1f; --row-2: #222226; --line: #2a2a2e; --t1: #fff; --t2: #b4b4bc; --t3: #8e8e96;
      --mint: #5cc58d; --mint-deep: #1f7a4f; --mint-ink: #05130c; --warn: #f0ce1d; --bad: #ff8a8a;
      --ease: cubic-bezier(.3, .7, .2, 1);
      position: fixed; right: 20px; bottom: 20px; z-index: 2147483000; display: flex; flex-direction: column; align-items: flex-end; gap: 12px;
      font: 13px/1.35 -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", sans-serif; color: var(--t1);
      -webkit-font-smoothing: antialiased;
    }
    .num { font-variant-numeric: tabular-nums; font-family: "Barlow Condensed", "Arial Narrow", -apple-system, sans-serif; font-weight: 700; }
    .mark { display: block; width: 15px; height: 15px; border-radius: 5px; background: linear-gradient(135deg, var(--mint-deep), var(--mint)); flex: none; }
    .pill {
      display: flex; align-items: center; gap: 10px; height: 44px; padding: 0 6px 0 14px; border-radius: 999px; white-space: nowrap;
      background: rgba(22, 22, 24, .86); backdrop-filter: blur(18px); -webkit-backdrop-filter: blur(18px);
      box-shadow: 0 16px 44px rgba(0, 0, 0, .55), inset 0 0 0 1px rgba(255, 255, 255, .09); font-weight: 700;
    }
    .pill.soon { box-shadow: 0 16px 44px rgba(0, 0, 0, .55), inset 0 0 0 1px rgba(240, 206, 29, .6); }
    .pill.alarm { box-shadow: 0 16px 44px rgba(0, 0, 0, .55), inset 0 0 0 1px rgba(255, 90, 90, .7); }
    .pill .live { font-size: 20px; line-height: 1; }
    .badge.bad { background: #ff5a5a; color: #fff; }
    .row.alarm { background: linear-gradient(90deg, rgba(255, 90, 90, .12), var(--row) 70%); box-shadow: inset 0 0 0 1px rgba(255, 90, 90, .45); }
    .pill .when { font-size: 12px; color: var(--t2); font-weight: 600; }
    .pill.soon .when { color: var(--warn); }
    .badge { display: inline-grid; place-items: center; min-width: 22px; height: 22px; padding: 0 6px; border-radius: 11px; background: var(--warn); color: #0e0e0e; font-size: 11px; font-weight: 800; }
    .round { width: 32px; height: 32px; border-radius: 50%; display: grid; place-items: center; background: #26262a; font-size: 14px; font-weight: 800; flex: none; }
    .round.go { background: linear-gradient(135deg, var(--mint-deep), var(--mint)); color: var(--mint-ink); }
    .guide { height: 56px; padding: 0 8px; gap: 12px; }
    .guide img { width: 30px; border-radius: 4px; display: block; }
    .guide .what { display: flex; flex-direction: column; gap: 5px; font-size: 13px; }
    .dots { display: flex; gap: 4px; align-items: center; }
    .dots i { width: 14px; height: 5px; border-radius: 3px; background: #2e2e33; }
    .dots i.done { background: var(--mint); }
    .dots i.now { background: #f4f4f6; }
    .pop {
      width: 400px; max-width: calc(100vw - 40px); max-height: calc(100vh - 100px); overflow-y: auto; padding: 14px; border-radius: 20px;
      display: flex; flex-direction: column; gap: 12px; background: var(--panel);
      box-shadow: 0 24px 70px rgba(0, 0, 0, .65), inset 0 0 0 1px rgba(255, 255, 255, .06);
      transform-origin: bottom right; animation: pop .28s var(--ease) both;
    }
    .head { display: flex; align-items: center; gap: 8px; }
    .chip { display: inline-flex; align-items: center; gap: 6px; height: 24px; padding: 0 9px; border-radius: 999px; background: #222226; font-size: 11px; font-weight: 700; color: var(--t2); white-space: nowrap; }
    .chip.mint { background: rgba(92, 197, 141, .14); color: #8fe3b4; }
    .chip.warn { background: rgba(240, 206, 29, .14); color: var(--warn); }
    .chip.bad { background: rgba(255, 90, 90, .14); color: var(--bad); }
    .tabs { display: inline-flex; margin-left: auto; padding: 3px; border-radius: 10px; background: #1e1e21; gap: 2px; }
    .tabs button { display: inline-flex; align-items: center; gap: 5px; padding: 5px 10px; border-radius: 8px; font-size: 12px; font-weight: 700; color: var(--t2); }
    .tabs button[aria-selected="true"] { background: #f4f4f6; color: #0e0e0e; }
    .tabs i { width: 6px; height: 6px; border-radius: 50%; background: var(--warn); }
    .hero { display: flex; align-items: flex-end; justify-content: space-between; gap: 10px; }
    .hero b { font-size: 52px; line-height: .9; letter-spacing: -.02em; }
    .hero .unit { font-size: 30px; color: var(--t2); margin-left: -4px; }
    .hero .says { font-size: 12px; font-weight: 600; color: var(--t2); }
    .hero .side { font-size: 11px; font-weight: 600; color: var(--t3); margin-bottom: 6px; text-align: right; }
    .list { display: flex; flex-direction: column; gap: 4px; margin: 0; padding: 0; list-style: none; }
    .row { border-radius: 12px; background: var(--row); }
    .row.best { background: linear-gradient(90deg, rgba(92, 197, 141, .14), var(--row) 70%); box-shadow: inset 0 0 0 1px rgba(92, 197, 141, .4); }
    .row.warn { background: linear-gradient(90deg, rgba(240, 206, 29, .12), var(--row) 70%); box-shadow: inset 0 0 0 1px rgba(240, 206, 29, .45); }
    .row.open { background: var(--row-2); }
    .line { width: 100%; display: grid; grid-template-columns: 52px minmax(0, 1fr) auto 24px; gap: 10px; align-items: center; padding: 6px 8px; text-align: left; border-radius: 12px; }
    .fan { display: flex; }
    .fan img { width: 22px; border-radius: 3px; box-shadow: -2px 2px 5px rgba(0, 0, 0, .6); display: block; }
    .fan img + img { margin-left: -7px; }
    .name { font-size: 13px; font-weight: 700; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .sub { font-size: 11px; font-weight: 600; color: var(--t3); margin-top: 2px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .sub .num { font-size: 15px; color: var(--t1); }
    .chev { color: var(--t2); font-size: 14px; font-weight: 800; transition: transform .2s var(--ease); text-align: center; }
    .row.open .chev { transform: rotate(90deg); }
    .more { padding: 2px 8px 10px; display: flex; flex-direction: column; gap: 10px; }
    .cards { display: grid; grid-template-columns: repeat(7, minmax(0, 1fr)); gap: 6px; margin: 0; padding: 0; list-style: none; }
    .cards li { position: relative; display: flex; flex-direction: column; align-items: center; gap: 4px; }
    .cards img { width: 100%; aspect-ratio: 770 / 1246; object-fit: cover; border-radius: 5px; display: block; background: #000; }
    .hex { display: inline-grid; place-items: center; min-width: 26px; height: 18px; padding: 0 5px; border-radius: 5px; color: #0e0e0e; font-size: 13px; }
    .cap { position: absolute; right: -3px; top: -4px; width: 15px; height: 15px; border-radius: 50%; display: grid; place-items: center; background: var(--mint); color: var(--mint-ink); font-size: 11px; font-weight: 800; }
    .two { display: grid; grid-template-columns: 1fr 1fr; gap: 6px; }
    .btn { display: inline-flex; align-items: center; justify-content: center; gap: 8px; height: 40px; padding: 0 16px; border-radius: 11px; font-size: 13px; font-weight: 700; white-space: nowrap; }
    .btn.sm { height: 32px; padding: 0 12px; border-radius: 9px; font-size: 12px; }
    .btn.go { background: linear-gradient(135deg, var(--mint-deep), var(--mint)); color: var(--mint-ink); box-shadow: 0 6px 18px rgba(92, 197, 141, .28); }
    .btn.warn { background: var(--warn); color: #0e0e0e; }
    .btn.ghost { background: #1e1e21; box-shadow: inset 0 0 0 1px var(--line); }
    .foot { display: flex; align-items: center; gap: 8px; }
    .foot .btn { flex: 1; }
    .icon { width: 40px; height: 40px; flex: none; border-radius: 11px; display: grid; place-items: center; background: #1e1e21; box-shadow: inset 0 0 0 1px var(--line); color: var(--t2); font-size: 16px; font-weight: 800; }
    .note { margin: 0; font-size: 11px; font-weight: 600; color: var(--t3); }
    .note.bad { color: var(--bad); }
    .steps { display: flex; gap: 10px; justify-content: center; font-size: 11px; font-weight: 700; color: var(--t3); }
    .steps .on { color: var(--t1); }
    .steps .done { color: #8fe3b4; }
    .menu { display: flex; flex-direction: column; gap: 8px; padding: 10px 12px; border-radius: 12px; background: var(--row); font-size: 12px; color: var(--t2); }
    .menu .kv { display: flex; justify-content: space-between; }
    .menu .kv b { color: var(--t1); }
    .menu a { color: #8fe3b4; font-weight: 700; text-decoration: none; }
    .swap { display: grid; grid-template-columns: 30px auto 14px 30px minmax(0, 1fr) auto; gap: 8px; align-items: center; padding: 8px; margin: 0 8px 8px; border-radius: 10px; background: rgba(240, 206, 29, .1); }
    .swap img { width: 30px; border-radius: 4px; display: block; }
    .swap.bad { background: rgba(255, 90, 90, .1); }
    .swap .was { filter: grayscale(.7); opacity: .7; }
    .pc { font-size: 17px; }
    .say { margin: 0; font-size: 14px; font-weight: 600; }
    .in { animation: rise .4s var(--ease) both; }
    @keyframes rise { from { opacity: 0; transform: translateY(6px); } }
    @keyframes pop { from { opacity: 0; transform: translateY(8px) scale(.98); } }
    @media (max-width: 900px) { .dock { display: none; } }
    @media (prefers-reduced-motion: reduce) { .pop, .in { animation: none; } .chev { transition: none; } }
  `;

  let host = null;
  let dock = null;
  let open = false;
  let tab = "lineups";
  let openRow = -1;
  let menu = false;
  let data = null; // { state, plan, missions }
  let loadedAt = 0;
  let loadedFor = "";
  let loading = false;
  let busy = false;
  let live = null; // after the lock: { at, total, lineups, byBoard } from core.liveScores, or null (nothing read, or a read that failed)
  let liveFor = ""; // the gameweek `live` is about
  let liveBusy = false;
  let liveTimer = 0;
  let guide = null; // { title, steps: [{ card?, player?, role, text, pic }], at }
  const applied = new Map(); // board slug -> { stage 0 check, 1 draft, 2 enter, 3 entered; lineupId; note; failed }

  function el(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  }

  function img(src, className, alt = "") {
    const node = el("img", className);
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
  const pct = (p) => (typeof p === "number" ? core.chanceLabel(p) : "No estimate");

  function hex(score) {
    const node = el("span", "hex num", String(score));
    const level = core.scoreLevel(score);
    node.style.background = level ? core.SCORE_FALLBACK[level] : "#3a3a40";
    return node;
  }

  function fan(pics) {
    const node = el("span", "fan");
    node.setAttribute("aria-hidden", "true");
    for (const pic of pics.slice(0, 3)) node.append(img(pic));
    return node;
  }

  // -- data --------------------------------------------------------------------------------------------------------

  /** The gameweek the page's address names ("" when it names none): the plan shown is that week's, as the tiles are. */
  const weekHere = () => core.fixtureOf(location.href) || "";

  async function load(force = false) {
    const week = weekHere();
    if (loading || (!force && loadedAt && loadedFor === week && Date.now() - loadedAt < STALE_MS)) return;
    loading = true;
    const answer = await send({ type: "overlay-plan", missions: true, ...(week ? { fixture: week } : {}) });
    loading = false;
    if (week !== weekHere()) return load(); // the page moved to another gameweek while this was out
    if (answer && answer.state === "ok") {
      if (data?.plan?.week !== answer.plan?.week) applied.clear();
      loadedAt = Date.now();
      loadedFor = week;
    }
    data = answer || { state: "unreachable" };
    render();
    loadLive();
  }

  const ready = () => data && data.state === "ok" && data.plan && data.plan.state === "ready" ? data.plan : null;
  const rows = () => (ready() && Array.isArray(ready().rows) ? ready().rows : []);
  const missions = () => (data && data.missions && Array.isArray(data.missions.missions) ? data.missions : null);

  // -- after the lock: what your lineups have scored ---------------------------------------------------------------

  const locked = () => Boolean(ready() && core.lockLabel(ready().lock).text === "Locked");
  /** The starters at risk across the plan's lineups: the alarm. None once the gameweek is locked, since nothing can be changed then. */
  const alarmCount = () => (locked() ? 0 : rows().reduce((sum, row) => sum + (Array.isArray(row.alarms) ? row.alarms.length : 0), 0));

  /** Reads your entered lineups' scores from Sorare through this tab (read only), at most every two minutes, and only after the lock. */
  async function loadLive(force = false) {
    const plan = ready();
    if (!plan || !plan.fixture || !locked() || liveBusy) return;
    if (!force && live && liveFor === plan.fixture && Date.now() - live.at < STALE_MS) return;
    liveBusy = true;
    const answer = await send({ type: "dock-step", step: "week-entered", slug: plan.fixture });
    liveBusy = false;
    const scores = core.liveScores(answer);
    if (scores && ready() && ready().fixture === plan.fixture) {
      live = { at: Date.now(), ...scores };
      liveFor = plan.fixture;
      render();
    }
  }

  const liveHere = () => (live && ready() && liveFor === ready().fixture && locked() ? live : null);

  // -- while you build a lineup on Sorare's own page ------------------------------------------------------------------

  let compose = null; // { n, total } the cards in the lineup page's slots and their scores added up, or null off that page
  let composeWatch = null;
  let composeTimer = 0;

  /** The lineup page's slot buttons, read as they are: nothing is asked of Sorare or of the app, and nothing is written. */
  function readCompose() {
    composeTimer = 0;
    let next = null;
    if (core.composeBoard(location.pathname)) {
      const items = [...document.querySelectorAll('button[aria-label^="Select "]')].map((slot) => {
        const said = (slot.querySelector(".sfx-score") || {}).textContent;
        return { label: (slot.getAttribute("aria-label") || "").slice(7), width: slot.getBoundingClientRect().width, score: said ? Number(said) : NaN };
      });
      next = core.composeSum(items);
    }
    if ((next && next.n) === (compose && compose.n) && (next && next.total) === (compose && compose.total)) return;
    compose = next && next.n ? next : null;
    render();
  }

  const scheduleCompose = () => {
    if (!composeTimer) composeTimer = setTimeout(readCompose, 300);
  };

  /** What the plan has in the same competition, its starters' scores added up the same way (cards alone, no captain): the like-for-like figure. */
  function planSum() {
    const board = core.composeBoard(location.pathname);
    const row = board ? rows().find((one) => one.board === board) : null;
    if (!row) return null;
    const starters = row.cards.filter((card) => !card.sub);
    return { size: starters.length, total: starters.reduce((sum, card) => sum + card.s, 0) };
  }

  /** While the panel is open after the lock, the scores are read again every two minutes; closed, they are read when the page opens. */
  function watchLive() {
    clearInterval(liveTimer);
    liveTimer = 0;
    if (open && locked()) liveTimer = setInterval(() => loadLive(true), STALE_MS);
  }

  // -- Apply, from here --------------------------------------------------------------------------------------------

  const stateOf = (row) => applied.get(row.board) || { stage: 0 };
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

  /** One press for these lineups: each moves one step, the step it is at. A lineup that fails stops there and says why. */
  async function press(targets) {
    if (busy) return;
    busy = true;
    render();
    const plan = ready();
    for (const row of targets) {
      const now = stateOf(row);
      if (now.failed || now.stage >= 3) continue;
      if (now.stage === 0) {
        const held = await step("entered", { slug: row.board });
        if (held.state === "ok" && core.alreadyEntered(held.entered, row.appearances.map((a) => a.cardSlug))) {
          applied.set(row.board, { stage: 3, note: "Already entered" });
          continue;
        }
        const checked = await step("check", { slug: row.board, appearances: row.appearances });
        if (checked.state === "ok" && !checked.broken.length) applied.set(row.board, { stage: 1, note: "Checked" });
        else applied.set(row.board, { stage: 0, failed: true, note: checked.state === "ok" ? checked.broken[0] : checked.state === "rejected" ? checked.errors[0] || "Sorare refused it." : CANNOT[checked.state] });
      } else if (now.stage === 1) {
        const saved = await step("draft", { boardId: row.boardId, appearances: row.appearances, name: `Sofix · plan 1 · GW${plan ? plan.week : ""}` });
        if (saved.state === "ok" && saved.lineupId) applied.set(row.board, { stage: 2, lineupId: saved.lineupId, note: "Draft saved" });
        else applied.set(row.board, { stage: 1, failed: true, note: saved.state === "rejected" ? saved.errors[0] || "Sorare refused it." : CANNOT[saved.state] || CANNOT.error });
      } else if (now.stage === 2) {
        const entered = await step("enter", { lineupIds: [now.lineupId] });
        if (entered.state === "ok") applied.set(row.board, { stage: 3, note: "Entered" });
        else applied.set(row.board, { ...now, failed: true, note: entered.state === "rejected" ? entered.errors[0] || "Sorare refused it." : CANNOT[entered.state] || CANNOT.error });
      }
      render();
    }
    busy = false;
    render();
  }

  /** What the next press does for these lineups, and how many it moves. */
  function nextPress(targets) {
    const moving = targets.filter((row) => !stateOf(row).failed && stateOf(row).stage < 3);
    if (!moving.length) return null;
    const stage = Math.min(...moving.map((row) => stateOf(row).stage));
    return { stage, count: moving.filter((row) => stateOf(row).stage === stage).length };
  }

  function pressLabel(next, all) {
    const n = next.count;
    if (next.stage === 0) return all ? `Enter all ${n}` : "Enter";
    if (next.stage === 1) return n === 1 ? "Save as a draft" : `Save ${n} drafts`;
    return n === 1 ? "Enter it now" : `Enter ${n} now`;
  }

  function stepsNode(stage) {
    const node = el("p", "steps");
    ["1 Check", "2 Draft", "3 Enter"].forEach((label, i) => node.append(el("span", i < stage ? "done" : i === stage ? "on" : "", label)));
    return node;
  }

  // -- Guide me ----------------------------------------------------------------------------------------------------

  /** Shares the card to pick (or to take out) with overlay.js, which rings it on Sorare's page and calls back when it is pressed. */
  function publish() {
    const now = guide && guide.steps[guide.at];
    globalThis.__sofixGuide = now ? { card: now.card || null, player: now.player || null, role: now.role, advance: () => advance(1) } : null;
    window.dispatchEvent(new Event("sofix-guide"));
    try {
      if (guide) sessionStorage.setItem("sofix-guide", JSON.stringify({ ...guide }));
      else sessionStorage.removeItem("sofix-guide");
    } catch {
      // a private window: the guide simply does not survive a reload
    }
  }

  function advance(by) {
    if (!guide) return;
    guide.at += by;
    if (guide.at >= guide.steps.length) guide = null;
    publish();
    render();
  }

  function startGuide(title, steps) {
    guide = { title, steps, at: 0 };
    open = false;
    publish();
    render();
  }

  function guideLineup(row) {
    startGuide(row.comp, row.cards.map((card) => ({
      card: card.slug,
      role: "pick",
      pic: card.pic,
      text: `Pick ${card.name} · ${card.captain ? "captain" : card.slot}`,
    })));
  }

  function guideSwap(mission, swap) {
    const rarity = (missions() && missions().rarity) || "limited";
    startGuide(mission.title, [
      { player: swap.out.slug, role: "out", pic: swap.out.pic, text: `Take out ${swap.out.name}` },
      { player: swap.in.slug, role: "pick", pic: swap.in.pic, text: `Pick ${swap.in.name}` },
    ]);
    if (core.missionsRarity(location.pathname) !== rarity) location.assign(`/football/missions/play/${rarity}`);
  }

  // -- drawing -----------------------------------------------------------------------------------------------------

  function pill() {
    if (guide) {
      const now = guide.steps[guide.at];
      const node = el("div", "pill guide in");
      node.setAttribute("role", "status");
      const what = el("div", "what");
      what.append(el("span", "", now.text));
      const meta = el("span", "dots");
      meta.setAttribute("aria-label", `${guide.at + 1} of ${guide.steps.length}`);
      guide.steps.forEach((_, i) => meta.append(el("i", i < guide.at ? "done" : i === guide.at ? "now" : "")));
      const where = el("span", "", `${guide.title} · ${guide.at + 1} of ${guide.steps.length}`);
      where.style.cssText = "margin-left:6px;font-size:11px;color:#8e8e96;font-weight:600";
      meta.append(where);
      what.append(meta);
      node.append(img(now.pic, "", ""), what, button("btn ghost sm", "Skip", () => advance(1)), button("round", "✕", () => { guide = null; publish(); render(); }, "Stop guiding"));
      return node;
    }
    const plan = data && data.plan;
    const lock = core.lockLabel(plan && plan.lock);
    const alarms = alarmCount();
    const scored = liveHere();
    const node = el("div", alarms ? "pill alarm" : lock.soon ? "pill soon" : "pill");
    node.append(el("i", "mark"), el("span", "", plan && plan.week ? `GW${plan.week}` : "Sofix"));
    const building = compose && !guide ? compose : null;
    if (building) {
      const plan1 = planSum();
      const gap = plan1 ? Math.round(building.total - plan1.total) : null;
      const sum = el("span", "live num", String(Math.round(building.total)));
      const said = `${Math.round(building.total)} points expected from ${building.n} card${building.n === 1 ? "" : "s"}, captain not counted${plan1 ? `; Sofix's plan has ${Math.round(plan1.total)} in this competition` : ""}`;
      sum.setAttribute("aria-label", said);
      node.append(sum);
      if (plan1) {
        // a lineup still being filled is not compared: three cards would always trail the plan's five
        const whole = building.n >= plan1.size;
        const tag = el("span", !whole ? "chip" : gap >= 0 ? "chip mint" : "chip warn", !whole ? `${building.n} of ${plan1.size}` : `${gap > 0 ? "+" : gap < 0 ? "−" : "±"}${Math.abs(gap)} vs plan`);
        tag.title = said;
        node.append(tag);
      }
    } else if (scored && scored.lineups) {
      const total = el("span", "live num", String(scored.total));
      total.setAttribute("aria-label", `${scored.total} points so far in ${scored.lineups} entered lineup${scored.lineups === 1 ? "" : "s"}`);
      node.append(total);
    } else if (lock.text) node.append(el("span", "when", lock.text));
    if (alarms) {
      const bad = el("span", "badge bad", String(alarms));
      bad.setAttribute("aria-label", `${alarms} starter${alarms === 1 ? "" : "s"} unlikely to start`);
      node.append(bad);
    }
    const swaps = core.swapCount(missions());
    if (!open && swaps) {
      const badge = el("span", "badge", String(swaps));
      badge.setAttribute("aria-label", `${swaps} mission swap${swaps === 1 ? "" : "s"} to make`);
      node.append(badge);
    }
    const toggle = button(open ? "round" : lock.soon ? "round go" : "round", open ? "✕" : "›", () => setOpen(!open), open ? "Close Sofix" : "Open Sofix");
    toggle.setAttribute("aria-expanded", String(open));
    toggle.setAttribute("aria-controls", "sofix-dock");
    node.append(toggle);
    return node;
  }

  function head() {
    const plan = data && data.plan;
    const node = el("div", "head");
    node.append(el("i", "mark"), el("b", "", tab === "missions" ? "Missions" : plan && plan.week ? `GW${plan.week}` : "Sofix"));
    const lock = core.lockLabel(plan && plan.lock);
    if (tab === "lineups" && lock.text) node.append(el("span", lock.soon ? "chip warn" : "chip", lock.text));
    const tabs = el("div", "tabs");
    tabs.setAttribute("role", "tablist");
    for (const [key, label] of [["lineups", "Lineups"], ["missions", "Missions"]]) {
      const one = button("", label, () => { tab = key; openRow = -1; menu = false; render(); });
      one.setAttribute("role", "tab");
      one.setAttribute("aria-selected", String(tab === key));
      if (key === "missions" && core.swapCount(missions())) one.append(el("i"));
      tabs.append(one);
    }
    node.append(tabs);
    return node;
  }

  function hero(big, unit, says, side, colour) {
    const node = el("div", "hero");
    const left = el("div");
    left.style.cssText = "display:flex;align-items:baseline;gap:8px";
    const number = el("b", "num", big);
    if (colour) number.style.color = colour;
    left.append(number);
    if (unit) left.append(el("span", "unit num", unit));
    left.append(el("span", "says", says));
    node.append(left);
    if (side) node.append(el("span", "side", side));
    return node;
  }

  /** A starter unlikely to start, and the player of yours Sofix would put in (the app decides; this only draws it and offers Guide me). */
  function alarmNode(row, alarm) {
    const box = el("div", "swap bad in");
    const why = alarm.out.why || (typeof alarm.out.pStart === "number" ? `${Math.round(alarm.out.pStart * 100)}% to start` : "unlikely to start");
    if (!alarm.in) {
      const note = el("p", "note bad", `${alarm.out.name}: ${why}. None of your other players in his position is likely enough to start.`);
      note.style.gridColumn = "1 / -1";
      box.style.display = "block";
      box.append(note);
      return box;
    }
    box.append(img(alarm.out.pic, "was", `${alarm.out.name}, ${why}`), el("span", "pc num", typeof alarm.out.pStart === "number" ? `${Math.round(alarm.out.pStart * 100)}%` : "–"), el("span", "note", "→"), img(alarm.in.pic, "", alarm.in.name));
    const who = el("div");
    who.style.minWidth = "0";
    const chance = el("span", "pc num", `${Math.round(alarm.in.pStart * 100)}% · ${alarm.in.s}`);
    chance.style.color = "#8fe3b4";
    who.append(el("div", "name", alarm.in.name), chance);
    box.append(who, button("btn warn sm", "Swap", () => guideAlarm(row, alarm), `Swap ${alarm.out.name} for ${alarm.in.name} in ${row.comp}`));
    return box;
  }

  /** A Pro lineup rebuilt on the announced elevens (Play's "Load from Sorare"): the swaps, and Guide me through its five cards. */
  function rebuiltNode(row) {
    const box = el("div", "menu in");
    const at = new Date(row.rebuilt.at).toLocaleTimeString("en-GB", { timeZone: "Europe/Madrid", hour: "2-digit", minute: "2-digit" });
    const swaps = row.rebuilt.swaps.map((s) => `${s.out} ${s.why} → ${s.in}`).join(" · ") || "Same five: they all start.";
    box.append(el("b", "", `Rebuilt at ${at} on the elevens`), el("span", "", swaps),
      button("btn go sm", "Guide me · rebuilt", () => guideLineup({ comp: `${row.comp} · rebuilt`, cards: row.rebuilt.cards }), `Guide me through ${row.comp} rebuilt on the announced elevens`));
    return box;
  }

  function guideAlarm(row, alarm) {
    startGuide(row.comp, [
      { card: alarm.out.slug, role: "out", pic: alarm.out.pic, text: `Take out ${alarm.out.name}` },
      { player: alarm.in.slug, role: "pick", pic: alarm.in.pic, text: `Pick ${alarm.in.name}` },
    ]);
  }

  function lineupRow(row, index, best) {
    const state = stateOf(row);
    const alarms = locked() ? [] : Array.isArray(row.alarms) ? row.alarms : [];
    const scored = liveHere();
    const soFar = scored && typeof scored.byBoard[row.board] === "number" ? scored.byBoard[row.board] : null;
    const item = el("li", `row${alarms.length ? " alarm" : best ? " best" : ""}${openRow === index ? " open" : ""}`);
    const line = button("line", "", () => { openRow = openRow === index ? -1 : index; render(); });
    line.setAttribute("aria-expanded", String(openRow === index));
    const text = el("div");
    text.style.minWidth = "0";
    const sub = el("div", "sub");
    if (soFar !== null) sub.append(el("span", "num", String(Math.round(soFar))), document.createTextNode(row.need ? ` of ${row.need} · so far` : " so far"), document.createTextNode(` · expected ${row.x}`));
    else sub.append(el("span", "num", String(row.x)), document.createTextNode(row.need ? ` of ${row.need}` : " expected"), document.createTextNode(row.when ? ` · ${row.when}` : ""));
    text.append(el("div", "name", row.comp), sub);
    const chip = soFar !== null && row.need ? (soFar >= row.need ? el("span", "chip mint", "Reached") : el("span", "chip", `${Math.ceil(row.need - soFar)} to go`))
      : alarms.length ? el("span", "chip bad", `${alarms.length} at risk`)
        : state.failed ? el("span", "chip bad", "Stopped") : state.stage === 3 ? el("span", "chip mint", "Entered") : state.stage > 0 ? el("span", "chip warn", state.note) : el("span", best ? "chip mint" : "chip", core.chanceLabel(row.p));
    line.append(fan(row.cards.filter((card) => !card.sub).map((card) => card.pic)), text, chip, el("span", "chev", "›"));
    item.append(line);
    if (openRow === index) {
      const more = el("div", "more in");
      const cards = el("ul", "cards");
      cards.setAttribute("aria-label", `${row.comp}: its cards and what each is expected to score`);
      for (const card of row.cards) {
        const li = el("li");
        li.append(img(card.pic, "", `${card.name}${card.captain ? ", captain" : ""}${card.sub ? ", substitute" : ""}`), hex(card.s));
        if (card.captain) li.append(el("span", "cap", "C"));
        cards.append(li);
      }
      more.append(cards);
      for (const alarm of alarms) more.append(alarmNode(row, alarm));
      if (row.rebuilt && !locked()) more.append(rebuiltNode(row));
      if (state.note && (state.failed || state.stage > 0)) more.append(el("p", state.failed ? "note bad" : "note", state.note));
      const next = nextPress([row]);
      const two = el("div", "two");
      if (next) two.append(button(next.stage === 2 ? "btn warn sm" : "btn go sm", busy ? "Asking Sorare…" : pressLabel(next, false), () => press([row])));
      else two.append(button("btn ghost sm", state.failed ? "Try again" : "Entered", () => { applied.delete(row.board); render(); }));
      two.firstChild.disabled = busy;
      two.append(button("btn ghost sm", "Guide me", () => guideLineup(row)));
      more.append(two);
      if (next && next.stage > 0) more.append(stepsNode(next.stage));
      item.append(more);
    }
    return item;
  }

  function lineupsView() {
    const plan = ready();
    if (!plan) {
      const why = !data ? "Loading your gameweek…"
        : data.state === "auth" ? "Sofix does not recognise this extension."
          : data.state !== "ok" ? "Sofix is not reachable right now."
            : data.plan && data.plan.note ? data.plan.note : "Nothing is planned for this gameweek yet.";
      return [el("p", "say", why), button("btn ghost", "Open Sofix", () => goTo(plan ? `/play?gw=${plan.week}` : "/"))];
    }
    const list = rows();
    const essence = list.reduce((sum, row) => sum + (row.ess || 0), 0);
    const scored = liveHere();
    const nodes = [scored && scored.lineups
      ? hero(String(scored.total), "", `points so far · ${scored.lineups} entered`, `${Math.round((plan.pAny || 0) * 100)}% any reward, before the games`)
      : hero(String(Math.round((plan.pAny || 0) * 100)), "%", "any reward", essence ? `${essence} essence expected` : "")];
    const ul = el("ul", "list");
    list.forEach((row, index) => ul.append(lineupRow(row, index, index === 0 && list.length > 1)));
    nodes.push(ul);
    const next = nextPress(list);
    const foot = el("div", "foot");
    if (next) foot.append(button(next.stage === 2 ? "btn warn" : "btn go", busy ? "Asking Sorare…" : pressLabel(next, true), () => press(list)));
    else foot.append(button("btn ghost", list.some((row) => stateOf(row).failed) ? "Some were stopped: open them" : "All entered", () => {}));
    foot.querySelector("button").disabled = busy || !next;
    foot.append(button("icon", "⋯", () => { menu = !menu; render(); }, "More: other plans and cards used"));
    nodes.push(foot);
    if (next && next.stage > 0) nodes.push(stepsNode(next.stage));
    if (menu) {
      const box = el("div", "menu in");
      const kv = el("div", "kv");
      kv.append(el("span", "", "Cards used"), el("b", "", `${plan.cardsUsed} of ${plan.cardsAvailable}`));
      const link = el("a", "", "Plans 2 and 3, and the rest, in Sofix");
      link.href = "#";
      link.addEventListener("click", (event) => { event.preventDefault(); goTo(`/play?gw=${plan.week}`); });
      box.append(kv, link);
      nodes.push(box);
    }
    return nodes;
  }

  function missionRow(mission, index) {
    const swap = mission.swaps[0];
    const item = el("li", `row${swap ? " warn" : ""}${openRow === index ? " open" : ""}`);
    const line = button("line", "", () => { openRow = openRow === index ? -1 : index; render(); });
    line.setAttribute("aria-expanded", String(openRow === index));
    const text = el("div");
    text.style.minWidth = "0";
    const said = [mission.reward, `${mission.yours.length} of ${mission.picks} picked`].filter(Boolean).join(" · ");
    text.append(el("div", "name", mission.title), el("div", "sub", said));
    const empty = mission.picks - mission.yours.length;
    const chip = swap ? el("span", "chip warn", `${mission.swaps.length} swap${mission.swaps.length === 1 ? "" : "s"}`)
      : empty > 0 && mission.sofix.length > mission.yours.length ? el("span", "chip warn", `${empty} open`)
        : el("span", "chip mint", "As Sofix");
    line.append(fan((mission.yours.length ? mission.yours : mission.sofix).map((one) => one.pic)), text, chip, el("span", "chev", "›"));
    item.append(line);
    if (openRow === index || (swap && openRow === -1 && index === firstSwap())) {
      for (const one of mission.swaps) {
        const box = el("div", "swap in");
        box.append(img(one.out.pic, "was", `${one.out.name}, your pick`), el("span", "pc num", pct(one.out.chance)), el("span", "note", "→"), img(one.in.pic, "", one.in.name));
        const who = el("div");
        who.style.minWidth = "0";
        const chance = el("span", "pc num", pct(one.in.chance));
        chance.style.color = "#f0ce1d";
        who.append(el("div", "name", one.in.name), chance);
        box.append(who, button("btn warn sm", "Swap", () => guideSwap(mission, one), `Swap ${one.out.name} for ${one.in.name} on Sorare`));
        item.append(box);
      }
      if (!mission.swaps.length) {
        const more = el("div", "more in");
        const list = el("p", "note");
        list.textContent = mission.sofix.length
          ? `Sofix: ${mission.sofix.map((one) => `${one.name} ${pct(one.chance)}`).join(" · ")}`
          : "Sofix has no eligible card of yours for it.";
        more.append(list);
        item.append(more);
      }
    }
    return item;
  }

  const firstSwap = () => (missions() ? missions().missions.findIndex((one) => one.swaps.length) : -1);

  function missionsView() {
    const today = missions();
    if (!today || today.status !== "today") {
      const link = button("btn ghost", "Open Sorare's missions", () => location.assign("/football/missions/play/limited"));
      return [el("p", "say", today && today.status === "stale" ? "Today's missions aren't loaded yet." : "No missions loaded yet."), el("p", "note", "They load on their own when Sorare's missions page opens."), link];
    }
    const swaps = core.swapCount(today);
    const loaded = today.seenAt ? core.clockLabel(today.seenAt) : null;
    const nodes = [hero(String(swaps), "", swaps === 1 ? "swap to make" : swaps ? "swaps to make" : "all as Sofix", loaded ? `Loaded on its own · ${loaded}` : "", swaps ? "#f0ce1d" : "#8fe3b4")];
    const ul = el("ul", "list");
    today.missions.forEach((mission, index) => ul.append(missionRow(mission, index)));
    nodes.push(ul);
    if (!today.missions.length) nodes.push(el("p", "note", "No missions are open today."));
    return nodes;
  }

  function render() {
    if (!dock) return;
    const nodes = [];
    if (open && !guide) {
      const pop = el("section", "pop");
      pop.id = "sofix-dock";
      pop.setAttribute("role", "dialog");
      pop.setAttribute("aria-label", "Sofix");
      pop.append(head(), ...(tab === "missions" ? missionsView() : lineupsView()));
      nodes.push(pop);
    }
    nodes.push(pill());
    const focused = host && host.shadowRoot.activeElement ? host.shadowRoot.activeElement.getAttribute("aria-label") || host.shadowRoot.activeElement.textContent : null;
    dock.replaceChildren(...nodes);
    if (focused) {
      const again = [...dock.querySelectorAll("button")].find((b) => (b.getAttribute("aria-label") || b.textContent) === focused);
      if (again) again.focus();
    }
  }

  function setOpen(next) {
    open = next;
    menu = false;
    if (open) { load(); loadLive(); }
    watchLive();
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
    load(); // the pill says the week the page is about, and its badge today's swaps
    scheduleCompose();
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
    try {
      const kept = JSON.parse(sessionStorage.getItem("sofix-guide") || "null");
      if (kept && Array.isArray(kept.steps) && kept.at < kept.steps.length) guide = kept;
    } catch {
      // nothing kept
    }
    publish();
    document.addEventListener("keydown", onKey, true);
    composeWatch = new MutationObserver(scheduleCompose);
    composeWatch.observe(document.body, { childList: true, subtree: true, characterData: true });
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
    clearInterval(liveTimer);
    liveTimer = 0;
    if (composeWatch) composeWatch.disconnect();
    composeWatch = null;
    clearTimeout(composeTimer);
    composeTimer = 0;
    compose = null;
    live = null;
    liveFor = "";
    liveBusy = false;
    guide = null;
    globalThis.__sofixGuide = null;
    window.dispatchEvent(new Event("sofix-guide"));
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
