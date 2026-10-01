// Sofix extension, the sorare.com overlay (plans/overlay.md, O3, O4 and O10).
// Draws Sofix's numbers on the cards Sorare shows: a glass tile inside the card's top-left corner (the score if he
// starts, then difficulty for a goalkeeper or defender and expected goals for the rest), Sofix's win and clean sheet
// under Sorare's own odds bar, and a panel beside the card on hover with the two scores. It only reads and draws. It
// has no control that writes to Sorare; the one thing here that takes a click apart from the tile's own hover opens the app.
//
//   find a card by where its picture comes from (never by Sorare's class names)
//   -> ask the page bridge which card that is (bridge.js learned it from the page's own answers)
//   -> ask the app for that player's numbers (through the background worker, which caches them)
//   -> draw the tile inside the picture's corner, sized to how big the card is drawn and clear of Sorare's own chips
//   -> find Sorare's odds bar by what it says and where it sits, make room under it, and draw Sofix's row there.
//
// A failure here must never break their page: every entry point is wrapped, and the worst outcome is that a
// ribbon does not appear.
(() => {
  if (globalThis.__sofixOverlay === 1) return;
  const core = globalThis.__sofixCore;
  const askBridge = globalThis.__sofixAsk;
  if (!core || typeof askBridge !== "function") return;
  globalThis.__sofixOverlay = 1;

  const NUMBERS_TTL_MS = 10 * 60 * 1000; // the background keeps them as long; this only spares it the question
  const IDENTIFY_TRIES = 8;
  const guard = (fn) => (...args) => {
    try {
      return fn(...args);
    } catch {
      // never break their page
    }
  };

  let enabled = false;
  let dead = false; // the extension was reloaded under this tab: the old script has nothing left to talk to
  let mutations = null;
  let visibility = null;
  let resizing = null;
  let frame = 0;
  let scan = true; // the page changed: look for new pictures on the next pass
  let appState = "ok"; // "ok", or why the app did not answer: "auth" | "unreachable"
  let pageEpoch = 0; // bumped whenever the page itself changes, so a chip re-checks what is near it

  let panel = null; // the one open hover panel: { record, entry, el, mode, ... }
  const records = new WeakMap(); // picture element -> its record (or a note that it is not a card)
  const live = new Set(); // the records being drawn; the WeakMap alone cannot be walked
  const numbers = new Map(); // "p:slug" | "c:slug" -> { at, entry | null }
  const asking = new Set(); // slugs the app has been asked about and has not answered
  // Futbol Fantasy read live (plans/futbolfantasy.md, S7): the last reading of each match page the cards on screen are about. The
  // worker reads a page at most every 10 minutes whatever is asked; this only remembers what it said and asks again every few.
  const liveByMatch = new Map(); // match number -> { at, players }
  const LIVE_POLL_MS = 5 * 60 * 1000;
  const LIVE_MATCHES = 8; // pages one ask may name: a lineup page rarely shows more games than this
  let liveTimer = 0;
  let liveAsking = false;
  let liveKey = ""; // the matches last asked about, so a new card scrolling into view asks at once and a quiet page does not
  let askTimer = 0;
  let sending = false;
  let downUntil = 0;
  let fixtureNow = core.fixtureOf(location.href); // the gameweek the page is about, from its address; null when it names none

  const now = () => Date.now();

  // -- finding cards ---------------------------------------------------------------------------------------------

  function sourceOf(media) {
    if (media.tagName === "VIDEO") {
      const inner = media.querySelector("source[src]");
      return media.currentSrc || media.getAttribute("src") || media.getAttribute("poster") || (inner && inner.getAttribute("src")) || "";
    }
    return media.currentSrc || media.getAttribute("src") || "";
  }

  /** A card slug read off the link the picture sits in, for a card the page's answers never named. */
  function slugFromLink(media) {
    const link = media.closest("a[href]");
    if (!link) return null;
    try {
      const url = new URL(link.href, location.href);
      const param = url.searchParams.get("card");
      const path = url.pathname.match(/\/cards\/([a-z0-9][a-z0-9_-]*)$/);
      const slug = param || (path && path[1]);
      return slug && /^[a-z0-9][a-z0-9_-]{0,119}$/.test(slug) ? slug : null;
    } catch {
      return null;
    }
  }

  function discover() {
    for (const hit of document.querySelectorAll(core.CARD_SELECTOR)) {
      const media = hit.tagName === "SOURCE" ? hit.closest("video") : hit;
      if (!media || media.closest("[data-sfx]")) continue;
      const src = sourceOf(media);
      const known = records.get(media);
      if (known && known.src === src) continue;
      if (known && known.live) forget(known); // the page gave this element to another card
      const key = core.cardImageKey(src);
      const alt = media.getAttribute("alt") || "";
      if (!key || core.isAvatarArt(src)) {
        records.set(media, { media, src, live: false, cardLike: !core.isAvatarArt(src) && alt.includes(" - ") });
        continue;
      }
      const record = { media, src, key, name: alt, live: true, cardLike: true, ident: "new", tries: 0, nextTry: 0, visible: false, ribs: null, sig: "" };
      records.set(media, record);
      live.add(record);
      visibility.observe(media);
      resizing.observe(media);
    }
  }

  function forget(record) {
    record.live = false;
    live.delete(record);
    records.delete(record.media); // so a card that comes back (the switch turned on again) is found again
    clearDrawn(record);
    try {
      visibility.unobserve(record.media);
      resizing.unobserve(record.media);
    } catch {
      // already gone
    }
  }

  // -- who is this card ------------------------------------------------------------------------------------------

  async function identify() {
    const due = [...live].filter((r) => r.ident !== "done" && r.ident !== "asked" && r.visible && r.tries < IDENTIFY_TRIES && now() >= r.nextTry);
    if (!due.length) return;
    for (const record of due) {
      record.ident = "asked";
      record.tries += 1;
      record.nextTry = now() + 400 * 2 ** record.tries;
    }
    const answer = await askBridge({ type: "identify", items: due.map((r) => ({ key: r.key, name: r.name })) }, 3000);
    const found = answer && answer.state === "ok" && answer.found ? answer.found : {};
    for (const record of due) {
      const hit = found[record.key];
      const linked = hit && (hit.cardSlug || hit.playerSlug) ? null : slugFromLink(record.media);
      if (hit && (hit.cardSlug || hit.playerSlug)) {
        record.cardSlug = hit.cardSlug || null;
        record.playerSlug = hit.playerSlug || null;
        record.ident = "done";
      } else if (linked) {
        record.cardSlug = linked;
        record.playerSlug = null;
        record.ident = "done";
      } else {
        record.ident = "new"; // not known yet: tried again later, and when the bridge learns more
      }
    }
    schedule();
  }

  // -- the numbers -----------------------------------------------------------------------------------------------

  /** Numbers belong to the player, so his own slug is asked for when it is known; otherwise the card's. */
  const slugOf = (record) => (record.playerSlug ? `p:${record.playerSlug}` : record.cardSlug ? `c:${record.cardSlug}` : null);

  function entryOf(record) {
    const slug = slugOf(record);
    const held = slug && numbers.get(slug);
    return held && now() - held.at < NUMBERS_TTL_MS ? withLive(held) : null;
  }

  /**
   * The answer with Futbol Fantasy's latest reading of his game applied, when there is one: his chance of starting and of
   * coming on, what it says of him and where, and nothing else (the plan's ticks and xScore stay as the job made them).
   * Kept on the answer so that a card redrawn does not do the arithmetic again.
   */
  function withLive(held) {
    const entry = held.entry;
    const match = entry && entry.ffMatch;
    const reading = match && liveByMatch.get(String(match.id));
    const player = reading && reading.players[entry.ffPlayer];
    if (!player) return held;
    if (held.merged && held.mergedAt === reading.at) return held.merged;
    const patch = core.liveSplit(entry, player, new Date(reading.at).toISOString());
    if (!patch) return held;
    held.mergedAt = reading.at;
    held.merged = { at: held.at, entry: { ...entry, ...patch } };
    return held.merged;
  }

  /** Ask the worker for the match pages the cards on screen are about; it reads each at most every 10 minutes. */
  function wantLive(force) {
    if (!enabled || dead || liveAsking || appState !== "ok") return;
    const matches = new Map();
    for (const record of live) {
      if (record.ident !== "done" || !record.visible) continue;
      const slug = slugOf(record);
      const held = slug && numbers.get(slug);
      const match = held && held.entry && held.entry.ffMatch;
      if (match && matches.size < LIVE_MATCHES) matches.set(match.id, { id: match.id, url: match.url });
    }
    const key = [...matches.keys()].sort().join(",");
    if (!key || (!force && key === liveKey)) return;
    liveKey = key;
    liveAsking = true;
    try {
      chrome.runtime.sendMessage({ type: "ff-live", matches: [...matches.values()] }, (reply) => {
        liveAsking = false;
        if (chrome.runtime.lastError || !reply || reply.state !== "ok") {
          void chrome.runtime.lastError;
          return;
        }
        guard(() => {
          for (const [id, reading] of Object.entries(reply.live || {})) {
            const at = Date.parse(reading && reading.at);
            if (!Number.isNaN(at) && reading.players) liveByMatch.set(id, { at, players: reading.players });
          }
          schedule();
        })();
      });
    } catch {
      liveAsking = false;
      dead = true;
      stop();
    }
  }

  function wantNumbers() {
    for (const record of live) {
      if (record.ident !== "done" || !record.visible) continue;
      const slug = slugOf(record);
      if (slug && !entryOf(record)) asking.add(slug);
    }
    if (asking.size && !askTimer && !sending && now() >= downUntil) askTimer = setTimeout(guard(sendAsking), 120);
  }

  function sendAsking() {
    askTimer = 0;
    const batch = [...asking].slice(0, 120);
    const cards = batch.filter((s) => s.startsWith("c:")).map((s) => s.slice(2));
    const players = batch.filter((s) => s.startsWith("p:")).map((s) => s.slice(2));
    sending = true;
    const askedFor = fixtureNow;
    try {
      chrome.runtime.sendMessage({ type: "overlay-numbers", cards, players, fixture: askedFor }, (reply) => {
        sending = false;
        if (askedFor !== fixtureNow) {
          schedule(); // the page moved to another gameweek while this was out: its answer is about the last one
          return;
        }
        if (chrome.runtime.lastError || !reply) {
          void chrome.runtime.lastError;
          downUntil = now() + 30000; // the worker is not answering: leave it alone for a while
          setTimeout(guard(schedule), 30500);
          return;
        }
        guard(() => {
          if (reply.state !== "ok") {
            appState = reply.state;
            downUntil = now() + 30000; // the background is not asking the app either; look again in half a minute
            setTimeout(guard(schedule), 30500);
          } else {
            appState = "ok";
            for (const slug of batch) numbers.set(slug, { at: now(), entry: (slug[0] === "c" ? reply.cards : reply.players)[slug.slice(2)] || null });
          }
          for (const slug of batch) asking.delete(slug);
          schedule();
          if (appState === "ok") setTimeout(guard(() => wantLive(false)), 600);
        })();
      });
    } catch {
      sending = false;
      dead = true; // "Extension context invalidated": this script belongs to a reloaded extension
      stop();
    }
  }

  // -- drawing ---------------------------------------------------------------------------------------------------

  function isRound(media, rect) {
    const radius = getComputedStyle(media).borderRadius || "";
    const value = parseFloat(radius);
    if (!(value > 0)) return false;
    return radius.includes("%") ? value >= 50 : value >= Math.min(rect.width, rect.height) / 2;
  }

  const SVG_NS = "http://www.w3.org/2000/svg";
  const INSET = { full: { x: 6, y: 6 }, compact: { x: 4, y: 4 }, tiny: { x: 3, y: 3 } }; // how far in from the picture's top-left corner the tile sits
  const TINY_UNDER = 80; // a card narrower than this (a bench thumbnail) gets the smallest tile
  const ODDS_GAP = 4; // between Sorare's odds bar and ours; the room made for the row is this plus its own 22px

  let tokenAt = 0;
  let tokens = {};
  /** Sorare's own colour for a level, read from the page so the tile follows its theme; the measured value otherwise. */
  function colour(level) {
    if (now() - tokenAt > 10000) {
      tokenAt = now();
      tokens = {};
      const style = getComputedStyle(document.documentElement);
      for (const name of Object.keys(core.SCORE_FALLBACK)) {
        const value = style.getPropertyValue(`--c-score-${name}`).trim();
        if (/^#[0-9a-f]{6}$/i.test(value)) tokens[name] = value;
      }
    }
    return tokens[level] || core.SCORE_FALLBACK[level];
  }

  function node(tag, className, text) {
    const made = document.createElement(tag);
    if (className) made.className = className;
    if (text !== undefined) made.textContent = text;
    return made;
  }

  /** Sorare's five colours side by side, easiest to hardest: the tile's top edge, the odds row's and the panel's. */
  function stripe() {
    const bar = node("span", "sfx-stripe");
    bar.setAttribute("aria-hidden", "true");
    for (const level of core.STRIPE) {
      const part = document.createElement("i");
      part.style.background = colour(level);
      bar.append(part);
    }
    return bar;
  }

  /** The small shirt that says "if he starts". */
  function shirt(className) {
    const svg = document.createElementNS(SVG_NS, "svg");
    svg.setAttribute("viewBox", "0 0 12 12");
    svg.setAttribute("aria-hidden", "true");
    svg.setAttribute("class", className);
    const path = document.createElementNS(SVG_NS, "path");
    path.setAttribute("d", "M4 1.4 1 3.1l.9 2.5L3 5.2v5.4h6V5.2l1.1.4.9-2.5L8 1.4C7.6 2.3 6.9 2.8 6 2.8S4.4 2.3 4 1.4Z");
    svg.append(path);
    return svg;
  }

  /** A percentage the way the tile writes it: the number large and the sign small. */
  function percent(className, text) {
    const holder = node("span", className);
    holder.append(text.replace("%", ""));
    holder.append(node("small", "", "%"));
    return holder;
  }

  /** The small mark that says whose number a start chance is: a filled dot for FF, a ring for SO, a dashed ring for SF. */
  function sourceDot(source) {
    const dot = node("span", `sfx-src sfx-src--${source}`);
    dot.setAttribute("aria-hidden", "true");
    return dot;
  }

  /** Everything the tile and the panel say about one answer, worked out once. */
  function facts(entry) {
    const split = typeof entry.start === "number" && typeof entry.bench === "number";
    const startChance = core.startChance(entry);
    return {
      split,
      score: Math.round(split ? entry.start : entry.x),
      startChance,
      tone: core.startTone(entry),
      doubt: core.startTone(entry) !== "ok",
      source: entry.startSource || null,
      note: core.statusNote(entry),
      game: entry.game || null,
      driver: core.driverOf(entry.pos),
      xg: typeof entry.xg === "number" ? entry.xg : null,
    };
  }

  /** The tile's name for a screen reader: the same things it shows, in words. */
  function describe(f, more = []) {
    const said = [f.split ? `Sofix: ${f.score} if he starts.` : `Sofix: expected score ${f.score}.`];
    if (f.driver === "fdr") {
      said.push(f.game ? `Difficulty ${Math.round(f.game.difficulty)} of 100, ${f.game.label.toLowerCase()}.` : "No odds for this game yet.");
    } else if (f.driver === "xg") {
      if (f.xg !== null) said.push(`Expected goals ${f.xg.toFixed(2)}.`);
      else said.push(f.game ? "No xG: expected goals are not available for this player." : "No xG for this player, and no odds for this game yet.");
    }
    const from = f.source ? ` (${core.SOURCE_SHORT[f.source]})` : "";
    said.push(f.doubt ? `He starts only ${core.chanceLabel(f.startChance)} of the time${from}.` : `He starts ${core.chanceLabel(f.startChance)} of the time${from}.`);
    return [...said, ...more].join(" ");
  }

  // -- the tile ---------------------------------------------------------------------------------------------------

  const STALE_INK = "#a3a3ab"; // the score of a number that no longer holds: the colour goes, the number stays

  /** What the best plan does with this very card (a copy of the player, by its slug), or null: a card it leaves out has nothing. */
  function planFor(record, entry) {
    return (record.cardSlug && entry.inPlan && entry.inPlan[record.cardSlug]) || null;
  }

  /** The tick of a card the best plan uses, or the star of its captain, hanging off the tile's top-right corner. */
  function mark(captain) {
    const badge = node("span", `sfx-mark${captain ? " sfx-mark--star" : ""}`);
    badge.setAttribute("aria-hidden", "true");
    if (captain) badge.style.setProperty("--sfx-m", colour("mediumLow"));
    const svg = document.createElementNS(SVG_NS, "svg");
    svg.setAttribute("viewBox", "0 0 12 12");
    const path = document.createElementNS(SVG_NS, "path");
    path.setAttribute("d", captain ? "M6 1 7.5 4.3l3.6.4-2.7 2.4.8 3.5L6 8.7 2.8 10.6l.8-3.5L.9 4.7l3.6-.4Z" : "M2.4 6.4 4.9 8.8 9.7 3.4");
    if (!captain) {
      path.setAttribute("fill", "none");
      path.setAttribute("stroke", "currentColor");
      path.setAttribute("stroke-width", "1.9");
      path.setAttribute("stroke-linecap", "round");
      path.setAttribute("stroke-linejoin", "round");
    } else {
      path.setAttribute("fill", "currentColor");
    }
    svg.append(path);
    badge.append(svg);
    return badge;
  }

  /** "#1": where he stands among the cards on a list to pick from. */
  function rankBadge(rank) {
    const badge = node("span", "sfx-rank", `#${rank}`);
    badge.setAttribute("aria-hidden", "true");
    return badge;
  }

  /** What to draw on a card of this size: a signature (to skip redrawing what has not changed), the node, its name. */
  function build(record, tier, size, rank) {
    const slug = slugOf(record);
    const held = entryOf(record);
    const entry = held && held.entry;
    if (entry) return buildTile(record, tier, size, entry, rank);
    if (held) return null; // asked, and Sofix has nothing on this player: a card we cannot help with draws nothing
    if (appState !== "ok") {
      if (tier !== "full") return null;
      const tag = node("button");
      tag.type = "button"; // a real button, so it can be reached and pressed from the keyboard
      tag.className = "sfx-tag";
      tag.append(stripe(), node("span", "", appState === "auth" ? "Sign in" : "Offline"));
      const label = appState === "auth" ? "Sofix does not recognise this extension. Open Sofix" : "Sofix is not reachable. Open Sofix";
      tag.setAttribute("aria-label", label);
      tag.addEventListener("click", guard((event) => {
        event.preventDefault();
        event.stopPropagation();
        chrome.runtime.sendMessage({ type: "open-app", path: "/" });
      }));
      return { sig: `${tier}|tag|${appState}`, node: tag, marks: [], label, interactive: false };
    }
    if (slug && asking.has(slug)) {
      const tile = node("span", `sfx-tile sfx-tile--loading${tier === "compact" ? " sfx-tile--compact" : ""}${size === "tiny" ? " sfx-tile--tiny" : ""}`);
      tile.setAttribute("role", "img");
      tile.setAttribute("aria-label", "Sofix numbers loading");
      const skeleton = node("span", "sfx-skel");
      skeleton.append(document.createElement("i"), document.createElement("i"));
      tile.append(stripe(), skeleton);
      return { sig: `${size}|loading`, node: tile, marks: [], label: "Sofix numbers loading", interactive: false };
    }
    return null;
  }

  function buildTile(record, tier, size, entry, rank) {
    const f = facts(entry);
    const stale = core.staleness(entry, now());
    const plan = planFor(record, entry);
    const scoreColour = stale ? STALE_INK : colour(core.scoreLevel(f.score));
    const level = f.game ? core.fdrLevel(f.game.bucket) : null;
    const driveColour = level ? colour(level) : "";
    const more = [];
    if (plan) more.push(`In your best plan, ${plan.lineup} lineup${plan.captain ? ", as captain" : ""}.`);
    if (rank && tier === "full") more.push(`Number ${rank} of the cards on this list by expected score.`);
    if (stale) more.push(stale.kind === "over" ? "His game has started, so these numbers are about a game no longer ahead." : `These numbers are ${stale.hours} h old.`);
    const label = describe(f, more);
    const shownRank = tier === "full" ? rank || 0 : 0;
    const sig = [size, f.score, f.split, f.startChance, f.tone, f.source, entry.live && entry.startAt, f.driver, f.xg, entry.pos, f.game && `${f.game.difficulty}:${f.game.bucket}`, scoreColour, driveColour, stale && stale.kind, plan && `${plan.lineup}:${plan.captain}`, shownRank].join("|");
    const marks = [...(plan ? [mark(plan.captain)] : []), ...(shownRank ? [rankBadge(shownRank)] : [])];
    const staleClass = stale ? " sfx-tile--stale" : "";

    if (tier === "compact") {
      const tile = node("span", `sfx-tile sfx-tile--compact${size === "tiny" ? " sfx-tile--tiny" : ""}${f.doubt ? " sfx-tile--doubt" : ""}${staleClass}`);
      tile.setAttribute("role", "img");
      tile.setAttribute("aria-label", label);
      tile.style.setProperty("--sfx-c", scoreColour);
      tile.append(stripe(), node("b", "sfx-score", String(f.score)));
      return { sig, node: tile, marks, label, interactive: false };
    }

    const tile = node("button", `sfx-tile${f.doubt ? " sfx-tile--doubt" : ""}${staleClass}`);
    tile.type = "button"; // the one thing on the card that answers the pointer: it opens the panel and nothing else
    tile.setAttribute("aria-label", label);
    tile.setAttribute("aria-haspopup", "dialog");
    tile.setAttribute("aria-expanded", "false");
    tile.style.setProperty("--sfx-c", scoreColour);
    if (driveColour) tile.style.setProperty("--sfx-d", driveColour);
    const main = node("span", "sfx-main");
    main.append(shirt("sfx-shirt"), node("b", "sfx-score", String(f.score)));
    tile.append(stripe(), main);

    if (stale) {
      const row = node("span", "sfx-drive sfx-drive--none"); // the driver is no longer worth reading: say why instead
      row.append(node("span", "sfx-cap", stale.kind === "over" ? "Started" : "Old"));
      tile.append(row);
    } else if (f.driver === "fdr" && f.game) {
      const row = node("span", "sfx-drive");
      row.append(node("span", "sfx-cap", "FDR"), node("b", "sfx-fdr", String(Math.round(f.game.difficulty))));
      tile.append(row);
    } else if (f.driver === "xg" && f.xg !== null) {
      const row = node("span", "sfx-drive");
      row.append(node("span", "sfx-cap sfx-cap--xg", "xG"), node("b", "sfx-xg", f.xg.toFixed(2)));
      tile.append(row);
    } else {
      // What is missing is the driver: a midfielder's or forward's xG (his league or he may be unknown to Understat), or a
      // keeper's or defender's game odds. The words name it.
      const row = node("span", "sfx-drive sfx-drive--none");
      row.append(node("span", "sfx-cap", f.driver === "xg" ? "No xG" : "No odds"));
      tile.append(row);
    }
    if (!stale) {
      // How likely he is to start, on every tile, and whose number it is: FF's lineup where it has him, else SO's odds, else SF's own.
      // Amber when he is in doubt, red when he will not start.
      const starts = node("span", `sfx-starts${f.tone === "doubt" ? " sfx-doubt" : ""}${f.tone === "out" ? " sfx-out" : ""}`);
      starts.setAttribute("aria-hidden", "true");
      const chance = node("b");
      chance.append(core.chanceLabel(f.startChance).replace("%", ""), node("small", "", "%"));
      starts.append(f.source ? sourceDot(f.source) : shirt(""), chance);
      tile.append(starts);
    }
    return { sig, node: tile, marks, label, interactive: true };
  }

  /**
   * Where the tile goes down the card's left edge. Sorare draws its own chips there on some cards (a season badge, a
   * serial number), and they differ per card, so this looks at what is actually under the strip the tile would take
   * and starts below it. Found by position and size, never by what anything is called: a backdrop or a card-sized
   * link is not a chip; a small box in the strip is.
   */
  function clearOf(media, rect, size, width, height) {
    const wanted = rect.top + INSET[size].y;
    // Every 12px down the band, so a chip smaller than the band cannot sit between two of the lines that are looked along.
    const rows = (top) => {
      const ys = [];
      for (let y = top + 2; y < top + height - 2; y += 12) ys.push(y);
      ys.push(top + height - 2);
      return ys;
    };
    const limit = rect.top + rect.height * 0.45; // never sink into the player's face to get out of the way
    const left = rect.left + INSET[size].x;
    const xs = [];
    for (let x = left + 1; x < left + width; x += 10) xs.push(x);
    xs.push(left + width - 1);
    let top = wanted;
    for (let round = 0; round < 4; round += 1) {
      let lowest = 0;
      for (const y of rows(top)) {
        for (const x of xs) {
          if (x < 0 || y < 0 || x >= innerWidth || y >= innerHeight) continue;
          for (const el of document.elementsFromPoint(x, y)) {
            if (el === media || el.contains(media) || media.contains(el) || el.closest("[data-sfx],[data-sfx-drawer]")) continue;
            const r = el.getBoundingClientRect();
            if (r.width * r.height > rect.width * rect.height * 0.25) continue; // a backdrop, not a chip
            lowest = Math.max(lowest, r.bottom);
          }
        }
      }
      if (!lowest) return top;
      top = lowest + 3;
      if (top > limit) return wanted; // no room below theirs: stay where the card has room rather than cover the face
    }
    return top;
  }

  /** `clearOf`, remembered until the card moves or the page around it changes: it is the one costly thing a pass does. */
  function clearOfCached(record, rect, size, width, height) {
    const key = [rect.left, rect.top, rect.width, rect.height, size, Math.round(width), Math.round(height), pageEpoch].map((n) => (typeof n === "number" ? Math.round(n) : n)).join("|");
    if (record.bandKey !== key) {
      record.bandKey = key;
      record.bandTop = clearOf(record.media, rect, size, width, height);
    }
    return record.bandTop;
  }

  // -- Sorare's odds bar, and our row under it --------------------------------------------------------------------

  const THREE_PERCENTS = /^\d{1,3}%\d{1,3}%\d{1,3}%$/;
  const compact = (text) => (text || "").replace(/\s+/g, "");

  /**
   * Sorare's win / draw / loss bar under a card: the smallest box in the card's own block whose whole text is three
   * percentages, right under the picture and about as wide as it. Found by what it says and where it sits, never by
   * a class name; null when there is none, and then no row is drawn.
   */
  function locateBar(media, rect) {
    // On Sorare's lists the bar is not right under the picture: a form-and-score row and a flags row come first, so it
    // starts about 75px down a card 150px wide. Look as far as half the card's height, never as far as the next row.
    const reach = Math.max(60, rect.height * 0.55);
    let scope = media.parentElement;
    for (let level = 0; level < 4 && scope && scope !== document.body; level += 1, scope = scope.parentElement) {
      const box = scope.getBoundingClientRect();
      if (box.height > rect.height * 2.4 || box.width > rect.width * 2.4) return null; // past this card's own block
      let best = null;
      let distance = Infinity;
      let seen = 0;
      for (const el of scope.querySelectorAll("*")) {
        if (++seen > 400) break;
        if (el.closest("[data-sfx]") || el === media || el.contains(media)) continue;
        const text = compact(el.textContent);
        if (text.length > 14 || !THREE_PERCENTS.test(text)) continue;
        if ([...el.children].some((child) => THREE_PERCENTS.test(compact(child.textContent)))) continue; // a wrapper of the bar
        const r = el.getBoundingClientRect();
        if (r.width < rect.width * 0.6 || r.width > rect.width * 1.3 || r.height < 8 || r.height > 60) continue;
        if (r.top < rect.bottom - 6 || r.top > rect.bottom + reach || r.left < rect.left - 20 || r.right > rect.right + 20) continue;
        if (r.top - rect.bottom < distance) {
          best = el;
          distance = r.top - rect.bottom;
        }
      }
      if (best) return best;
    }
    return null;
  }

  function barFor(record, rect) {
    const key = [Math.round(rect.left), Math.round(rect.bottom), Math.round(rect.width), pageEpoch].join("|");
    if (record.barKey !== key || (record.bar && !record.bar.isConnected)) {
      record.barKey = key;
      record.bar = locateBar(record.media, rect);
    }
    return record.bar;
  }

  /**
   * Is the room under their bar really free? After it is made, nothing of theirs (their kickoff line) may sit in it:
   * if something does, the margin did not move it, and drawing there would cover it, so the row is not drawn at all.
   */
  function roomIsFree(bar, barRect, mediaRect) {
    const y = barRect.bottom + ODDS_GAP + 11;
    const REPLACED = /^(IMG|SVG|VIDEO|CANVAS|BUTTON|INPUT)$/;
    for (const x of [barRect.left + 8, barRect.left + barRect.width / 2, barRect.right - 8]) {
      if (x < 0 || y < 0 || x >= innerWidth || y >= innerHeight) continue;
      for (const el of document.elementsFromPoint(x, y)) {
        if (el === bar || el.contains(bar) || bar.contains(el) || el.closest("[data-sfx]")) continue;
        const r = el.getBoundingClientRect();
        if (r.width * r.height > mediaRect.width * mediaRect.height * 0.25) continue; // a backdrop or a card-sized link
        if (!compact(el.textContent) && !REPLACED.test(el.tagName.toUpperCase())) continue; // nothing to see there
        return false;
      }
    }
    return true;
  }

  function buildOdds(game) {
    const win = Math.round(game.win * 100);
    const clean = typeof game.cleanSheet === "number" ? Math.round(game.cleanSheet * 100) : null;
    const label = clean === null ? `Sofix odds: win ${win}%` : `Sofix odds: win ${win}%, clean sheet ${clean}%`;
    const cell = (caption, value, className) => {
      const holder = node("span", "sfx-odds-cell");
      holder.append(node("span", "sfx-cap", caption), value === null ? node("b", "sfx-odds-num sfx-odds-num--none", "—") : percent(`sfx-odds-num ${className}`, `${value}%`));
      return holder;
    };
    const rule = node("span", "sfx-odds-rule");
    rule.setAttribute("aria-hidden", "true");
    return { sig: `${win}|${clean}`, label, nodes: [stripe(), cell("WIN", win, "sfx-odds-num--win"), rule, cell("CS", clean, "")] };
  }

  /** Hand back what was done to their bar. */
  function releaseBar(record) {
    if (record.roomBar) record.roomBar.classList.remove("sfx-room");
    record.roomBar = null;
  }

  function removeOdds(record) {
    if (record.odds) record.odds.remove();
    record.odds = null;
    record.oddsSig = "";
    releaseBar(record);
  }

  /** Takes off everything drawn for one card, and gives back what was borrowed. */
  function clearDrawn(record) {
    if (panel && panel.record === record) closePanel(false);
    if (record.ribs) record.ribs.remove();
    record.ribs = null;
    record.sig = "";
    record.tile = null;
    removeOdds(record);
  }

  // -- the panel beside the card -----------------------------------------------------------------------------------

  const PANEL_WIDTH = 222;
  const scoreColourOf = (score) => colour(core.scoreLevel(score));

  /** The number and its words: the score if he starts (or if he is benched), and the chance of that with whose number it is. */
  function panelBig(entry, mode) {
    const f = facts(entry);
    const starts = mode === "start" || !f.split;
    const score = starts ? f.score : Math.round(entry.bench);
    const big = node("div", "sfx-big");
    big.style.setProperty("--sfx-c", scoreColourOf(score));
    const line = node("div", "sfx-num");
    line.append(node("strong", "", String(score)), node("span", "", f.split ? (starts ? "if he starts" : "if benched") : "expected score"));
    big.append(line);
    const chance = starts ? f.startChance : core.benchOnChance(entry);
    const side = node("div", `sfx-chance${starts && f.tone === "doubt" ? " sfx-chance--doubt" : ""}${starts && f.tone === "out" ? " sfx-chance--out" : ""}`);
    if (chance !== null && (f.split || !starts)) {
      const value = node("div", "sfx-chance-row");
      if (starts && f.source) value.append(sourceDot(f.source));
      value.append(node("b", "", core.chanceLabel(chance)));
      const what = starts ? `START${f.source ? " · " + core.SOURCE_SHORT[f.source] : ""}` : "COMES ON";
      side.append(value, node("span", "", what));
      big.append(side);
    } else if (!f.split) {
      const value = node("div", "sfx-chance-row");
      value.append(node("b", "", core.chanceLabel(entry.p)));
      side.append(value, node("span", "", "PLAYS"));
      big.append(side);
    }
    return big;
  }

  /** The three numbers that matter about his game: his driver (xG, or a clean sheet), his side's win chance, and the difficulty. */
  function statCells(entry) {
    const f = facts(entry);
    const cells = [];
    if (f.driver === "xg") cells.push(["XG", f.xg !== null ? f.xg.toFixed(2) : "—", ""]);
    else cells.push(["CS", f.game && typeof f.game.cleanSheet === "number" ? `${Math.round(f.game.cleanSheet * 100)}%` : "—", ""]);
    cells.push(["WIN", f.game && typeof f.game.win === "number" ? `${Math.round(f.game.win * 100)}%` : "—", ""]);
    const level = f.game ? core.fdrLevel(f.game.bucket) : null;
    cells.push(["DIFF", f.game ? String(Math.round(f.game.difficulty)) : "—", level ? colour(level) : ""]);
    const grid = node("div", "sfx-stats");
    for (const [key, value, tint] of cells) {
      const cell = node("div", "sfx-stat");
      const number = node("b", value === "—" ? "sfx-stat--none" : "", value);
      if (tint) number.style.color = tint;
      cell.append(node("span", "", key), number);
      grid.append(cell);
    }
    return grid;
  }

  /** What the site says is wrong with him, only when it says so: an amber line for a doubt, a red one for an injury or a ban. */
  function alertNode(entry) {
    const note = core.statusNote(entry);
    if (!note) return null;
    const alert = node("p", `sfx-alert${note.kind === "doubt" ? "" : " sfx-alert--out"}`);
    alert.setAttribute("role", "status");
    const icon = document.createElementNS(SVG_NS, "svg");
    icon.setAttribute("viewBox", "0 0 18 18");
    icon.setAttribute("aria-hidden", "true");
    const disc = document.createElementNS(SVG_NS, "circle");
    disc.setAttribute("cx", "9");
    disc.setAttribute("cy", "9");
    disc.setAttribute("r", "8.2");
    const glyph = document.createElementNS(SVG_NS, "path");
    glyph.setAttribute("fill", "none");
    glyph.setAttribute("stroke-width", "1.9");
    glyph.setAttribute("stroke-linecap", "round");
    glyph.setAttribute("d", note.kind === "doubt" ? "M6.9 7.1a2.2 2.2 0 1 1 3.2 2c-.7.35-1.1.75-1.1 1.5v.3M9 13.4h.01" : "M9 5.2v7.6M5.2 9h7.6");
    icon.append(disc, glyph);
    alert.append(icon, node("span", "", note.text));
    return alert;
  }

  /** Who says it, hidden until asked for: FF, SO and SF with what each says and, for FF, when it was read. */
  function sourcesNode(entry, onResize) {
    const box = node("div", "sfx-sources");
    const toggle = node("button", "sfx-sources-toggle");
    toggle.type = "button";
    toggle.setAttribute("aria-expanded", "false");
    toggle.append("SOURCES");
    const chevron = document.createElementNS(SVG_NS, "svg");
    chevron.setAttribute("viewBox", "0 0 10 10");
    chevron.setAttribute("aria-hidden", "true");
    const arrow = document.createElementNS(SVG_NS, "path");
    arrow.setAttribute("d", "M2 3.5l3 3 3-3");
    arrow.setAttribute("fill", "none");
    arrow.setAttribute("stroke-width", "1.5");
    arrow.setAttribute("stroke-linecap", "round");
    arrow.setAttribute("stroke-linejoin", "round");
    chevron.append(arrow);
    toggle.append(chevron);
    const list = node("ul", "sfx-sources-list");
    list.hidden = true;
    for (const row of core.sourceRows(entry)) {
      const item = node("li", row.shown ? "is-shown" : row.value === null ? "is-none" : "");
      const value = node("b", row.note ? "sfx-source-note" : "", row.value === null ? row.note || "—" : core.chanceLabel(row.value));
      if (row.note) value.title = "Futbol Fantasy covers LaLiga only";
      item.append(sourceDot(row.source), node("span", "sfx-source-name", row.label), node("span", "sfx-source-at", row.at || ""), value);
      list.append(item);
    }
    toggle.addEventListener("click", guard((event) => {
      event.preventDefault();
      event.stopPropagation();
      const open = list.hidden;
      list.hidden = !open;
      toggle.setAttribute("aria-expanded", String(open));
      onResize();
    }));
    box.append(toggle, list);
    return box;
  }

  function panelNode(entry, mode, onPick, plan, onResize) {
    const f = facts(entry);
    const el = node("div", "sfx-panel");
    el.setAttribute("data-sfx", "panel");
    el.setAttribute("role", "dialog");
    el.setAttribute("aria-label", "Sofix details");
    const body = node("div", "sfx-body");
    const brand = node("span", "sfx-brand");
    const mark = stripe();
    brand.append(mark, "SOFIX");
    const head = node("div", "sfx-head");
    head.append(brand);
    if (plan) {
      const chip = node("span", "sfx-plan", plan.lineup);
      if (plan.captain) {
        const captain = node("span", "sfx-plan-c", "C");
        captain.setAttribute("aria-label", "Captain");
        chip.append(captain);
      }
      head.append(chip);
    }
    const age = entry.live ? core.freshLabel(entry.startAt, now()) : core.freshLabel(entry.at, now());
    if (age) head.append(node("span", "sfx-age", entry.live ? `FF live ${age}` : age));
    body.append(head);
    const stale = core.staleness(entry, now());
    if (stale) body.append(node("p", "sfx-note", stale.kind === "over" ? "His game has started." : `These numbers are ${stale.hours} h old.`));
    if (f.split) {
      const seg = node("div", "sfx-seg");
      seg.setAttribute("role", "group");
      seg.setAttribute("aria-label", "Projected score when he");
      for (const [key, text] of [["start", "Starts"], ["bench", "Benched"]]) {
        const button = node("button", "", text);
        button.type = "button";
        button.setAttribute("aria-pressed", String(key === mode));
        button.setAttribute("data-mode", key);
        button.addEventListener("click", guard((event) => {
          event.preventDefault();
          event.stopPropagation();
          onPick(key);
        }));
        seg.append(button);
      }
      body.append(seg);
    }
    body.append(panelBig(entry, mode));
    const alert = alertNode(entry);
    if (alert) body.append(alert);
    body.append(statCells(entry), sourcesNode(entry, onResize));
    el.append(stripe(), node("span", "sfx-arrow"), body);
    return el;
  }

  function positionPanel() {
    if (!panel || !panel.record.tile) return;
    const tile = panel.record.tile.getBoundingClientRect();
    const media = panel.record.media.getBoundingClientRect();
    const height = panel.el.offsetHeight;
    let side = "left";
    let left = tile.left - 12 - PANEL_WIDTH;
    if (left < 8) {
      side = "right";
      left = Math.min(media.right + 12, innerWidth - PANEL_WIDTH - 8);
    }
    const top = Math.min(Math.max(tile.top + tile.height / 2 - 21, 8), Math.max(8, innerHeight - height - 8));
    panel.el.dataset.side = side;
    panel.el.style.left = `${Math.max(8, left)}px`;
    panel.el.style.top = `${top}px`;
    const arrow = panel.el.querySelector(".sfx-arrow");
    if (arrow) arrow.style.top = `${Math.min(Math.max(tile.top + tile.height / 2 - top - 5, 12), Math.max(12, height - 24))}px`;
  }

  function scheduleClose() {
    if (!panel) return;
    clearTimeout(panel.timer);
    panel.timer = setTimeout(
      guard(() => {
        if (!panel || panel.overTile || panel.overPanel) return;
        const active = document.activeElement;
        // Focus from the keyboard keeps it open (that is how it is reached without a pointer); focus left by a mouse press does not.
        if (active && (panel.el.contains(active) || panel.record.tile === active) && active.matches(":focus-visible")) return;
        closePanel(false);
      }),
      200,
    );
  }

  function closePanel(returnFocus) {
    if (!panel) return;
    const { record, el, timer } = panel;
    clearTimeout(timer);
    const hadFocus = el.contains(document.activeElement) || (record.tile && record.tile === document.activeElement);
    el.remove();
    if (record.tile) record.tile.setAttribute("aria-expanded", "false");
    document.removeEventListener("keydown", onPanelKey, true);
    document.removeEventListener("pointerdown", onOutside, true);
    window.removeEventListener("scroll", onPanelScroll, true);
    window.removeEventListener("resize", onPanelScroll, true);
    panel = null;
    if (returnFocus && hadFocus && record.tile && record.tile.isConnected) {
      record.quiet = true; // giving the focus back is not a reason to open the panel again
      record.tile.focus({ preventScroll: true });
      record.quiet = false;
    }
  }

  const onPanelKey = guard((event) => {
    if (event.key !== "Escape" || !panel) return;
    event.stopPropagation();
    closePanel(true);
  });
  const onOutside = guard((event) => {
    if (!panel) return;
    if (panel.el.contains(event.target) || (panel.record.tile && panel.record.tile.contains(event.target))) return;
    closePanel(false);
  });
  const onPanelScroll = guard(() => {
    if (!panel || !panel.record.tile) return;
    const tile = panel.record.tile.getBoundingClientRect();
    if (tile.bottom < 0 || tile.top > innerHeight || tile.right < 0 || tile.left > innerWidth) closePanel(false);
    else positionPanel();
  });

  function openPanel(record, focusInside) {
    const held = entryOf(record);
    const entry = held && held.entry;
    if (!entry || !record.tile || !record.tile.isConnected) return;
    if (panel && panel.record === record) {
      clearTimeout(panel.timer);
      if (focusInside) focusFirst();
      return;
    }
    closePanel(false);
    const state = { record, entry, mode: "start", el: null, timer: 0, overTile: true, overPanel: false };
    const pick = (mode) => {
      if (!panel || panel !== state) return;
      state.mode = mode;
      const fresh = panelBig(entry, mode);
      state.el.querySelector(".sfx-big").replaceWith(fresh); // only the number changes, so the buttons keep the focus
      for (const button of state.el.querySelectorAll(".sfx-seg button")) button.setAttribute("aria-pressed", String(button.getAttribute("data-mode") === mode));
    };
    state.el = panelNode(entry, "start", pick, planFor(record, entry), () => { if (panel === state) positionPanel(); });
    state.el.addEventListener("pointerenter", guard(() => { state.overPanel = true; clearTimeout(state.timer); }));
    state.el.addEventListener("pointerleave", guard(() => { state.overPanel = false; scheduleClose(); }));
    state.el.addEventListener("focusout", guard(() => scheduleClose()));
    panel = state;
    document.body.append(state.el);
    record.tile.setAttribute("aria-expanded", "true");
    positionPanel();
    document.addEventListener("keydown", onPanelKey, true);
    document.addEventListener("pointerdown", onOutside, true);
    window.addEventListener("scroll", onPanelScroll, true);
    window.addEventListener("resize", onPanelScroll, true);
    if (focusInside) focusFirst();
  }

  function focusFirst() {
    const first = panel && panel.el.querySelector(".sfx-seg button");
    if (first) first.focus({ preventScroll: true });
  }

  /** The tile is the one thing on the card that answers the pointer, and all it does is open the panel. */
  function wire(record, drawn) {
    if (!drawn.interactive) return;
    const tile = drawn.node;
    tile.addEventListener("pointerenter", guard(() => {
      openPanel(record, false);
      if (panel && panel.record === record) panel.overTile = true;
    }));
    tile.addEventListener("pointerleave", guard(() => {
      if (panel && panel.record === record) panel.overTile = false;
      scheduleClose();
    }));
    tile.addEventListener("focus", guard(() => { if (!record.quiet) openPanel(record, false); }));
    tile.addEventListener("blur", guard(() => scheduleClose()));
    tile.addEventListener("click", guard((event) => {
      event.preventDefault(); // the card underneath is not selected by a press on this tile
      event.stopPropagation();
      openPanel(record, false);
    }));
    tile.addEventListener("keydown", guard((event) => {
      if (!["Enter", " ", "ArrowRight", "ArrowLeft", "ArrowDown"].includes(event.key)) return;
      event.preventDefault();
      event.stopPropagation();
      openPanel(record, true);
    }));
  }

  // -- placing ----------------------------------------------------------------------------------------------------

  /** Draws, updates or removes one card's tile. Returns true when it needs another pass to be placed. */
  function placeTile({ record, rect, tier, size, ribs, box, at, top, rank }) {
    const drawn = tier === "skip" ? null : build(record, tier, size, rank);
    if (!drawn) {
      if (record.ribs) record.ribs.remove();
      record.ribs = null;
      record.sig = "";
      record.tile = null;
      return false;
    }
    let target = ribs;
    let created = false;
    if (!target || record.sig !== drawn.sig) {
      if (panel && panel.record === record) closePanel(false); // the tile it belongs to is being replaced
      if (!target) {
        target = document.createElement("span");
        target.setAttribute("data-sfx", "");
        target.setAttribute("data-pending", ""); // hidden until it has been placed, so it never flashes in the corner
        record.media.parentElement.append(target);
        record.ribs = target;
        created = true;
      }
      target.className = `sfx-ribs sfx-ribs--${tier}`;
      target.replaceChildren(drawn.node, ...drawn.marks);
      record.sig = drawn.sig;
      record.tile = drawn.node;
      wire(record, drawn);
      created = true; // a new tile is measured on the next pass, the same as a new wrapper
    }
    if (box && at && !created) {
      // Sorare's layout decides where an absolutely placed box starts, so the tile is moved by how far it is from
      // where it should be, rather than worked out from their styles.
      const dx = rect.left + INSET[size].x - box.left;
      const dy = top - box.top;
      if (Math.abs(dx) > 0.5) target.style.left = `${at.left + dx}px`;
      if (Math.abs(dy) > 0.5) target.style.top = `${at.top + dy}px`;
      target.removeAttribute("data-pending");
    }
    return created || !box;
  }

  /** Sofix's win and clean sheet directly under Sorare's own bar, with room made for it. */
  function placeOdds(read) {
    const { record, odds } = read;
    const held = entryOf(record);
    const game = held && held.entry && held.entry.game;
    if (read.tier !== "full" || !game || !odds) {
      removeOdds(record);
      return false;
    }
    if (odds.crowded) {
      removeOdds(record);
      record.crowded = pageEpoch; // the margin did not clear the room here: leave it be until the page changes
      return false;
    }
    if (record.roomBar !== odds.bar) {
      releaseBar(record);
      odds.bar.classList.add("sfx-room");
      record.roomBar = odds.bar;
    }
    const drawn = buildOdds(game);
    let row = odds.row;
    let created = false;
    if (!row) {
      row = document.createElement("span");
      row.setAttribute("data-sfx", "");
      row.setAttribute("data-pending", "");
      odds.bar.parentElement.append(row);
      record.odds = row;
      created = true;
    }
    if (record.oddsSig !== drawn.sig || created) {
      row.className = "sfx-odds";
      row.setAttribute("role", "group");
      row.setAttribute("aria-label", drawn.label);
      row.replaceChildren(...drawn.nodes);
      record.oddsSig = drawn.sig;
    }
    if (odds.box && odds.at) {
      const width = `${odds.barRect.width}px`;
      if (row.style.width !== width) row.style.width = width;
      const dx = odds.barRect.left - odds.box.left;
      const dy = odds.barRect.bottom + ODDS_GAP - odds.box.top;
      if (Math.abs(dx) > 0.5) row.style.left = `${odds.at.left + dx}px`;
      if (Math.abs(dy) > 0.5) row.style.top = `${odds.at.top + dy}px`;
      row.removeAttribute("data-pending");
    }
    return created || !odds.box;
  }

  let headsAt = 0;
  let heads = [];
  /**
   * The titles of the lists to pick from ("Select your Defender"), wherever the page puts them: a heading element when it
   * uses one, otherwise any text that says so, since Sorare's title is styled text and may be a plain div (or split over two
   * nodes: the text that starts it is enough). Looked for at most twice a second, as a page can hold thousands of text nodes.
   */
  function pickHeadings() {
    if (now() - headsAt < 500 && heads.every((el) => el.isConnected)) return heads;
    headsAt = now();
    const found = new Set();
    for (const el of document.querySelectorAll("h1, h2, h3, h4, [role=heading]")) if (core.isPickHeading(el.textContent)) found.add(el);
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    for (let text = walker.nextNode(); text; text = walker.nextNode()) {
      if (text.data.length > 40 || !core.isPickHeading(text.data)) continue;
      const el = text.parentElement;
      if (el && !el.closest("[data-sfx], script, style")) found.add(el);
    }
    heads = [...found];
    return heads;
  }

  /**
   * The best three cards of a list to pick from, worked out from what is on screen (no new data): the list is the cards as
   * wide as the first one under a "Select your ..." heading, up to the next such heading, and needs four or more. Without
   * that heading nothing is ranked, so a gallery of cards never grows a "#1".
   */
  function rankings(reads) {
    const ranks = new Map();
    const heads = pickHeadings()
      .map((h) => h.getBoundingClientRect())
      .filter((r) => r.width > 0 && r.height > 0)
      .sort((a, b) => a.top - b.top);
    if (!heads.length) return ranks;
    const cards = reads.filter((r) => r.tier === "full" && entryOf(r.record) && entryOf(r.record).entry);
    heads.forEach((head, i) => {
      const limit = heads[i + 1] ? heads[i + 1].top : Infinity;
      const below = cards.filter((c) => c.rect.top >= head.bottom - 4 && c.rect.top < limit);
      if (below.length < 4) return;
      const first = below.reduce((a, b) => (b.rect.top < a.rect.top - 2 || (Math.abs(b.rect.top - a.rect.top) <= 2 && b.rect.left < a.rect.left) ? b : a));
      const list = below.filter((c) => Math.abs(c.rect.width - first.rect.width) <= 2);
      for (const [record, place] of core.topThree(list.map((c) => ({ key: c.record, x: entryOf(c.record).entry.x })))) ranks.set(record, place);
    });
    return ranks;
  }

  function paint() {
    const drawing = [];
    for (const record of live) {
      if (!record.media.isConnected) {
        forget(record);
        continue;
      }
      if (record.ident === "done" && record.visible) drawing.push(record);
    }

    // Read every measurement first, then write every change: alternating the two makes a page of 200 cards stutter.
    const reads = drawing.map((record) => {
      const rect = record.media.getBoundingClientRect();
      const tier = core.surfaceOf(rect.width, rect.height, isRound(record.media, rect));
      const size = tier === "compact" && rect.width < TINY_UNDER ? "tiny" : tier;
      const ribs = record.ribs && record.ribs.isConnected ? record.ribs : null;
      const box = ribs ? ribs.getBoundingClientRect() : null;
      const read = {
        record,
        rect,
        tier,
        size,
        ribs,
        box,
        at: ribs ? { left: parseFloat(ribs.style.left) || 0, top: parseFloat(ribs.style.top) || 0 } : null,
        top: tier === "skip" || !box ? rect.top + INSET.full.y : clearOfCached(record, rect, size, box.width, box.height),
        odds: null,
      };
      const held = entryOf(record);
      if (tier === "full" && held && held.entry && held.entry.game && record.crowded !== pageEpoch) {
        const bar = barFor(record, rect);
        if (bar) {
          const row = record.odds && record.odds.isConnected ? record.odds : null;
          const barRect = bar.getBoundingClientRect();
          read.odds = {
            bar,
            barRect,
            row,
            box: row ? row.getBoundingClientRect() : null,
            at: row ? { left: parseFloat(row.style.left) || 0, top: parseFloat(row.style.top) || 0 } : null,
            crowded: Boolean(row) && record.roomBar === bar && !roomIsFree(bar, barRect, rect),
          };
        }
      }
      return read;
    });

    const ranks = rankings(reads);
    for (const read of reads) read.rank = ranks.get(read.record) || 0;

    let again = false;
    for (const read of reads) {
      try {
        if (placeTile(read)) again = true;
        if (placeOdds(read)) again = true;
      } catch {
        // one card that will not take a tile must not stop the others
      }
    }
    if (again) schedule();
    report();
  }

  // -- the loop --------------------------------------------------------------------------------------------------

  function schedule() {
    if (!enabled || frame) return;
    frame = requestAnimationFrame(guard(pass));
  }

  /** A page that moves to another gameweek (Sorare changes the address without a reload) must not keep the last one's numbers. */
  function watchFixture() {
    const here = core.fixtureOf(location.href);
    if (here === fixtureNow) return;
    fixtureNow = here;
    numbers.clear();
    asking.clear();
    liveByMatch.clear(); // another gameweek's matches are not these
    liveKey = "";
    for (const record of live) clearDrawn(record); // off the screen too: a card scrolled into view later must not show the last week's
    pageEpoch += 1;
    lastReport = "";
  }

  function pass() {
    frame = 0;
    if (!enabled) return;
    watchFixture();
    if (scan) {
      scan = false;
      discover();
    }
    identify().catch(() => {}); // asks the bridge; its answer draws on a later pass
    wantNumbers();
    paint();
  }

  let lastReport = "";
  let reportTimer = 0;
  /** Cards seen on this page and how many were recognised: the popup shows it, so a changed Sorare is visible, not silent. */
  function report() {
    if (reportTimer) return;
    reportTimer = setTimeout(
      guard(() => {
        reportTimer = 0;
        if (!enabled) return;
        let seen = 0;
        let matched = 0;
        for (const record of live) {
          if (!record.visible) continue; // a card in a closed menu is not on the page yet
          seen += 1;
          if (record.ident === "done") matched += 1;
        }
        const text = `${seen}/${matched}/${fixtureNow || ""}`;
        if (text === lastReport) return;
        lastReport = text;
        try {
          chrome.runtime.sendMessage({ type: "overlay-stats", seen, matched, fixture: fixtureNow }, () => void chrome.runtime.lastError);
        } catch {
          dead = true;
        }
      }),
      2000,
    );
  }

  function start() {
    if (enabled || dead) return;
    enabled = true;
    scan = true;
    visibility = new IntersectionObserver(
      guard((entries) => {
        for (const entry of entries) {
          const record = records.get(entry.target);
          if (record && record.live) record.visible = entry.isIntersecting;
        }
        schedule();
      }),
      { rootMargin: "300px" },
    );
    resizing = new ResizeObserver(guard(schedule));
    // Our own ribbons being drawn are not news: only what the page itself added or changed asks for another look.
    const ours = (node) => node.nodeType === 1 && (node.hasAttribute("data-sfx") || Boolean(node.closest("[data-sfx]")));
    const theirs = (change) =>
      change.type === "attributes"
        ? !ours(change.target)
        : !ours(change.target) && [...change.addedNodes, ...change.removedNodes].some((node) => !ours(node));
    mutations = new MutationObserver(
      guard((list) => {
        if (!list.some(theirs)) return;
        pageEpoch += 1;
        if (list.some((change) => change.type === "attributes" || change.addedNodes.length)) scan = true;
        schedule();
      }),
    );
    mutations.observe(document, { childList: true, subtree: true, attributes: true, attributeFilter: ["src", "srcset", "poster", "alt"] });
    window.addEventListener("message", onBridge);
    window.addEventListener("popstate", schedule); // back and forward change the address: the gameweek it names may have too
    liveTimer = setInterval(guard(() => wantLive(true)), LIVE_POLL_MS);
    schedule();
  }

  function stop() {
    if (!enabled) return;
    enabled = false;
    if (mutations) mutations.disconnect();
    if (visibility) visibility.disconnect();
    if (resizing) resizing.disconnect();
    mutations = visibility = resizing = null;
    window.removeEventListener("message", onBridge);
    window.removeEventListener("popstate", schedule);
    if (frame) cancelAnimationFrame(frame);
    frame = 0;
    clearTimeout(askTimer);
    askTimer = 0;
    clearInterval(liveTimer);
    liveTimer = 0;
    liveAsking = false;
    liveKey = "";
    liveByMatch.clear();
    for (const record of [...live]) forget(record);
    live.clear();
    asking.clear();
    lastReport = "";
    clearTimeout(reportTimer);
    reportTimer = 0;
    closePanel(false);
    document.querySelectorAll("[data-sfx]").forEach((el) => el.remove());
    document.querySelectorAll(".sfx-room").forEach((el) => el.classList.remove("sfx-room"));
  }

  // The bridge learned more cards from the page's own answers: cards it could not name a moment ago may be known now.
  const onBridge = guard((event) => {
    if (event.source !== window || !event.data || event.data.source !== "sofix-bridge-4" || event.data.type !== "cards") return;
    for (const record of live) {
      if (record.ident === "new") {
        record.nextTry = 0;
        record.tries = Math.min(record.tries, IDENTIFY_TRIES - 2);
      }
    }
    schedule();
  });

  // -- the switch ------------------------------------------------------------------------------------------------
  // The popup's "Scores on sorare.com" writes `overlay` to storage; flipping it adds or removes the tiles at once.

  const apply = guard((value) => (value === false ? stop() : start()));
  try {
    chrome.storage.sync.get({ overlay: true }).then(
      ({ overlay }) => apply(overlay),
      () => apply(true),
    );
    chrome.storage.onChanged.addListener((changes, area) => {
      if (area === "sync" && changes.overlay) apply(changes.overlay.newValue);
    });
  } catch {
    apply(true);
  }
})();
