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
  const EMPTY_TTL_MS = 3 * 60 * 1000; // "nothing on him", as the background keeps it: asked again sooner (9 Nov 2026)
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
  let boardNow = core.composeBoard(location.pathname); // the leaderboard of the lineup builder the page is, else null
  let teamNow = null; // that builder's board as the team gauge needs it (lib/overlay.ts OverlayTeam), from the app

  const now = () => Date.now();
  // Reloading the extension leaves this script running in an open tab with nothing to talk to, and the worker puts a fresh copy
  // beside it. The page names the copy that started last, so an old one leaving takes only its own drawings with it (2 Nov 2026:
  // the old copy's sweep took the new one's tiles off the GW29 builder minutes after a release).
  const ME = Math.random().toString(36).slice(2);
  const alive = () => {
    try {
      return Boolean(chrome.runtime && chrome.runtime.id);
    } catch {
      return false;
    }
  };
  /** Names this copy as the page's overlay: always when it starts, and on a pass only if the page had no root to name it on then. */
  const claim = (always) => {
    const root = document.documentElement;
    if (root && (always || !root.hasAttribute("data-sfx-run"))) root.setAttribute("data-sfx-run", ME);
  };

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
      const linked = hit && hit.cardSlug ? null : slugFromLink(record.media);
      if (hit && (hit.cardSlug || hit.playerSlug)) {
        record.cardSlug = hit.cardSlug || linked; // known by name only: the card's own link still says which card it is
        record.playerSlug = hit.playerSlug || null;
        record.ident = "done";
        oddsDue = true;
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

  // Sorare's own start chance as the page itself received it (the badge at a card's foot), by player. The bridge keeps it per game
  // and answers only for a player with one game on the page. Asked again whenever the page has answered something new.
  const pageOdds = new Map();
  let oddsDue = true;
  async function readOdds() {
    const players = [...new Set([...live].map((r) => r.playerSlug).filter(Boolean))];
    if (!oddsDue || !players.length) return;
    oddsDue = false;
    const answer = await askBridge({ type: "odds", players: players.slice(0, 200) }, 3000);
    if (!answer || answer.state !== "ok" || !answer.odds) return;
    let changed = false;
    for (const [slug, p] of Object.entries(answer.odds)) {
      if (typeof p === "number" && pageOdds.get(slug) !== p) {
        pageOdds.set(slug, p);
        changed = true;
      }
    }
    if (changed) schedule();
  }

  // -- the numbers -----------------------------------------------------------------------------------------------

  /**
   * Numbers belong to the player, so his own slug is asked for when it is known; otherwise the card's. On a lineup page a card is
   * about the game Sorare put in that lineup (plans/overlay-v2.md 1.7), so its game goes with it: "p:slug@Game:id".
   */
  const slugOf = (record) => {
    const base = record.playerSlug ? `p:${record.playerSlug}` : record.cardSlug ? `c:${record.cardSlug}` : null;
    const game = base && gameHint(record);
    return game ? `${base}@${game}` : base;
  };

  function entryOf(record) {
    const slug = slugOf(record);
    const held = slug && numbers.get(slug);
    return held && now() - held.at < (held.entry ? NUMBERS_TTL_MS : EMPTY_TTL_MS) ? withLive(held) : null;
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
    // One game per player in a call (a player in two lineups of different games is asked twice, one call after the other).
    const batch = [];
    const bases = new Set();
    const baseOf = (key) => key.split("@")[0];
    for (const key of asking) {
      if (bases.has(baseOf(key))) continue;
      bases.add(baseOf(key));
      batch.push(key);
      if (batch.length >= 120) break;
    }
    const cards = batch.filter((s) => s.startsWith("c:")).map((s) => baseOf(s).slice(2));
    const players = batch.filter((s) => s.startsWith("p:")).map((s) => baseOf(s).slice(2));
    const games = Object.fromEntries(batch.filter((s) => s.includes("@")).map((s) => [baseOf(s), s.slice(s.indexOf("@") + 1)]));
    sending = true;
    const askedFor = fixtureNow;
    const askedBoard = boardNow;
    try {
      chrome.runtime.sendMessage({ type: "overlay-numbers", cards, players, fixture: askedFor, games, board: askedBoard }, (reply) => {
        sending = false;
        if (askedFor !== fixtureNow || askedBoard !== boardNow) {
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
            const rest = reply.state === "auth" ? 30000 : 10000; // as long as the background rests from the app
            downUntil = now() + rest;
            setTimeout(guard(schedule), rest + 500);
          } else {
            appState = "ok";
            if (reply.team) teamNow = reply.team;
            for (const key of batch) numbers.set(key, { at: now(), entry: (key[0] === "c" ? reply.cards : reply.players)[baseOf(key).slice(2)] || null });
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
  const INSET = { full: { x: 6, y: 6 }, narrow: { x: 5, y: 5 }, compact: { x: 4, y: 4 }, tiny: { x: 3, y: 3 } }; // how far in from the picture's top-left corner the tile sits
  const TINY_UNDER = 80; // a card narrower than this (a bench thumbnail) gets the smallest tile
  const NARROW_UNDER = 130; // a full card narrower than this (Sorare's builder list, 118 px) gets the tighter chips
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

  /** One of Sorare's own colour tokens, read from the page (kept 10 s like the score colours), else its measured value. */
  const pageTokens = new Map();
  function token(name, fallback) {
    const held = pageTokens.get(name);
    if (held && now() - held.at < 10000) return held.value;
    const read = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
    const value = /^#[0-9a-f]{6}$/i.test(read) ? read : fallback;
    pageTokens.set(name, { at: now(), value });
    return value;
  }
  const startColour = (level) => token(...core.START_COLOURS[level]);

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

  /** Everything the tile and the panel say about one answer, worked out once. `onPage`: Sorare's own start chance, from the page. */
  function facts(entry, onPage) {
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
      games: core.gamesCount(entry),
      apart: core.startDisagreement(entry, onPage),
      title: core.startTitle(entry, onPage),
    };
  }

  /** The tile's name for a screen reader: the same things it shows, in words. */
  function describe(f, more = []) {
    const said = [f.split ? `Sofix: ${f.score} if he starts.` : `Sofix: expected score ${f.score}.`];
    if (f.games > 1) said.push(`${f.games} games this week, best score chosen.`); // Sorare's own words for which one counts
    if (f.game) said.push(`Difficulty ${Math.round(f.game.difficulty)} of 100, ${f.game.label.toLowerCase()}.`);
    const from = f.source ? ` (${core.SOURCE_SHORT[f.source]})` : "";
    said.push(f.doubt ? `He starts only ${core.chanceLabel(f.startChance)} of the time${from}.` : `He starts ${core.chanceLabel(f.startChance)} of the time${from}.`);
    if (f.apart) said.push(`Sorare says ${core.chanceLabel(f.apart.sorare)}: they disagree.`);
    return [...said, ...more].join(" ");
  }

  // -- the tile ---------------------------------------------------------------------------------------------------

  const STALE_INK = "#a3a3ab"; // the score of a number that no longer holds: the colour goes, the number stays

  /** What the best plan does with this very card (a copy of the player, by its slug), or null: a card it leaves out has nothing. */
  function planFor(record, entry) {
    return (record.cardSlug && entry.inPlan && entry.inPlan[record.cardSlug]) || null;
  }

  /** What to draw on a card of this size: a signature (to skip redrawing what has not changed), the node, its name. */
  function build(record, tier, size) {
    const slug = slugOf(record);
    const held = entryOf(record);
    const entry = held && held.entry;
    if (entry) return buildTile(record, tier, size, entry);
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
      return { sig: `${tier}|tag|${appState}`, node: tag, label, interactive: false };
    }
    const empty = slug && numbers.has(slug) && !numbers.get(slug).entry; // nothing last time: asked again without a skeleton flashing
    if (slug && asking.has(slug) && !empty) {
      const tile = node("span", `sfx-tile sfx-tile--loading${tier === "compact" ? " sfx-tile--compact" : ""}${size === "tiny" ? " sfx-tile--tiny" : ""}${size === "narrow" ? " sfx-tile--narrow" : ""}`);
      tile.setAttribute("role", "img");
      tile.setAttribute("aria-label", "Sofix numbers loading");
      tile.append(node("span", "sfx-chip sfx-chip--x sfx-chip--skel"));
      if (tier === "full") tile.append(node("span", "sfx-chip sfx-chip--fdr sfx-chip--skel"));
      return { sig: `${size}|loading`, node: tile, label: "Sofix numbers loading", interactive: false };
    }
    return null;
  }

  function buildTile(record, tier, size, entry) {
    const f = facts(entry, record.playerSlug ? pageOdds.get(record.playerSlug) : undefined);
    const stale = core.staleness(entry, now());
    const scoreColour = stale ? STALE_INK : colour(core.scoreLevel(f.score));
    const fdr = tier === "full" && f.game ? Math.round(f.game.difficulty) : null;
    const fdrColour = fdr === null ? "" : stale ? STALE_INK : colour(core.fdrLevel(f.game.bucket));
    const why = stale ? (stale.kind === "over" ? "His game has started: these numbers were about a game no longer ahead." : `These numbers are ${stale.hours} h old.`) : "";
    const label = describe(f, why ? [why] : []);
    const sig = [size, f.score, f.split, f.startChance, f.tone, f.source, f.title, entry.live && entry.startAt, fdr, scoreColour, fdrColour, why].join("|");

    const score = node("b", "sfx-chip sfx-chip--x sfx-score", String(f.score));
    score.style.background = scoreColour;
    const narrow = size === "narrow";
    const tile = node(tier === "compact" ? "span" : "button", `sfx-tile${tier === "compact" ? " sfx-tile--compact" : ""}${size === "tiny" ? " sfx-tile--tiny" : ""}${narrow ? " sfx-tile--narrow" : ""}${stale ? " sfx-tile--stale" : ""}`);
    tile.append(score);
    if (why) tile.title = why; // an out-of-date number goes grey; the reason is on hover, no "Old" written on the card
    if (tier === "compact") {
      tile.setAttribute("role", "img");
      tile.setAttribute("aria-label", label);
      return { sig, node: tile, label, interactive: false };
    }
    tile.type = "button"; // the one thing on the card that answers the pointer: it opens the panel and nothing else
    tile.setAttribute("aria-label", label);
    tile.setAttribute("aria-haspopup", "dialog");
    tile.setAttribute("aria-expanded", "false");
    if (fdr !== null) {
      const chip = node("span", "sfx-chip sfx-chip--fdr");
      chip.style.background = fdrColour;
      chip.append(node("b", "sfx-fdr", String(fdr)), node("small", "", "FDR"));
      tile.append(chip);
    }
    return { sig, node: tile, label, interactive: true };
  }

  /**
   * Where the tile goes down the card's left edge. Sorare draws its own chips there on some cards (a season badge, a
   * serial number), and they differ per card, so this looks at what is actually under the strip the tile would take
   * and starts below it. Found by position and size, never by what anything is called: a backdrop or a card-sized
   * link is not a chip; a small box in the strip is.
   */
  function clearOf(media, rect, size, width, height, start) {
    const wanted = rect.top + start.y;
    // Every 12px down the band, so a chip smaller than the band cannot sit between two of the lines that are looked along.
    const rows = (top) => {
      const ys = [];
      for (let y = top + 2; y < top + height - 2; y += 12) ys.push(y);
      ys.push(top + height - 2);
      return ys;
    };
    const limit = rect.top + rect.height * 0.45; // never sink into the player's face to get out of the way
    const left = rect.left + start.x;
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
            if (el === media || el.contains(media) || media.contains(el) || el.closest("[data-sfx],[data-sfx-dock]")) continue;
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

  /**
   * `clearOf`, the costly probe, once per card size, tile size and page change (plans/overlay-v2.md 3b.2): kept as an offset from
   * the card's top, so a scroll reuses it. Probed only with the card wholly on screen (the probe cannot see past the edges).
   */
  // The probes' share of a pass (3b.8): past it, a card not probed yet waits for the next frame (its tile stays hidden till then),
  // so a page that shows forty new cards at once spreads their probes over a few frames instead of freezing one.
  const PROBE_BUDGET_MS = 8;
  let passStarted = 0;
  let budgetHit = false;
  function overBudget() {
    if (performance.now() - passStarted < PROBE_BUDGET_MS) return false;
    budgetHit = true;
    return true;
  }

  function clearOfCached(record, rect, size, width, height) {
    const key = `${[rect.width, rect.height, width, height].map(Math.round).join("|")}|${size}|${pageEpoch}`;
    const whole = rect.top >= 0 && rect.left >= 0 && rect.bottom <= innerHeight && rect.right <= innerWidth;
    if (record.bandKey !== key && (whole || record.bandOffset === undefined)) {
      if (overBudget()) return record.bandOffset === undefined ? null : rect.top + record.bandOffset; // the next pass probes it
      record.bandKey = whole ? key : "";
      record.bandOffset = clearOf(record.media, rect, size, width, height, tileStart(record, size)) - rect.top;
    }
    return rect.top + record.bandOffset;
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
    const key = [Math.round(rect.width), Math.round(rect.height), pageEpoch].join("|");
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
  /** `roomIsFree`, asked again only when the card's size or the page changes (3b.3). */
  function roomFree(record, bar, barRect, mediaRect) {
    const key = `${Math.round(mediaRect.width)}|${pageEpoch}`;
    if (record.roomKey !== key || record.roomFor !== bar) {
      // kept only when the place it looks at is on screen: off it, the probe sees nothing and would call the room free
      const seen = barRect.left >= 0 && barRect.right <= innerWidth && barRect.bottom + ODDS_GAP + 12 <= innerHeight && barRect.top >= 0;
      record.roomKey = seen ? key : "";
      record.roomFor = bar;
      record.roomOk = roomIsFree(bar, barRect, mediaRect);
    }
    return record.roomOk;
  }

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
    if (record.need) record.need.remove();
    record.need = null;
    if (record.start) record.start.remove();
    record.start = null;
    if (record.captain) record.captain.remove();
    record.captain = null;
    if (record.price) record.price.remove();
    record.price = null;
    dropCrest(record);
    removeOdds(record);
  }

  // -- the panel beside the card -----------------------------------------------------------------------------------

  const PANEL_WIDTH = 290;
  const scoreColourOf = (score) => colour(core.scoreLevel(score));

  /** The number and its words: the score if he starts (or if he is benched), and the chance of that with whose number it is. */
  function panelBig(entry, mode) {
    const f = facts(entry);
    const starts = mode === "start" || !f.split;
    const comes = core.comesOnScore(entry);
    const score = starts ? f.score : comes.score;
    const big = node("div", "sfx-big");
    big.style.setProperty("--sfx-c", scoreColourOf(score));
    const line = node("div", "sfx-num");
    line.append(node("strong", "", String(score)), node("span", "", f.split ? (starts ? "if he starts" : comes.words) : "expected score"));
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

  /** The Starts side under its hero (1.3): his expected decisive actions and the chance of one if he starts. */
  function startCells(entry) {
    const grid = node("div", "sfx-stats sfx-stats--two");
    const cells = [
      ["XD", typeof entry.xd === "number" ? entry.xd.toFixed(2) : "—", "Expected decisive actions in his game"],
      ["DECISIVE", typeof entry.decisive === "number" ? core.chanceLabel(entry.decisive) : "—", "The chance of a decisive action if he starts"],
    ];
    for (const [key, value, title] of cells) {
      const cell = node("div", "sfx-stat");
      cell.title = title;
      cell.append(node("span", "", key), node("b", value === "—" ? "sfx-stat--none" : "", value));
      grid.append(cell);
    }
    return grid;
  }

  /**
   * The Comes on side (1.3, 1.6): the chance he comes on from his last ten games as the hero, with what Sofix uses today beside it
   * when that differs; a bar of his minutes in each game, oldest first (started green, came on yellow, unused grey); the four
   * numbers. With no record, the old number and its words.
   */
  function comesNode(entry) {
    const record = core.comesOnRecord(entry);
    const box = node("div", "sfx-comes");
    if (!record) {
      box.append(panelBig(entry, "bench"));
      return box;
    }
    const big = node("div", "sfx-big");
    const line = node("div", "sfx-num");
    line.append(node("strong", "", record.p === null ? "—" : core.chanceLabel(record.p)), node("span", "", record.p === null ? "never on the bench lately" : "comes on"));
    big.append(line);
    if (record.p !== null && typeof entry.benchedOn === "number" && Math.abs(entry.benchedOn - record.p) >= 0.01) {
      const was = node("div", "sfx-was");
      was.title = "The rate Sofix's plans use today, from his last five games and his position's norm";
      was.append(node("b", "", core.chanceLabel(entry.benchedOn)), node("span", "", "SOFIX TODAY"));
      big.append(was);
    }
    box.append(big);
    const bars = node("div", "sfx-mins");
    bars.setAttribute("role", "img");
    bars.setAttribute("aria-label", `Minutes in his last ${record.bars.length} games, oldest first: ${record.bars.map((b) => (b.kind === "started" ? `${b.mins} started` : String(b.mins))).join(", ")}`);
    record.bars.forEach((bar, i) => {
      const one = node("i", `sfx-mins--${bar.kind}`);
      one.style.height = `${bar.h}%`;
      one.style.animationDelay = `${i * 40}ms`;
      one.title = bar.kind === "unused" ? "Unused" : `${bar.mins}′ ${bar.kind === "started" ? "started" : "off the bench"}`;
      bars.append(one);
    });
    const axis = node("div", "sfx-mins-axis");
    axis.append(node("span", "", `last ${record.bars.length} games`));
    const four = node("div", "sfx-stats sfx-stats--four");
    for (const [key, value] of [["STARTED", record.started], ["CAME ON", record.on], ["UNUSED", record.unused], ["MIN ON", record.minsOn === null ? "—" : `${record.minsOn}′`]]) {
      const cell = node("div", "sfx-stat");
      cell.append(node("span", "", key), node("b", value === "—" ? "sfx-stat--none" : "", String(value)));
      four.append(cell);
    }
    box.append(bars, axis, four);
    return box;
  }

  /** The side the switch is on, in one box swapped when it changes. */
  function sideNode(entry, mode) {
    const box = node("div", "sfx-side");
    if (mode === "bench") box.append(comesNode(entry));
    else box.append(panelBig(entry, "start"), startCells(entry));
    return box;
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
    if (f.split || entry.benchRecord) {
      const seg = node("div", "sfx-seg");
      seg.setAttribute("role", "group");
      seg.setAttribute("aria-label", "Show him when he");
      for (const [key, text] of [["start", "Starts"], ["bench", "Comes on"]]) {
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
    body.append(sideNode(entry, mode));
    const alert = alertNode(entry);
    if (alert) body.append(alert);
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
    // During his game, a player left on the bench opens on Comes on (1.6, "live for a benched player").
    const benchedNow = core.crestState(entry, now()).kind === "live" && entry.live && typeof entry.pStart === "number" && entry.pStart < 0.05;
    const first = benchedNow && (entry.benchRecord || facts(entry).split) ? "bench" : "start";
    const state = { record, entry, mode: first, el: null, timer: 0, overTile: true, overPanel: false };
    const pick = (mode) => {
      if (!panel || panel !== state) return;
      state.mode = mode;
      state.el.querySelector(".sfx-side").replaceWith(sideNode(entry, mode)); // only the side changes, so the buttons keep the focus
      positionPanel();
      for (const button of state.el.querySelectorAll(".sfx-seg button")) button.setAttribute("aria-pressed", String(button.getAttribute("data-mode") === mode));
    };
    state.el = panelNode(entry, first, pick, planFor(record, entry), () => { if (panel === state) positionPanel(); });
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


  // -- the crest above each card and its island (plans/overlay-v2.md 1.2, step 2) -------------------------------------
  // The opponent's crest sits on the card's top edge, half outside, in a layer of its own on the page (Sorare's boxes clip anything
  // drawn inside them), moved with the card on each pass. Two games: both crests. His game on: the crest with a pulsing red dot. Sure not
  // to play: a dark pill, "Out". No crest from Sorare: a shield in the club's colour with its letters. Hovering or focusing it opens
  // the island above the card: both sides, when, where, and the game's five numbers coloured against the week's games.

  let crestLayer = null;
  let island = null; // the one open island: { record, el, timer }
  const CREST_SIZE = { full: [22, 18], compact: [16, 14] }; // one game, two games (the owner, 3 Nov 2026, twice: smaller than the canvas's 40)
  const PILL_CREST = { full: 16, compact: 14 };

  function crestHome() {
    if (crestLayer && crestLayer.isConnected) return crestLayer;
    crestLayer = document.createElement("div");
    crestLayer.setAttribute("data-sfx", "crests");
    crestLayer.className = "sfx-crests";
    document.body.append(crestLayer);
    return crestLayer;
  }

  /** A club's crest as Sorare gives it, or the shield in its colour with its letters when Sorare has none. */
  function clubMark(crest, name, code, color, size) {
    const shield = () => {
      const made = node("span", "sfx-shield", core.shieldCode({ opponentCode: code, opponent: name }));
      made.style.setProperty("--sfx-club", typeof color === "string" && /^#[0-9a-f]{6}$/i.test(color) ? color : "#2a2537");
      made.style.setProperty("--sfx-size", `${size}px`);
      return made;
    };
    if (!crest) return shield();
    const img = node("img", "sfx-crest-img");
    img.alt = "";
    img.width = size;
    img.height = size;
    img.decoding = "async";
    img.referrerPolicy = "no-referrer";
    img.addEventListener("error", guard(() => img.replaceWith(shield())), { once: true }); // a picture that will not load: the shield (9 Nov 2026)
    img.src = crest;
    return img;
  }

  function gameWords(game) {
    return `${game.venue === "A" ? "at" : "v"} ${game.opponent}, ${core.islandWhen(game.kickoff)}`;
  }

  function buildCrest(record, entry, tier) {
    const state = core.crestState(entry, now());
    if (state.kind === "none") return null;
    const sig = `${state.kind}|${tier}|${state.games.map((g) => `${g.id}:${g.opponentCrest || g.opponentCode}`).join(",")}`;
    if (record.crest && record.crest.isConnected && record.crestSig === sig) return record.crest;
    const button = document.createElement("button");
    button.type = "button";
    button.setAttribute("data-sfx", "crest");
    button.setAttribute("aria-haspopup", "dialog");
    button.setAttribute("aria-expanded", "false");
    button.className = `sfx-crest sfx-crest--${tier} sfx-crest--${state.kind}`;
    if (state.kind === "crests") {
      const size = CREST_SIZE[tier][state.games.length > 1 ? 1 : 0];
      for (const g of state.games) button.append(clubMark(g.opponentCrest, g.opponent, g.opponentCode, g.opponentColor, size));
      button.setAttribute("aria-label", `Sofix: next game ${state.games.map(gameWords).join("; then ")}. Show the game`);
    } else {
      const g = state.games[0];
      // Live: the crest alone with a small pulsing red dot on its corner, no word (the owner, 4 Nov 2026: the pill took too much room).
      button.append(clubMark(g.opponentCrest, g.opponent, g.opponentCode, g.opponentColor, state.kind === "live" ? CREST_SIZE[tier][0] : PILL_CREST[tier]));
      button.append(state.kind === "live" ? node("i", "sfx-live-dot") : node("b", "sfx-out", "Out"));
      button.setAttribute("aria-label", `Sofix: ${state.kind === "live" ? "his game is on" : "sure not to play"}, ${gameWords(g)}. Show the game`);
    }
    if (record.crest) record.crest.remove();
    if (island && island.record === record) closeIsland(false);
    crestHome().append(button);
    record.crest = button;
    record.crestSig = sig;
    wireCrest(record, button);
    return button;
  }

  /** Sorare's own round substitution icon on the card's top edge, when it draws one: the crest then sits to its right. */
  function subIconOf(record, rect) {
    if (record.subIcon && record.subIcon.epoch === pageEpoch) return record.subIcon.el && record.subIcon.el.isConnected ? record.subIcon.el : null;
    let found = null;
    const x = rect.left + rect.width / 2;
    if (rect.top >= 0 && rect.top < innerHeight) {
      for (const el of document.elementsFromPoint(x, rect.top + 1)) {
        if (el === record.media || el.contains(record.media) || el.closest("[data-sfx]")) continue;
        const r = el.getBoundingClientRect();
        if (r.width >= 14 && r.width <= 40 && Math.abs(r.width - r.height) <= 4 && Math.abs(r.left + r.width / 2 - x) <= 8) {
          found = el;
          break;
        }
      }
    }
    record.subIcon = { epoch: pageEpoch, el: found };
    return found;
  }

  const crestPage = () => builderPage() || needPage();

  function dropCrest(record) {
    if (island && island.record === record) closeIsland(false);
    if (record.crest) record.crest.remove();
    record.crest = null;
    record.crestSig = "";
  }

  /** Draws, moves or removes one card's crest. */
  function placeCrest(read) {
    const { record, rect, tier } = read;
    const held = entryOf(record);
    // Only on Sorare's lineup builders and lineup pages (owner, 4 Nov 2026: on the gallery and the other lists it misbehaved), for
    // every card near the screen there (the visibility margin), so one scrolled in already has its crest.
    const shown = crestPage() && !read.covered && (tier === "full" || tier === "compact") && held && held.entry && rect.width > 0;
    const button = shown ? buildCrest(record, held.entry, tier) : null;
    if (!button) {
      dropCrest(record);
      return;
    }
    const icon = subIconOf(record, rect);
    record.crestDx = (icon ? icon.getBoundingClientRect().right + 4 : rect.left + rect.width / 2) - rect.left;
    button.classList.toggle("sfx-crest--beside", Boolean(icon));
    setCrest(record, rect, read.crestHidden);
  }

  function setCrest(record, rect, hidden) {
    const button = record.crest;
    button.style.left = `${Math.round(rect.left + record.crestDx)}px`;
    button.style.top = `${Math.round(rect.top)}px`;
    button.style.visibility = hidden ? "hidden" : "";
    if (island && island.record === record) positionIsland();
  }

  /**
   * The card's own box (the picture's ancestors not much bigger than it), found once: what sits at the card's top edge belongs to
   * it unless something of the page's lies over it there.
   */
  function blockOf(record, rect) {
    if (record.block && record.block.isConnected && record.block.contains(record.media)) return record.block;
    let block = record.media;
    for (let el = record.media.parentElement, depth = 0; el && el !== document.body && depth < 8; el = el.parentElement, depth += 1) {
      const r = el.getBoundingClientRect();
      if (r.width > rect.width * 1.3 + 8 || r.height > rect.height * 1.6 + 8) break;
      block = el;
    }
    record.block = block;
    return block;
  }

  /**
   * Whether the card's top edge is under something of the page's, a sticky search bar or header (3b.6): the crest, which lives
   * above the page, then hides rather than ride over it. One hit test, at the crest's place.
   */
  function crestCovered(record, rect) {
    const x = rect.left + (record.crestDx === undefined ? rect.width / 2 : record.crestDx);
    const y = rect.top + 3;
    if (x < 0 || x >= innerWidth || y < 0 || y >= innerHeight) return false;
    const block = blockOf(record, rect);
    for (const el of document.elementsFromPoint(x, y)) {
      if (el.closest("[data-sfx]")) continue;
      if (block.contains(el) || el.contains(record.media)) return false;
      // Only a bar (a sticky header or search bar, wider than two cards) hides it: a small box of Sorare's on the card's edge, a
      // slot's frame or a badge, did too and the crest went missing (9 Nov 2026).
      return el.getBoundingClientRect().width > rect.width * 2;
    }
    return false;
  }

  /** A scroll moves the crests and nothing else (3b.1): every card's box is read first, then every crest is written. */
  function moveCrests() {
    moving = 0;
    if (!enabled) return;
    const started = performance.now();
    const reads = [];
    for (const record of live) {
      if (!record.crest || !record.crest.isConnected) continue;
      const rect = record.media.getBoundingClientRect();
      reads.push([record, rect, crestCovered(record, rect)]);
    }
    for (const [record, rect, hidden] of reads) setCrest(record, rect, hidden);
    perf.moves += 1;
    perf.slowestMove = Math.max(perf.slowestMove, performance.now() - started);
  }

  function statCell(label, value, background, title) {
    const cell = node("div", value === null ? "sfx-isl-stat sfx-isl-stat--none" : "sfx-isl-stat");
    if (background && value !== null) cell.style.background = background;
    cell.append(node("span", "", label), node("b", "", value === null ? "–" : value));
    if (title) cell.title = title;
    return cell;
  }

  function islandGame(g) {
    const block = node("div", "sfx-isl-game");
    const mine = [g.teamCrest, g.team || "", null, null];
    const theirs = [g.opponentCrest, g.opponent, g.opponentCode, g.opponentColor];
    const [home, away] = g.venue === "A" ? [theirs, mine] : [mine, theirs];
    const top = node("div", "sfx-isl-top");
    const mid = node("div", "sfx-isl-mid");
    mid.append(node("b", "", core.islandWhen(g.kickoff)), node("span", "", core.competitionName(g.competition)));
    top.append(clubMark(home[0], home[1], home[2], home[3], 40), mid, clubMark(away[0], away[1], away[2], away[3], 40));
    const n = g.game || {};
    const tone = (stat) => (Number.isInteger(g.tones && g.tones[stat]) ? core.SIXTHS[g.tones[stat]] : null);
    const pct = (v) => (typeof v === "number" ? `${Math.round(v * 100)}%` : null);
    const goals = (v) => (typeof v === "number" ? v.toFixed(2) : null);
    const stats = node("div", "sfx-isl-stats");
    stats.append(
      statCell("WIN", pct(n.win), tone("win"), "His side's chance to win"),
      statCell("CS", pct(n.cleanSheet), tone("cleanSheet"), "His side's chance to keep a clean sheet"),
      statCell("XG", goals(n.goalsFor), tone("goalsFor"), "Goals his side is expected to score"),
      statCell("XGA", goals(n.goalsAgainst), tone("goalsAgainst"), "Goals his side is expected to concede"),
      statCell("FDR", typeof n.difficulty === "number" ? String(Math.round(n.difficulty)) : null, colour(core.fdrLevel(n.bucket)), "Difficulty, 0 to 100, lower is easier"),
    );
    block.append(top, stats);
    block.setAttribute("aria-label", `${home[1]} against ${away[1]}, ${core.islandWhen(g.kickoff)}, ${core.competitionName(g.competition)}`);
    return block;
  }

  function positionIsland() {
    if (!island || !island.record.crest) return;
    const r = island.record.crest.getBoundingClientRect();
    const el = island.el;
    const width = el.offsetWidth || 286;
    const height = el.offsetHeight;
    el.style.left = `${Math.round(Math.min(Math.max(8, r.left + r.width / 2 - width / 2), innerWidth - width - 8))}px`;
    el.style.top = `${Math.round(Math.max(8, r.top + r.height / 2 + 20 - height))}px`;
  }

  function openIsland(record, focusInside) {
    const held = entryOf(record);
    const games = held && held.entry && Array.isArray(held.entry.island) ? held.entry.island.slice(0, 2) : [];
    if (!games.length || !record.crest) return;
    if (island && island.record === record) {
      clearTimeout(island.timer);
      if (focusInside) island.el.focus({ preventScroll: true });
      return;
    }
    closeIsland(false);
    const el = node("div", "sfx-island");
    el.setAttribute("data-sfx", "island");
    el.setAttribute("role", "dialog");
    el.setAttribute("aria-label", `Sofix: ${games.map((g) => gameWords(g)).join("; ")}`);
    el.tabIndex = -1;
    for (const g of games) el.append(islandGame(g));
    el.addEventListener("pointerenter", guard(() => island && clearTimeout(island.timer)));
    el.addEventListener("pointerleave", guard(() => scheduleIslandClose()));
    el.addEventListener("focusout", guard(() => scheduleIslandClose()));
    crestHome().append(el);
    island = { record, el, timer: 0 };
    record.crest.setAttribute("aria-expanded", "true");
    positionIsland();
    document.addEventListener("keydown", onIslandKey, true);
    if (focusInside) el.focus({ preventScroll: true });
  }

  function scheduleIslandClose() {
    if (!island) return;
    clearTimeout(island.timer);
    island.timer = setTimeout(guard(() => {
      if (!island) return;
      const crest = island.record.crest;
      const still = island.el.matches(":hover") || island.el.contains(document.activeElement) || (crest && (crest.matches(":hover") || crest === document.activeElement));
      if (!still) closeIsland(false);
    }), 160);
  }

  function closeIsland(returnFocus) {
    if (!island) return;
    const { record, el, timer } = island;
    clearTimeout(timer);
    el.remove();
    island = null;
    document.removeEventListener("keydown", onIslandKey, true);
    if (record.crest) {
      record.crest.setAttribute("aria-expanded", "false");
      if (returnFocus && record.crest.isConnected) {
        record.quietCrest = true; // the focus given back is not a new visit: it does not open the island again
        record.crest.focus({ preventScroll: true });
      }
    }
  }

  const onIslandKey = guard((event) => {
    if (event.key !== "Escape" || !island) return;
    event.preventDefault();
    event.stopPropagation();
    closeIsland(true);
  });

  function wireCrest(record, button) {
    button.addEventListener("pointerenter", guard(() => openIsland(record, false)));
    button.addEventListener("pointerleave", guard(() => scheduleIslandClose()));
    button.addEventListener("focus", guard(() => {
      if (record.quietCrest) record.quietCrest = false;
      else openIsland(record, false);
    }));
    button.addEventListener("blur", guard(() => scheduleIslandClose()));
    button.addEventListener("click", guard((event) => {
      event.preventDefault(); // the card underneath is not selected by a press on its crest
      event.stopPropagation();
      openIsland(record, true); // Escape or moving away closes it
    }));
  }

  // -- placing ----------------------------------------------------------------------------------------------------

  /** Draws, updates or removes one card's tile. Returns true when it needs another pass to be placed. */
  function placeTile({ record, rect, tier, size, ribs, box, at, top }) {
    const drawn = tier === "skip" ? null : build(record, tier, size);
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
        hostOf(record).append(target);
        record.ribs = target;
        created = true;
      }
      target.className = `sfx-ribs sfx-ribs--${tier}`;
      target.replaceChildren(drawn.node);
      record.sig = drawn.sig;
      record.tile = drawn.node;
      wire(record, drawn);
      created = true; // a new tile is measured on the next pass, the same as a new wrapper
    }
    if (top === null) return true; // its place is probed on a later pass: hidden till then
    if (box && at && !created) {
      // Sorare's layout decides where an absolutely placed box starts, so the tile is moved by how far it is from
      // where it should be, rather than worked out from their styles.
      const dx = rect.left + tileStart(record, size).x - box.left;
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

  function paint() {
    const drawing = [];
    for (const record of live) {
      if (!record.media.isConnected) {
        forget(record);
        continue;
      }
      if (record.ident !== "done" || !record.visible) {
        dropCrest(record); // the crest lives on the page, not in the card: a card hidden or scrolled away must not leave it behind
        continue;
      }
      if (onLineupPage(record)) drawing.push(record);
      else if (record.ribs || record.need || record.start || record.crest) clearDrawn(record);
    }

    // Sorare opens a player as a dialog laid over the page (the gallery's ?card=): the cards under it keep their place, so their
    // crests, which live on the page, would float over the dialog.
    const sheets = [...document.querySelectorAll('[role="dialog"], dialog[open], [aria-modal="true"]')]
      .filter((el) => !el.closest("[data-sfx]"))
      .map((el) => ({ el, r: el.getBoundingClientRect() }))
      .filter(({ r }) => r.width > 0 && r.height > 0);
    const underSheet = (media, rect) => {
      const x = rect.left + rect.width / 2;
      // a sheet as tall as the screen covers the cards above and below it too (their crests are drawn just off the screen)
      return sheets.some(({ el, r }) => !el.contains(media) && x >= r.left && x <= r.right && ((rect.top >= r.top && rect.top <= r.bottom) || (r.top <= 0 && r.bottom >= innerHeight)));
    };

    // Read every measurement first, then write every change: alternating the two makes a page of 200 cards stutter.
    const reads = drawing.map((record) => {
      const rect = record.media.getBoundingClientRect();
      const tier = core.surfaceOf(rect.width, rect.height, isRound(record.media, rect));
      const size = tier === "compact" && rect.width < TINY_UNDER ? "tiny" : tier === "full" && rect.width < NARROW_UNDER ? "narrow" : tier;
      const ribs = record.ribs && record.ribs.isConnected ? record.ribs : null;
      const box = ribs ? ribs.getBoundingClientRect() : null;
      const read = {
        record,
        rect,
        covered: sheets.length > 0 && underSheet(record.media, rect),
        tier,
        size,
        ribs,
        box,
        at: ribs ? { left: parseFloat(ribs.style.left) || 0, top: parseFloat(ribs.style.top) || 0 } : null,
        top: tier === "skip" || !box ? rect.top + INSET.full.y : clearOfCached(record, rect, size, box.width, box.height),
        odds: null,
        crestHidden: record.crest && record.crest.isConnected ? crestCovered(record, rect) : false,
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
            crowded: Boolean(row) && record.roomBar === bar && !roomFree(record, bar, barRect, rect),
          };
        }
      }
      return read;
    });
    const pitch = pitchOf(reads);
    const captain = captainOf(pitch);
    const column = builderPage() ? bonusColumn() : null;

    let again = false;
    for (const read of reads) {
      try {
        if (placeTile(read)) again = true;
        if (placeOdds(read)) again = true;
        if (placeNeed(read)) again = true;
        if (placeStart(read)) again = true;
        if (placeCaptain(read, read === captain)) again = true;
        if (placePrice(read)) again = true;
        placeCrest(read);
        placeWorth(read);
      } catch {
        // one card that will not take a tile must not stop the others
      }
    }
    if (again) schedule();
    try {
      placeTeam(pitch, column);
      placeList();
      placeClear();
      placeWorthBox();
      placeStrip();
    } catch {
      // the box and the strip are niceties: a page they do not fit keeps everything else
    }
    showGuide();
    report();
  }

  // -- points needed (plans/points-needed.md) -------------------------------------------------------------------------
  // On Sorare's lineup pages only (owner, 2 Nov 2026), on the cards of a lineup still in play: the raw score each card still needs for
  // its lineup to reach the step's target, worked out from the lineup's score so far (core.pointsNeeded, the same as Sofix). One card
  // left with 100 to find shows 100, less with his bonus or the captaincy. Each pill belongs to its own team block on the page, so a
  // card that also sits in an older, settled lineup there gets nothing in that one. Each time you open one of these pages your lineups
  // are read afresh; while you stay, again every 2 minutes during a game of yours, else every 10. Nothing is asked from a hidden tab.
  // Sorare's Pro lineups page, every Pro step's (/football/play/boards/pro/<board>/<step>/lineups) and every Arcade step's
  // (/football/series/<step>/lineups).
  const NEED_PAGES = [
    /^\/football\/lineups\/pro(?:\/|$)/,
    /^\/football\/play\/boards\/pro\/[^/]+\/[^/]+\/lineups(?:\/|$)/,
    /^\/football\/series\/[^/]+\/lineups(?:\/|$)/,
  ];
  const NEED_ASK_MS = 2 * 60 * 1000;
  const NEED_GAME_MS = 115 * 60 * 1000; // after this a game is over (Sofix's Arcade uses the same)
  let need = null;
  let needAskedAt = 0;
  let needAsking = false;
  let needCache = { key: "", lineups: [] };
  let needPath = ""; // the page the last answer was for: opening another one reads afresh

  const needPage = () => NEED_PAGES.some((page) => page.test(location.pathname));

  function wantNeed() {
    if (!needPage() || needAsking || document.visibilityState !== "visible") return;
    const entered = location.pathname !== needPath;
    if (!entered && now() - needAskedAt < NEED_ASK_MS) return;
    needAsking = true;
    needAskedAt = now();
    needPath = location.pathname;
    try {
      chrome.runtime.sendMessage({ type: "need-data", fresh: entered }, (reply) => {
        needAsking = false;
        if (chrome.runtime.lastError || !reply) {
          void chrome.runtime.lastError;
          return;
        }
        need = reply;
        needCache = { key: "", lineups: [] };
        schedule();
      });
    } catch {
      needAsking = false;
    }
  }

  /** Your lineups still in play, each with its cards' pills, worked out once a minute (and again when the data changes). */
  function needLineups() {
    const t = now();
    const key = `${needAskedAt}|${Math.floor(t / 60000)}`;
    if (!need || needCache.key === key) return needCache.lineups;
    const steps = (need.arcade && need.arcade.steps) || {};
    const lineups = [...(need.arcadeLineups || []), ...(need.proLineups || [])].map((lineup) => {
      const target = lineup.kind === "arcade" ? (steps[lineup.step] ? steps[lineup.step].target : null) : lineup.target;
      const cards = lineup.cards.map((c) => {
        const at = c.kickoff ? Date.parse(c.kickoff) : NaN;
        // Taken off or his game over (background.js doneScoring): his score is locked, whatever the clock says.
        const state = c.done ? "finished" : !Number.isFinite(at) || t < at ? "to play" : t - at < NEED_GAME_MS ? "live" : "finished";
        // Sorare's card score already holds the card's bonus (and the captain's): his raw score is that score divided by it.
        return { multiplier: c.bonus, unknown: "Sorare gave no bonus for this card", state, raw: c.score === null || !c.bonus ? null : c.score / c.bonus };
      });
      const result = core.pointsNeeded(target, cards);
      return {
        key: lineup.id || lineup.cards.map((c) => c.slug).join(","),
        target,
        cards: lineup.cards.map((c, i) => ({ slug: c.slug, ...cards[i] })),
        slugs: new Set(lineup.cards.map((c) => c.slug)),
        pills: new Map(lineup.cards.map((c, i) => [c.slug, core.needBadge(result, i, target, c.captain)])),
        games: new Map(lineup.cards.filter((c) => c.game).map((c) => [c.slug, c.game])),
        states: new Map(lineup.cards.map((c, i) => [c.slug, cards[i].state])),
      };
    });
    needCache = { key, lineups };
    return lineups;
  }

  /**
   * The team block a card is drawn in: the smallest box around it holding five or more cards, with the slugs of those the page has
   * named. Cards sit 12 to 17 levels deep on the Arcade lineups page (2 Nov 2026), so the walk goes up to 40. Kept for the page
   * change only once every card in it is named, so a block read half-named is read again.
   */
  function teamOf(record) {
    if (record.needTeam && record.needTeam.epoch === pageEpoch && record.needTeam.whole) return record.needTeam;
    let box = record.media.parentElement;
    for (let depth = 0; box && box !== document.body && depth < 40; depth += 1, box = box.parentElement) {
      const inside = [...live].filter((other) => box.contains(other.media));
      if (inside.length < 5) continue;
      const slugs = new Set(inside.map((other) => other.cardSlug).filter(Boolean));
      record.needTeam = { epoch: pageEpoch, slugs, box, whole: inside.every((other) => other.cardSlug) };
      return record.needTeam;
    }
    return null;
  }

  /**
   * The lineup of yours still in play whose team block this card is drawn in, on a lineup page; else null. Every card the block names
   * must be in that lineup: one card the page never named no longer blanks the rest (9 Nov 2026), and a block of another lineup,
   * settled or not, never matches.
   */
  function lineupOf(record) {
    if (!needPage() || !record.cardSlug) return null;
    const team = teamOf(record);
    if (!team) return null;
    return needLineups().find((l) => l.slugs.has(record.cardSlug) && [...team.slugs].every((slug) => l.slugs.has(slug))) || null;
  }

  /** This card's pill: only on a lineup page, only when its team block is one of your lineups still in play, and not once its game is over. */
  function needFor(record) {
    const lineup = lineupOf(record);
    if (!lineup || lineup.states.get(record.cardSlug) === "finished") return null;
    return lineup.pills.get(record.cardSlug) || null;
  }

  /**
   * Whether a card is drawn at all: anywhere but Sorare's lineup pages, yes; there only in your lineups still in play, and only while
   * its game is to play or being played (the owner, 3 Nov 2026: a settled score needs nothing from Sofix).
   */
  function onLineupPage(record) {
    if (!needPage()) return true;
    const lineup = lineupOf(record);
    return Boolean(lineup) && lineup.states.get(record.cardSlug) !== "finished";
  }

  /** The game Sorare put this card in, when it sits in one of your lineups on a lineup page. */
  function gameHint(record) {
    const lineup = lineupOf(record);
    return lineup ? lineup.games.get(record.cardSlug) || null : null;
  }

  /** The pill for one card: drawn, moved to the art's top right, or taken off. */
  // -- start % under Sorare's grade (plans/overlay-v2.md 1.2) -------------------------------------------------------
  // Sorare's lineup cards carry their own start badge ("80%") and projection grade ("A") at the top right. Sofix's start % sits
  // under them as a small dark chip; with nothing there it takes their place. Found by position and size, never by name.

  /**
   * The box around Sorare's own chips at the card's top right, as offsets from the card's top-left corner (so a scroll does not
   * ask again), or null. Asked once per card size and page change: it probes the page, the one costly thing here.
   */
  function topRightOf(record, rect) {
    const key = `${Math.round(rect.width)}|${Math.round(rect.height)}|${pageEpoch}`;
    if (record.cornerKey === key) return record.corner;
    if (rect.top < 0 || rect.bottom > innerHeight || rect.left < 0 || rect.right > innerWidth) return record.corner || null; // probed only in full view
    if (overBudget()) return record.corner || null; // the next pass probes it
    record.cornerKey = key;
    record.hangs = undefined; // asked again with the corner: a re-rendered card may sit in another box
    record.host = null;
    const media = record.media;
    const reach = rect.top + rect.height * 0.35;
    let box = null;
    const take = (el) => {
      if (el === media || el.contains(media) || media.contains(el) || el.closest("[data-sfx],[data-sfx-dock]")) return;
      const r = el.getBoundingClientRect();
      if (!r.width || !r.height || r.left > rect.right + 8) return;
      if (r.width * r.height > rect.width * rect.height * 0.25 || r.width > rect.width * 0.6 || r.right < rect.right - 40 || r.top > reach || r.top < rect.top - 2) return; // not the captain button on the card's corner
      box = box
        ? { top: Math.min(box.top, r.top), bottom: Math.max(box.bottom, r.bottom), left: Math.min(box.left, r.left), right: Math.max(box.right, r.right) }
        : { top: r.top, bottom: r.bottom, left: r.left, right: r.right };
    };
    for (let y = rect.top + 2; y < reach; y += 6) {
      for (const x of [rect.right + 4, rect.right - 4, rect.right - 12, rect.right - 20, rect.right - 28]) {
        if (x >= 0 && x < innerWidth) for (const el of document.elementsFromPoint(x, y)) take(el);
      }
    }
    // A hit test misses what lets clicks through (Sorare's start badge and grade on its builder list did, 4 Nov 2026, and ours covered
    // them): the card's own box and the one around it are read too, at most 300 elements.
    const around = hostOf(record).parentElement;
    if (around && around !== document.body) [...around.querySelectorAll("*")].slice(0, 300).forEach(take);
    record.corner = box && { top: box.top - rect.top, bottom: box.bottom - rect.top, left: box.left - rect.left, right: box.right - rect.left };
    return record.corner;
  }

  /**
   * Where Sorare puts its start badge on a card it lets show past its edge (measured 3 Nov 2026, the builder's pitch): 4 px out
   * past the right edge, 8 px down. A card whose own box clips keeps ours inside.
   */
  const BADGE = { out: 4, down: 8, gap: 4 };
  function hangs(record) {
    if (record.hangs === undefined) record.hangs = !clips(hostOf(record));
    return record.hangs;
  }

  /** Whether a box cuts what is drawn past its edge: overflow, paint containment (Sorare's list cards: `contain: content`) or a clip path. */
  function clips(el) {
    const style = getComputedStyle(el);
    return style.overflow !== "visible" || /paint|content|strict/.test(style.contain) || style.clipPath !== "none";
  }

  /** Paint containment or a clip path: what cuts Sorare's list cards (an overflow cut is the card's own, and ours stay inside it). */
  function contains(el) {
    const style = getComputedStyle(el);
    return /paint|content|strict/.test(style.contain) || style.clipPath !== "none";
  }

  /**
   * The box ours go in: the card's own, or, when a wrapper of the card's size contains its paint, the one just above the outermost
   * such wrapper (where Sorare puts its own start badge on a list card). Never a box wider than the card.
   */
  function hostOf(record) {
    if (record.host && record.host.isConnected && record.host.contains(record.media)) return record.host;
    const width = record.media.getBoundingClientRect().width;
    let host = record.media.parentElement;
    for (let el = host, depth = 0; el && el !== document.body && depth < 6; el = el.parentElement, depth += 1) {
      if (Math.abs(el.getBoundingClientRect().width - width) > 4) break;
      const above = el.parentElement;
      if (contains(el) && above && Math.abs(above.getBoundingClientRect().width - width) <= 4) host = above;
    }
    record.host = host;
    return host;
  }

  /** Where the tile's top-left corner goes, from the card's: Sorare's badge place mirrored (4 px out, 8 px down) where the card lets it show. */
  function tileStart(record, size) {
    return (size === "full" || size === "narrow") && hangs(record) ? { x: -BADGE.out, y: BADGE.down } : INSET[size];
  }

  /** Moves one of ours (absolutely placed in the card's box) so its top-right corner lands on (right, top). */
  function moveTo(el, right, top) {
    const box = el.getBoundingClientRect();
    const dx = right - box.right;
    const dy = top - box.top;
    if (Math.abs(dx) > 0.5) el.style.left = `${(parseFloat(el.style.left) || 0) + dx}px`;
    if (Math.abs(dy) > 0.5) el.style.top = `${(parseFloat(el.style.top) || 0) + dy}px`;
    el.removeAttribute("data-pending");
    return Math.abs(dx) > 0.5 || Math.abs(dy) > 0.5;
  }

  function placeStart(read) {
    const { record, rect, tier, size } = read;
    const held = entryOf(record);
    const entry = held && held.entry;
    const shown = (tier === "full" || tier === "compact") && size !== "tiny" && entry && !core.staleness(entry, now()) && typeof core.startChance(entry) === "number";
    let chip = record.start && record.start.isConnected ? record.start : null;
    if (!shown) {
      if (chip) chip.remove();
      record.start = null;
      return false;
    }
    const onPage = record.playerSlug ? pageOdds.get(record.playerSlug) : undefined;
    const f = facts(entry, onPage);
    const hover = core.startHover(entry, onPage, tier === "full");
    // Sorare's own start badge colours: its steps for the chance, amber for an FF doubt, red for a player who will not start.
    const level = f.tone === "out" ? "low" : f.tone === "doubt" && core.startLevel(f.startChance) === "high" ? "medium" : core.startLevel(f.startChance);
    const background = startColour(level);
    const sig = `${tier}|${f.startChance}|${f.tone}|${f.source}|${Boolean(f.apart)}|${hover}|${background}`;
    let fresh = false;
    if (!chip) {
      chip = node("span");
      chip.setAttribute("data-sfx", "");
      chip.setAttribute("data-pending", "");
      hostOf(record).append(chip);
      record.start = chip;
      fresh = true;
    }
    if (chip.dataset.sig !== sig) {
      chip.dataset.sig = sig;
      chip.className = `sfx-start sfx-start--${tier}${f.tone === "doubt" ? " sfx-start--doubt" : ""}${f.tone === "out" ? " sfx-start--out" : ""}${f.apart ? " sfx-start--apart" : ""}`;
      chip.title = hover;
      chip.style.background = background;
      chip.setAttribute("aria-hidden", "true"); // the tile's own name says the same to a screen reader
      const value = node("b");
      value.append(core.chanceLabel(f.startChance).replace("%", ""), node("small", "", "%"));
      chip.replaceChildren(...(f.source ? [sourceDot(f.source)] : []), value);
    }
    if (fresh) return true; // measured on the next pass
    const inset = INSET[tier];
    const corner = topRightOf(record, rect);
    const edge = corner ? rect.left + corner.right : hangs(record) ? rect.right + BADGE.out : rect.right - inset.x; // right-aligned with Sorare's own
    const pill = record.need && record.need.isConnected && !record.need.hasAttribute("data-pending") ? record.need.getBoundingClientRect() : null;
    let top = corner ? rect.top + corner.bottom + BADGE.gap : rect.top + (hangs(record) ? BADGE.down : inset.y);
    if (pill && pill.right > rect.right - 40 && pill.bottom + 3 > top && pill.top < top + 16) top = pill.bottom + 3; // never under the pill
    const tile = record.ribs && record.ribs.isConnected && !record.ribs.hasAttribute("data-pending") ? record.ribs.getBoundingClientRect() : null;
    const width = chip.getBoundingClientRect().width;
    if (tile && tile.right + 3 > edge - width && tile.bottom + 3 > top && tile.top < top + 18) top = tile.bottom + 3; // never over the tile
    return moveTo(chip, edge, top);
  }

  // -- captain C on Sorare's builder (plans/overlay-v2.md 1.2) ---------------------------------------------------------
  // Sorare's builder draws a 32 px round "C" titled "Captain" on each card on the pitch, centred on its top-left corner, and turns
  // the captain's pink with the class "active" (seen 3 Nov 2026, a Classic builder). Sofix marks the card it would captain with a
  // faint purple C at the bottom right, until Sorare has that card as captain.
  const builderPage = () => Boolean(core.composeBoard(location.pathname)) || /^\/football\/series\/[^/]+\/compose-team(?:\/|$)/.test(location.pathname);

  /**
   * The cards on Sorare's pitch, each with whether Sorare has it as captain. A placed card sits in a slot button labelled "Select
   * <player>" (seen 4 Nov 2026; an empty slot says "Select DEF"), and once the lineup is full Sorare adds the "Captain" marks. One
   * entry per card (Sorare draws a card's art twice). Only reads the page (called before anything is written).
   */
  function pitchOf(reads) {
    if (!builderPage()) return [];
    const marks = [...document.querySelectorAll('[title="Captain"]')]
      .filter((el) => !el.closest("[data-sfx]"))
      .map((el) => ({ el, r: el.getBoundingClientRect() }))
      .filter(({ r }) => r.width >= 20); // Sorare's 16 px one in the "Select Captain" line is not on a card
    const slots = [...document.querySelectorAll("button")].filter((b) => /^Select\s/.test(b.getAttribute("aria-label") || b.textContent || "") && b.getBoundingClientRect().width >= 90);
    if (!marks.length && !slots.length) return [];
    const pitch = [];
    const seen = new Set();
    for (const read of reads) {
      if (read.tier !== "full" || read.covered) continue;
      const { rect, record } = read;
      const mark = marks.find(({ r }) => Math.abs(r.left + r.width / 2 - rect.left) < 24 && Math.abs(r.top + r.height / 2 - rect.top) < 24);
      if (!mark && !slots.some((b) => b.contains(record.media))) continue;
      const key = slugOf(record) || record.media;
      if (seen.has(key)) continue;
      seen.add(key);
      pitch.push({ read, captain: Boolean(mark) && mark.el.classList.contains("active") });
    }
    return pitch;
  }

  /** The read of the pitch card to mark, or null. */
  function captainOf(pitch) {
    const i = core.captainPick(pitch.map(({ read, captain }) => {
      const held = entryOf(read.record);
      const entry = held && held.entry;
      return { x: entry && !core.staleness(entry, now()) ? entry.x : null, captain };
    }));
    return i < 0 ? null : pitch[i].read;
  }

  function placeCaptain(read, mine) {
    const { record, rect } = read;
    let mark = record.captain && record.captain.isConnected ? record.captain : null;
    if (!mine) {
      if (mark) mark.remove();
      record.captain = null;
      return false;
    }
    let fresh = false;
    if (!mark) {
      mark = node("span", "sfx-captain", "C");
      mark.setAttribute("data-sfx", "");
      mark.setAttribute("data-pending", "");
      hostOf(record).append(mark);
      record.captain = mark;
      fresh = true;
    }
    const title = `Sofix's captain: the best expected score on the pitch, ${Math.round(entryOf(record).entry.x)} with his chance of starting counted`;
    if (mark.title !== title) {
      mark.title = title;
      mark.setAttribute("aria-label", title);
    }
    if (fresh) return true; // measured on the next pass
    return moveTo(mark, rect.right - INSET.full.x, rect.bottom - INSET.full.y - mark.getBoundingClientRect().height);
  }

  // -- team gauge on Sorare's builder (plans/overlay-v2.md 1.4, step 5) -------------------------------------------------
  // Sorare's builder has a column of its own bonuses at the pitch's top right ("+6% Lineup Bonus", "Multi-Club +2%", "Cap 260 +4%"):
  // right-aligned rows over 36 px icons in an absolute box (seen 4 Nov 2026). Sofix's gauge is one more row under them: "SOFIX · n of
  // 5" and a ring that fills as cards go on the pitch, around the expected total of whatever is there (core.teamChances, the planner's
  // own simulation). Hover or focus opens the team panel: the total and its likely range, three rings around the likeliest reward,
  // the team's stats. Worked out again only when the pitch changes.
  let team = null; // { el, sig }
  let columnAt = { epoch: -1, el: null };

  /** Sorare's bonus column (the box holding "Lineup Bonus"), found once per page change. */
  function bonusColumn() {
    if (columnAt.epoch === pageEpoch && columnAt.el && columnAt.el.isConnected) return columnAt.el;
    let el = null;
    for (const one of document.querySelectorAll("div")) {
      if (one.childElementCount === 0 && /^lineup bonus$/i.test(one.textContent.trim())) {
        el = one;
        break;
      }
    }
    while (el && el.getBoundingClientRect().height < 100) el = el.parentElement;
    columnAt = { epoch: pageEpoch, el };
    return el;
  }

  const meanOf = (values) => {
    const list = values.filter((v) => typeof v === "number" && Number.isFinite(v));
    return list.length ? list.reduce((a, b) => a + b, 0) / list.length : null;
  };

  /** What the gauge shows for these pitch cards: the simulation and the team's stats, or null with nothing to count. */
  function teamRead(pitch) {
    const cards = [];
    const entries = [];
    for (const { read, captain } of pitch) {
      const held = entryOf(read.record);
      const e = held && held.entry;
      if (!e || core.staleness(e, now()) || !(e.p >= 0)) continue;
      entries.push(e);
      const mu = typeof e.mu === "number" ? e.mu : e.p > 0 ? e.x / e.p : 0;
      cards.push({ p: e.p, mu, sd: e.sd, mult: typeof e.mult === "number" ? e.mult : 1, pos: e.pos, game: e.match && e.match.id, venue: e.match && e.match.venue, club: e.club || null, average: e.average, captain });
    }
    const sim = core.teamChances(cards, teamNow || {});
    if (!sim) return null;
    const keepers = entries.filter((e) => e.pos === "GK" || e.pos === "DEF");
    const xds = entries.map((e) => e.xd).filter((v) => typeof v === "number");
    return {
      sim,
      rings: core.teamRings(sim.tiers),
      size: (teamNow && teamNow.size) || 5,
      stats: {
        xd: xds.length ? xds.reduce((a, b) => a + b, 0) : null,
        win: meanOf(entries.map((e) => e.game && e.game.win)),
        cs: meanOf(keepers.map((e) => e.game && e.game.cleanSheet)),
        fdr: meanOf(entries.map((e) => e.game && e.game.difficulty)),
        bucket: meanOf(entries.map((e) => e.game && e.game.bucket)),
      },
    };
  }

  const RING_R = 23;
  const RING_LEN = 2 * Math.PI * RING_R;

  function ringSvg(share) {
    const svg = document.createElementNS(SVG_NS, "svg");
    svg.setAttribute("viewBox", "0 0 54 54");
    svg.setAttribute("class", "sfx-ring");
    svg.setAttribute("aria-hidden", "true");
    for (const [name, dash] of [["sfx-ring-track", RING_LEN], ["sfx-ring-fill", RING_LEN * Math.max(0, Math.min(1, share))]]) {
      const c = document.createElementNS(SVG_NS, "circle");
      c.setAttribute("cx", "27");
      c.setAttribute("cy", "27");
      c.setAttribute("r", String(RING_R));
      c.setAttribute("class", name);
      c.setAttribute("stroke-dasharray", `${dash.toFixed(1)} ${RING_LEN.toFixed(1)}`);
      svg.append(c);
    }
    return svg;
  }

  function teamPanel(t) {
    const box = node("div", "sfx-team-panel");
    box.setAttribute("role", "tooltip");
    box.id = "sfx-team-panel";
    const head = node("div", "sfx-team-head");
    const chip = node("b", "sfx-team-total", String(Math.round(t.sim.x)));
    chip.style.setProperty("--sfx-c", colour(core.scoreLevel(t.sim.x / Math.max(1, t.sim.n)))); // a card's average, whatever is on the pitch
    head.append(chip, node("span", "sfx-team-range", `${Math.round(t.sim.lo)}–${Math.round(t.sim.hi)}`));
    box.append(head);
    if (t.rings) {
      const rings = node("div", "sfx-team-rings");
      for (const key of ["below", "at", "above"]) {
        const ring = t.rings[key];
        const one = node("div", `sfx-team-ring sfx-team-ring--${key}`);
        if (ring) {
          const dial = node("div", "sfx-team-dial");
          dial.append(ringSvg(ring.p), node("b", "", core.chanceLabel(ring.p)));
          one.append(dial, node("span", "sfx-team-prize", ring.label), node("span", "sfx-team-need", ring.need === null ? "under the first" : `at ${Math.round(ring.need)}`));
        }
        rings.append(one);
      }
      box.append(rings);
    }
    const stats = node("div", "sfx-team-stats");
    const level = t.stats.bucket === null ? null : core.fdrLevel(Math.round(t.stats.bucket));
    for (const [key, value, tone] of [
      ["XD", t.stats.xd === null ? "—" : t.stats.xd.toFixed(2), null],
      ["WIN", t.stats.win === null ? "—" : core.chanceLabel(t.stats.win), null],
      ["CS", t.stats.cs === null ? "—" : core.chanceLabel(t.stats.cs), null],
      ["FDR", t.stats.fdr === null ? "—" : String(Math.round(t.stats.fdr)), level],
    ]) {
      const cell = node("span", "sfx-team-stat");
      const b = node("b", value === "—" ? "sfx-stat--none" : "", value);
      if (tone) b.style.setProperty("--sfx-d", colour(tone));
      cell.append(node("span", "", key), b);
      stats.append(cell);
    }
    box.append(stats);
    return box;
  }

  function placeTeam(pitch, column) {
    const rect = column && column.isConnected ? column.getBoundingClientRect() : null;
    if (!rect || !rect.width) {
      if (team) team.el.remove();
      team = null;
      return;
    }
    const t = teamRead(pitch);
    const size = t ? t.size : (teamNow && teamNow.size) || 5;
    const n = t ? t.sim.n : 0;
    const sig = t ? `${Math.round(t.sim.x)}|${Math.round(t.sim.lo)}|${Math.round(t.sim.hi)}|${n}|${size}|${t.sim.tiers.map((x) => Math.round(x.p * 100)).join(",")}|${t.stats.xd}|${t.stats.fdr}` : `none|${size}`;
    if (!team || !team.el.isConnected || team.sig !== sig) {
      const el = team && team.el.isConnected ? team.el : node("div", "sfx-team");
      el.setAttribute("data-sfx", "");
      el.replaceChildren();
      const dial = node("div", "sfx-team-gauge");
      dial.append(ringSvg(n / size), node("b", "", t ? String(Math.round(t.sim.x)) : "—"));
      const words = node("div", "sfx-team-words");
      words.append(node("span", "sfx-team-name", "SOFIX"), node("span", "sfx-team-count", `${n} of ${size}`));
      el.append(words, dial);
      el.tabIndex = 0;
      el.setAttribute("aria-label", t ? `Sofix: ${Math.round(t.sim.x)} expected from ${n} of ${size} cards, likely ${Math.round(t.sim.lo)} to ${Math.round(t.sim.hi)}` : "Sofix: no card on the pitch yet");
      if (t) {
        el.setAttribute("aria-describedby", "sfx-team-panel");
        el.append(teamPanel(t));
      } else el.removeAttribute("aria-describedby");
      if (!el.isConnected) document.body.append(el);
      team = { el, sig };
    }
    team.el.style.transform = `translate3d(${Math.round(rect.right - team.el.offsetWidth)}px, ${Math.round(rect.bottom + 16)}px, 0)`;
  }

  // -- % to clear on Sorare's lineup pages (plans/overlay-v2.md 1.5, step 7) ------------------------------------------------
  // Each of your lineups still in play gets a pill beside its ribbon ("In progress", seen 4 Nov 2026 on an Arcade step's lineups
  // page): the chance it reaches the step's target, its finished cards' real scores banked and the rest simulated as the planner
  // does (core.lineupChance). A settled lineup, or one whose ribbon cannot be found, gets nothing.
  const RIBBON = /^(in progress|upcoming|not started|live|successful|missed)$/i;
  const clearPills = new Map(); // lineup key -> pill

  /** The leaf holding a block's ribbon word, climbing from the block of cards (it sits above them), or null. */
  function ribbonOf(box) {
    let up = box;
    for (let depth = 0; up && up !== document.body && depth < 6; depth += 1, up = up.parentElement) {
      const found = [...up.querySelectorAll("div, span, p")].filter((el) => el.childElementCount === 0 && RIBBON.test(el.textContent.trim()) && !el.closest("[data-sfx]"));
      if (found.length === 1) return found[0];
      if (found.length > 1) return null; // climbed into the next lineup
    }
    return null;
  }

  function placeClear() {
    const seen = new Set();
    if (needPage()) {
      const bySlug = new Map();
      for (const record of live) if (record.cardSlug) bySlug.set(record.cardSlug, record);
      for (const lineup of needLineups()) {
        if (lineup.cards.every((c) => c.state === "finished")) continue;
        const one = lineup.cards.map((c) => bySlug.get(c.slug)).find((r) => r && lineupOf(r) === lineup);
        const box = one && one.needTeam && one.needTeam.box;
        const ribbon = box && ribbonOf(box);
        if (!ribbon) continue;
        const result = core.lineupChance(lineup.target, lineup.cards.map((c) => {
          const record = bySlug.get(c.slug);
          const held = record && entryOf(record);
          return { ...c, entry: held && held.entry && !core.staleness(held.entry, now()) ? held.entry : null };
        }));
        if (!result) continue;
        seen.add(lineup.key);
        const label = `${core.chanceLabel(result.p)} to clear`;
        const title = `Sofix: a ${core.chanceLabel(result.p)} chance this lineup reaches ${Math.round(result.target)} (${Math.round(result.now)} so far, ${result.open} card${result.open === 1 ? "" : "s"} still to score)`;
        let pill = clearPills.get(lineup.key);
        if (!pill || !pill.isConnected || pill.previousElementSibling !== ribbon) {
          if (pill) pill.remove();
          pill = node("span", "sfx-clear");
          pill.setAttribute("data-sfx", "");
          ribbon.after(pill);
          clearPills.set(lineup.key, pill);
        }
        if (pill.textContent !== label) pill.textContent = label;
        if (pill.title !== title) {
          pill.title = title;
          pill.setAttribute("aria-label", title);
        }
        pill.dataset.level = result.p >= 0.795 ? "high" : result.p >= 0.495 ? "mid" : "low";
      }
    }
    for (const [key, pill] of clearPills) {
      if (seen.has(key)) continue;
      pill.remove();
      clearPills.delete(key);
    }
  }

  // -- sort, filter, Sofix lineup and compare on the builder's card list (plans/overlay-v2.md 1.4, step 6) --------------
  // Sorare's builder lists the cards for a slot under "Select your Goalkeeper": a heading row, then a CSS grid whose children are the
  // cards (seen 4 Nov 2026). Sofix's bar sits in that heading row. Sorting sets `order` on Sorare's own grid items (its nodes are
  // never moved: React owns them); a filter fades the cards that fail it; the Sofix lineup switch outlines the cards the plan uses on
  // this competition. Shift+click two cards to compare them (a plain click still picks the card). Clearing the bar, or switching the
  // overlay off, gives Sorare's list back as it was. The choices are kept in this browser (chrome.storage.local).
  const LIST_KEY = "sfxList";
  const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
  let listPrefs = { sort: "xscore", filters: [], plan: false };
  let listBar = null; // { el, sig }
  let listItems = []; // Sorare's grid items we touched, to give back
  let listsAt = { epoch: -1, lists: [] };
  let compare = []; // up to two { item, record }
  let comparePanel = null;
  let menuOpen = false;
  let listMenu = null; // the filter menu, on the page's top layer: inside Sorare's row it opened under the cards

  try {
    chrome.storage.local.get(LIST_KEY).then((got) => {
      const saved = got && got[LIST_KEY];
      if (saved && typeof saved === "object") {
        listPrefs = {
          sort: core.SORT_KEYS.includes(saved.sort) || saved.sort === "sorare" ? saved.sort : "xscore",
          filters: Array.isArray(saved.filters) ? saved.filters.filter((f) => f && core.FILTER_KEYS.includes(f.key)) : [],
          plan: saved.plan === true,
        };
        if (listBar) listBar.sig = "";
        schedule();
      }
    }, () => {});
  } catch {
    // no storage here: the defaults hold for this page
  }
  const saveList = () => {
    try {
      chrome.storage.local.set({ [LIST_KEY]: listPrefs });
    } catch {
      // kept for this page only
    }
  };
  const setList = (change) => {
    listPrefs = { ...listPrefs, ...change };
    saveList();
    if (listBar) listBar.sig = "";
    schedule();
  };

  /** Sorare's "Select your …" lists on the page: each heading and the grid items under it. Found once per page change. */
  function cardLists() {
    if (listsAt.epoch === pageEpoch && listsAt.lists.every((l) => l.head.isConnected)) return listsAt.lists;
    const lists = [];
    for (const el of document.querySelectorAll("div, h2, h3, h4")) {
      if (el.closest("[data-sfx]")) continue;
      const own = [...el.childNodes].filter((n) => !(n.nodeType === 1 && n.hasAttribute("data-sfx"))); // our bar may sit in it
      if (own.filter((n) => n.nodeType === 1).length > 2) continue;
      const text = own.map((n) => n.textContent).join("").trim();
      if (text.length > 40 || !/^Select your \S/i.test(text)) continue;
      if (lists.some((l) => l.head.contains(el) || el.contains(l.head))) continue;
      let row = el;
      for (let i = 0; i < 4 && row && !(row.nextElementSibling && row.nextElementSibling.querySelector("img")); i++) row = row.parentElement;
      if (!row || !row.nextElementSibling) continue;
      let grid = row.nextElementSibling;
      while (grid.childElementCount === 1) grid = grid.firstElementChild;
      const items = [...grid.children].filter((c) => c.querySelector("img") && !c.hasAttribute("data-sfx"));
      if (items.length) lists.push({ head: el, row, grid, items });
    }
    listsAt = { epoch: pageEpoch, lists };
    return lists;
  }

  /** Each item's record and answer, by the card art inside it. */
  function itemsRead(lists) {
    const byMedia = new Map();
    for (const record of live) byMedia.set(record.media, record);
    return lists.map((list) =>
      list.items.map((item) => {
        let record = null;
        for (const img of item.querySelectorAll("img, video")) if ((record = byMedia.get(img))) break;
        const held = record && entryOf(record);
        return { item, record, entry: held && held.entry && !core.staleness(held.entry, now()) ? held.entry : null };
      }),
    );
  }

  function undoList() {
    for (const item of listItems) {
      if (!item.isConnected) continue;
      item.style.removeProperty("order");
      item.classList.remove("sfx-faded", "sfx-inplan", "sfx-comparing");
    }
    listItems = [];
    if (listBar) listBar.el.remove();
    listBar = null;
    if (listMenu) listMenu.remove();
    listMenu = null;
    menuOpen = false;
    closeCompare();
  }

  function placeList() {
    const lists = builderPage() ? cardLists() : [];
    if (!lists.length) {
      undoList();
      return;
    }
    const read = itemsRead(lists);
    const touched = new Set();
    let shown = 0;
    let total = 0;
    const plan = listPrefs.plan && teamNow && teamNow.comp;
    read.forEach((rows) => {
      const ranks = listPrefs.sort === "sorare" ? null : core.listOrder(rows.map((r) => r.entry), listPrefs.sort);
      rows.forEach((r, i) => {
        touched.add(r.item);
        const order = ranks ? String(ranks[i]) : "";
        if (r.item.style.order !== order) r.item.style.order = order;
        const pass = core.listPasses(r.entry, listPrefs.filters);
        r.item.classList.toggle("sfx-faded", !pass);
        const used = plan && r.entry && r.entry.inPlan && r.record && r.entry.inPlan[r.record.cardSlug];
        r.item.classList.toggle("sfx-inplan", Boolean(used && used.lineup === teamNow.comp));
        r.item.classList.toggle("sfx-comparing", compare.some((c) => c.item === r.item));
        total += 1;
        if (pass) shown += 1;
      });
    });
    for (const item of listItems) if (!touched.has(item) && item.isConnected) {
      item.style.removeProperty("order");
      item.classList.remove("sfx-faded", "sfx-inplan", "sfx-comparing");
    }
    listItems = [...touched];
    drawBar(lists[0], read.flat(), shown, total);
  }

  function drawBar(list, rows, shown, total) {
    // The count changes as cards load: it is updated in place, never by rebuilding the bar under a pressed button (the click would
    // land on Sorare's card below it).
    const sig = JSON.stringify([listPrefs, menuOpen, Boolean(teamNow && teamNow.comp)]);
    const attached = listBar && listBar.el.isConnected && listBar.el.parentElement === list.row;
    if (attached && listBar.sig === sig) {
      const count = listBar.el.querySelector(".sfx-lb-count");
      if (count && count.textContent !== `${shown} of ${total}`) count.textContent = `${shown} of ${total}`;
      return;
    }
    const focused = listBar && listBar.el.contains(document.activeElement) ? document.activeElement.getAttribute("data-k") : null;
    const fresh = !(listBar && listBar.el.isConnected);
    const el = fresh ? node("div", "sfx-listbar") : listBar.el;
    // The bar sits inside Sorare's page: its presses and clicks stop here, so Sorare never takes them for its own.
    if (fresh) for (const type of ["pointerdown", "mousedown", "pointerup", "mouseup", "click"]) el.addEventListener(type, (event) => event.stopPropagation());
    el.setAttribute("data-sfx", "");
    el.setAttribute("role", "toolbar");
    el.setAttribute("aria-label", "Sofix: sort and filter these cards");
    el.replaceChildren();

    const sort = node("label", "sfx-lb-sort");
    sort.append(node("span", "", "Sort"));
    const pick = document.createElement("select");
    pick.setAttribute("data-k", "sort");
    for (const key of [...core.SORT_KEYS, "sorare"]) {
      const o = document.createElement("option");
      o.value = key;
      o.textContent = key === "sorare" ? "Sorare's order" : core.LIST_MEASURES[key].label;
      if (key === listPrefs.sort) o.selected = true;
      pick.append(o);
    }
    pick.addEventListener("change", guard(() => setList({ sort: pick.value })));
    sort.append(pick);
    el.append(sort);

    listPrefs.filters.forEach((f, i) => {
      const chip = node("span", "sfx-lb-chip");
      const label = node("span", "sfx-lb-chip-text", core.filterLabel(f));
      chip.append(label);
      if (f.key === "day") {
        const day = document.createElement("select");
        day.setAttribute("aria-label", "Kickoff day");
        day.setAttribute("data-k", `f${i}`);
        for (const d of DAYS) {
          const o = document.createElement("option");
          o.value = o.textContent = d;
          if (d === f.at) o.selected = true;
          day.append(o);
        }
        day.addEventListener("change", guard(() => setList({ filters: listPrefs.filters.map((g, j) => (j === i ? { ...g, at: day.value } : g)) })));
        chip.replaceChildren(day);
      } else {
        const m = core.LIST_MEASURES[f.key];
        const range = document.createElement("input");
        range.type = "range";
        range.min = String(m.min);
        range.max = String(m.max);
        range.step = String(m.step);
        range.value = String(f.at);
        range.setAttribute("data-k", `f${i}`);
        range.setAttribute("aria-label", `${m.label} threshold`);
        range.addEventListener("input", guard(() => {
          const at = Number(range.value);
          listPrefs = { ...listPrefs, filters: listPrefs.filters.map((g, j) => (j === i ? { ...g, at } : g)) };
          label.textContent = core.filterLabel({ ...f, at });
          schedule();
        }));
        range.addEventListener("change", guard(() => setList({})));
        chip.append(range);
      }
      const x = node("button", "sfx-lb-x", "×");
      x.type = "button";
      x.setAttribute("aria-label", `Remove the ${f.key === "day" ? "day" : core.LIST_MEASURES[f.key].label} filter`);
      x.addEventListener("click", guard(() => setList({ filters: listPrefs.filters.filter((_, j) => j !== i) })));
      chip.append(x);
      el.append(chip);
    });

    let place = null;
    const left = core.FILTER_KEYS.filter((k) => !listPrefs.filters.some((f) => f.key === k));
    if (left.length) {
      const wrap = node("span", "sfx-lb-add");
      const add = node("button", "sfx-lb-btn", "+ Filter");
      add.type = "button";
      add.setAttribute("data-k", "add");
      add.setAttribute("aria-expanded", String(menuOpen));
      add.setAttribute("aria-haspopup", "menu");
      add.addEventListener("click", guard(() => {
        menuOpen = !menuOpen;
        if (listBar) listBar.sig = "";
        schedule();
      }));
      wrap.append(add);
      if (listMenu) listMenu.remove();
      listMenu = null;
      if (menuOpen) {
        const menu = node("div", "sfx-lb-menu");
        menu.setAttribute("data-sfx", "");
        menu.setAttribute("role", "menu");
        menu.setAttribute("aria-label", "Add a filter");
        for (const type of ["pointerdown", "mousedown", "pointerup", "mouseup", "click"]) menu.addEventListener(type, (event) => event.stopPropagation());
        for (const key of left) {
          const item = node("button", "", key === "day" ? "Kickoff day" : core.LIST_MEASURES[key].label);
          item.type = "button";
          item.setAttribute("role", "menuitem");
          item.addEventListener("click", guard(() => {
            menuOpen = false;
            setList({ filters: [...listPrefs.filters, { key, at: core.filterStart(rows.map((r) => r.entry), key) }] });
          }));
          menu.append(item);
        }
        listMenu = menu;
        place = () => {
          const r = add.getBoundingClientRect();
          menu.style.left = `${Math.round(r.right)}px`;
          menu.style.top = `${Math.round(r.bottom + 6)}px`;
          if (!menu.isConnected) document.body.append(menu);
        };
      }
      el.append(wrap);
    }

    const count = node("span", "sfx-lb-count", `${shown} of ${total}`);
    count.setAttribute("aria-live", "polite");
    el.append(count);

    if (teamNow && teamNow.comp) {
      const toggle = node("button", `sfx-lb-btn sfx-lb-plan${listPrefs.plan ? " is-on" : ""}`, "Sofix lineup");
      toggle.type = "button";
      toggle.setAttribute("aria-pressed", String(listPrefs.plan));
      toggle.setAttribute("data-k", "plan");
      toggle.addEventListener("click", guard(() => setList({ plan: !listPrefs.plan })));
      el.append(toggle);
    }
    if (listPrefs.filters.length || listPrefs.sort !== "xscore" || listPrefs.plan) {
      const clear = node("button", "sfx-lb-btn sfx-lb-clear", "Clear");
      clear.type = "button";
      clear.setAttribute("data-k", "clear");
      clear.addEventListener("click", guard(() => setList({ sort: "xscore", filters: [], plan: false })));
      el.append(clear);
    }
    if (!attached) list.row.append(el);
    if (place) place();
    else if (listMenu) {
      listMenu.remove();
      listMenu = null;
    }
    listBar = { el, sig };
    const back = focused && el.querySelector(`[data-k="${focused}"]`);
    if (back) back.focus();
  }

  // Shift+click: the first card, then the second opens the panel; Shift+click a chosen card again, or Escape, closes it.
  function onListClick(event) {
    if (!event.shiftKey || !enabled || !builderPage()) return;
    const item = listItems.find((one) => one.contains(event.target));
    if (!item) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    if (event.type !== "click") return;
    const at = compare.findIndex((c) => c.item === item);
    if (at >= 0) {
      closeCompare();
      return;
    }
    const row = itemsRead(cardLists()).flat().find((r) => r.item === item);
    if (!row || !row.entry) return;
    compare = [...compare, { item, record: row.record, entry: row.entry }].slice(-2);
    if (compare.length === 2) openCompare();
    schedule();
  }

  function onCompareKey(event) {
    if (event.key === "Escape" && compare.length) {
      closeCompare();
      schedule();
    } else if (event.key === "Escape" && menuOpen) {
      menuOpen = false;
      if (listBar) listBar.sig = "";
      schedule();
    }
  }

  function closeCompare() {
    compare = [];
    if (comparePanel) comparePanel.remove();
    comparePanel = null;
    for (const item of listItems) item.classList.remove("sfx-comparing");
  }

  const nameOf = (record) => String((record && record.media.getAttribute("alt")) || "").replace(/\s-\s[a-z_ ]+$/i, "") || "This card";

  function openCompare() {
    if (comparePanel) comparePanel.remove();
    const [a, b] = compare;
    const box = node("div", "sfx-compare");
    box.setAttribute("data-sfx", "");
    box.setAttribute("role", "dialog");
    box.setAttribute("aria-label", `${nameOf(a.record)} against ${nameOf(b.record)}`);
    const heads = node("div", "sfx-cmp-heads");
    for (const side of [a, b]) {
      const head = node("div", "sfx-cmp-head");
      const art = document.createElement("img");
      art.src = side.record.media.currentSrc || side.record.media.src || "";
      art.alt = "";
      head.append(art, node("b", "sfx-cmp-name", nameOf(side.record)));
      const game = side.entry.island && side.entry.island[0];
      if (game) {
        const line = node("span", "sfx-cmp-game");
        for (const src of [game.teamCrest, game.opponentCrest]) {
          if (!src) continue;
          const crest = document.createElement("img");
          crest.src = src;
          crest.alt = "";
          line.append(crest);
        }
        line.append(node("span", "", `${game.venue === "A" ? "at" : "v"} ${game.opponentCode || game.opponent} · ${kickoffLabel(game.kickoff)}`));
        head.append(line);
      }
      heads.append(head);
    }
    box.append(heads);
    const table = node("div", "sfx-cmp-rows");
    for (const row of core.compareRows(a.entry, b.entry)) {
      const line = node("div", "sfx-cmp-row");
      const cell = (side, text) => {
        const v = node("b", `sfx-cmp-v${row.better === side ? " is-better" : ""}${row.chip ? " sfx-cmp-chip" : ""}`, text);
        const e = side === "a" ? a.entry : b.entry;
        if (row.chip === "xscore" && text !== "—") v.style.setProperty("--sfx-c", colour(core.scoreLevel(e.x)));
        if (row.chip === "fdr" && text !== "—" && e.game) v.style.setProperty("--sfx-c", colour(core.fdrLevel(e.game.bucket)));
        return v;
      };
      line.append(cell("a", row.a), node("span", "sfx-cmp-label", row.label), cell("b", row.b));
      table.append(line);
    }
    box.append(table);
    const close = node("button", "sfx-cmp-close", "×");
    close.type = "button";
    close.setAttribute("aria-label", "Close the comparison");
    close.addEventListener("click", guard(() => {
      closeCompare();
      schedule();
    }));
    box.append(close);
    document.body.append(box);
    comparePanel = box;
  }

  // -- price per point (plans/overlay-v2.md 1.2) ------------------------------------------------------------------------
  // On Sorare's market and your gallery, a Limited card says what a point of his costs: his Limited price over his xScore, from the
  // app (lib/overlay.ts, priceOf), green in the cheapest third of similar players, red in the dearest, plain between. At the right,
  // above the line with his position. Another rarity's card says nothing: the price is a Limited one.
  const PRICE_AT = 0.66;
  const THIRD_WORDS = { cheap: "the cheapest third", mid: "the middle third", dear: "the dearest third" };
  const pricePage = () => /^\/football\/market(?:\/|$)/.test(location.pathname) || myGallery();
  const limitedCard = (record) => /-limited-\d+$/.test(record.cardSlug || "") || /\s-\slimited$/i.test(record.media.getAttribute("alt") || "");

  function placePrice(read) {
    const { record, rect, tier } = read;
    const held = tier === "full" && !read.covered && pricePage() && limitedCard(record) ? entryOf(record) : null;
    const entry = held && held.entry;
    const price = entry && entry.price && !core.staleness(entry, now()) ? entry.price : null;
    let pill = record.price && record.price.isConnected ? record.price : null;
    if (!price) {
      if (pill) pill.remove();
      record.price = null;
      return false;
    }
    let fresh = false;
    if (!pill) {
      pill = node("span", "sfx-price");
      pill.setAttribute("data-sfx", "");
      pill.setAttribute("data-pending", "");
      hostOf(record).append(pill);
      record.price = pill;
      fresh = true;
    }
    const text = `€${price.perPoint.toFixed(2)}/pt`;
    const where = price.third ? `in ${THIRD_WORDS[price.third]} of ${price.similar} ${entry.pos}s with a Sorare average within 5 of his` : `too few ${entry.pos}s with a Sorare average within 5 of his to compare (${price.similar})`;
    const title = `€${price.eur.toFixed(2)} Limited price for an xScore of ${Math.round(entry.x)}: ${where}`;
    if (pill.textContent !== text || pill.title !== title) {
      pill.textContent = text;
      pill.title = title;
      pill.setAttribute("aria-label", `${text}. ${title}`);
      if (price.third) pill.dataset.third = price.third;
      else delete pill.dataset.third;
    }
    if (fresh) return true; // measured on the next pass
    // At the right, its bottom at two thirds of the card: Sorare writes his name across the card's bottom (3 Nov 2026, the market).
    return moveTo(pill, rect.right - INSET.full.x, rect.top + rect.height * PRICE_AT - pill.getBoundingClientRect().height);
  }

  function placeNeed(read) {
    const { record, rect, tier } = read;
    const badge = tier === "skip" ? null : needFor(record);
    let pill = record.need && record.need.isConnected ? record.need : null;
    if (!badge) {
      if (pill) pill.remove();
      record.need = null;
      return false;
    }
    let fresh = false;
    if (!pill) {
      pill = document.createElement("span");
      pill.setAttribute("data-sfx", "");
      pill.setAttribute("data-pending", "");
      hostOf(record).append(pill);
      record.need = pill;
      fresh = true;
    }
    const sig = `${badge.label}|${badge.tone}|${badge.detail}|${tier}`;
    if (pill.dataset.sig !== sig) {
      pill.dataset.sig = sig;
      pill.className = `sfx-need sfx-need--${tier === "full" ? "full" : "small"}`;
      pill.dataset.tone = badge.tone;
      pill.textContent = badge.label;
      pill.title = badge.detail;
      pill.setAttribute("aria-label", badge.tone === "need" || badge.tone === "live" ? `Points needed ${badge.label}. ${badge.detail}` : badge.detail);
    }
    if (fresh) return true; // measured on the next pass
    const inset = INSET[tier === "full" ? "full" : "compact"];
    const corner = topRightOf(record, rect);
    if (!corner) return hangs(record) ? moveTo(pill, rect.right + BADGE.out, rect.top + BADGE.down) : moveTo(pill, rect.right - inset.x, rect.top + inset.y);
    const height = pill.getBoundingClientRect().height;
    if (corner.top - BADGE.gap - height >= 1) return moveTo(pill, rect.left + corner.right, rect.top + corner.top - BADGE.gap - height); // above Sorare's start badge
    return moveTo(pill, rect.left + corner.left - 4, rect.top + Math.max(corner.top, inset.y)); // no room above it: beside it
  }

  // -- your gallery's prices (plans/overlay-bridge.md, B2) ----------------------------------------------------------
  // On your own gallery (its address names the Sorare account Sofix reads), a line under Sorare's "Bought 2 days ago" row: what the
  // card is worth now and how far that is up or down on what you paid; and the bought cards' total, as the Prices page has it, in the
  // toolbar row. Someone else's gallery gets nothing. Nothing is asked for until a gallery is open, then at most once a minute.

  let worth = null;
  let worthAskedAt = 0;
  let worthBox = null;
  let toolbarAt = 0;

  const myGallery = () => {
    const owner = core.galleryOf(location.pathname);
    return Boolean(owner && worth && owner === String(worth.user || "").toLowerCase());
  };

  function wantWorth() {
    if (!core.galleryOf(location.pathname) || worth || now() - worthAskedAt < 60000) return;
    worthAskedAt = now();
    try {
      chrome.runtime.sendMessage({ type: "overlay-worth" }, (reply) => {
        if (chrome.runtime.lastError || !reply || reply.state !== "ok" || !reply.worth) {
          void chrome.runtime.lastError;
          return;
        }
        worth = reply.worth;
        schedule();
      });
    } catch {
      // the extension was reloaded under this page: nothing to draw
    }
  }

  const refreshed = () => {
    const at = worth && new Date(worth.at);
    return at && !Number.isNaN(at.getTime()) ? at.toLocaleString(undefined, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) : "the last refresh";
  };

  const AGO = /^[A-Z][a-z]+ .{1,30} ago$/;
  /** Sorare's "Bought 2 days ago" / "Crafted 5 days ago" row under a card, found by what it says inside the card's own block. */
  function locateAgo(media) {
    const width = media.getBoundingClientRect().width;
    let scope = media.parentElement;
    // On his gallery (21 Oct 2026) the row is 7 levels above the picture, in a block as wide as the card.
    for (let level = 0; level < 10 && scope && scope !== document.body; level += 1, scope = scope.parentElement) {
      if (scope.querySelectorAll(core.CARD_SELECTOR).length > 2 || scope.getBoundingClientRect().width > width * 1.5) return null; // past this card's own block
      for (const el of scope.querySelectorAll("div, span, p")) {
        if (el.children.length || el.closest("[data-sfx]") || !AGO.test(el.textContent.trim())) continue;
        return el.parentElement;
      }
    }
    return null;
  }

  function removeWorth(record) {
    if (record.worthEl) record.worthEl.remove();
    record.worthEl = null;
    record.worthSig = "";
  }

  function placeWorth(read) {
    const { record } = read;
    const said = myGallery() && record.cardSlug ? worth.cards[record.cardSlug] : null;
    if (!said) return removeWorth(record);
    if (!record.worthRow || !record.worthRow.isConnected) record.worthRow = locateAgo(record.media);
    const row = record.worthRow;
    if (!row) return removeWorth(record);
    const [paid, value] = said;
    const line = core.worthLine(paid, value);
    const sig = `${line.now}|${line.change}|${worth.at}`;
    if (record.worthEl && record.worthEl.isConnected && record.worthEl.previousElementSibling === row && record.worthSig === sig) return;
    removeWorth(record);
    const el = node("span", "sfx-worth");
    el.setAttribute("data-sfx", "");
    el.title = `Sorare's value at Sofix's refresh of ${refreshed()}${paid === null ? "" : `; you paid €${paid.toFixed(2)}`}`;
    el.append(node("span", "", line.now), node("b", `sfx-worth--${line.tone}`, line.change));
    row.after(el);
    record.worthEl = el;
    record.worthSig = sig;
  }

  /** The row that holds Sorare's "All / Reveal" and its sort: the box sits between them. Looked for at most once a second. */
  function locateToolbar() {
    if (now() - toolbarAt < 1000) return null;
    toolbarAt = now();
    const reveal = [...document.querySelectorAll("button, a, div, span")].find((el) => el.children.length <= 2 && el.textContent.trim() === "Reveal" && !el.closest("[data-sfx]"));
    for (let row = reveal && reveal.parentElement, level = 0; row && row !== document.body && level < 6; row = row.parentElement, level += 1) {
      const style = getComputedStyle(row);
      if (style.display === "flex" && style.justifyContent === "space-between" && row.children.length >= 2) return row;
    }
    return null;
  }

  function placeWorthBox() {
    if (!myGallery()) {
      if (worthBox) worthBox.remove();
      worthBox = null;
      return;
    }
    if (worthBox && worthBox.isConnected) return;
    const row = locateToolbar();
    if (!row) return;
    const t = core.worthTotal(worth);
    const box = node("div", "sfx-worthbox");
    box.setAttribute("data-sfx", "");
    box.setAttribute("role", "group");
    box.setAttribute("aria-label", `Your bought cards are worth ${t.now} now; ${t.paid}; ${t.change}`);
    box.title = `As on Sofix's Prices page; Sorare's values at Sofix's refresh of ${refreshed()}`;
    box.append(node("span", "sfx-cap", "BOUGHT, NOW"), node("b", "sfx-worthbox-now", t.now), node("span", "", t.paid), node("b", `sfx-worth--${t.tone}`, t.change));
    row.children[0].after(box);
    worthBox = box;
  }

  // -- a player's page (plans/overlay-bridge.md, B3) -----------------------------------------------------------------
  // On a LaLiga player's Sorare page (and its tabs), one strip in the empty band above his name: his score if he starts, his start %
  // with each source, his club's next five in the board's colours, and whether he is yours or what he would add. The numbers are his
  // /players page's. A player Sofix holds nothing on (outside LaLiga) gets nothing. Asked once per player, again at most once a minute.

  let profileFor = null;
  let profile;
  let profileAskedAt = 0;
  let strip = null;

  function wantProfile() {
    const slug = core.playerPageOf(location.pathname);
    if (!slug || (slug === profileFor && (profile !== undefined || now() - profileAskedAt < 60000))) return;
    profileFor = slug;
    profile = undefined;
    profileAskedAt = now();
    try {
      chrome.runtime.sendMessage({ type: "overlay-profile", slug }, (reply) => {
        if (chrome.runtime.lastError || !reply || reply.state !== "ok" || profileFor !== slug) {
          void chrome.runtime.lastError;
          return;
        }
        profile = reply.profile || null;
        schedule();
      });
    } catch {
      // the extension was reloaded under this page: nothing to draw
    }
  }

  /** Sorare's name block: the absolutely placed box holding the page's h1, inside the hero (21 Oct 2026: 4 levels above the h1). */
  function locateNameBlock() {
    let el = document.querySelector("h1");
    for (let level = 0; el && level < 6; level += 1) {
      el = el.parentElement;
      if (el && getComputedStyle(el).position === "absolute") return el;
    }
    return null;
  }

  const kickoffLabel = (iso) => {
    const at = new Date(iso);
    return Number.isNaN(at.getTime()) ? "" : at.toLocaleString(undefined, { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
  };

  function placeStrip() {
    const slug = core.playerPageOf(location.pathname);
    if (!slug || slug !== profileFor || !profile) {
      if (strip) strip.remove();
      strip = null;
      return;
    }
    if (strip && strip.isConnected && strip.dataset.slug === slug) return;
    const block = locateNameBlock();
    if (!block) return;
    if (strip) strip.remove();
    const p = profile;
    const box = node("div", "sfx-strip");
    box.setAttribute("data-sfx", "");
    box.dataset.slug = slug;
    box.setAttribute("role", "group");
    box.setAttribute("aria-label", `Sofix on ${p.name}`);

    const top = node("div", "sfx-strip-row");
    top.append(node("span", "sfx-cap", "SOFIX"));
    if (typeof p.score === "number") {
      const score = node("b", "sfx-strip-score", String(p.score));
      score.style.setProperty("--sfx-c", colour(core.scoreLevel(p.score)));
      top.append(score, node("span", "sfx-strip-if", p.ifStarts ? "if he starts" : "if he plays"));
    }
    if (typeof p.pStart === "number") {
      const starts = node("span", "sfx-strip-starts", `${core.chanceLabel(p.pStart)} to start`);
      top.append(starts);
      for (const row of core.sourceRows(p)) top.append(node("span", `sfx-strip-src${row.shown ? " sfx-strip-src--shown" : ""}`, `${row.label} ${row.value === null ? "–" : core.chanceLabel(row.value)}`));
    }
    const said = core.verdictLine(p);
    if (said) top.append(node("span", `sfx-strip-verdict sfx-strip-verdict--${said.tone}`, said.text));
    box.append(top);

    if (p.next.length) {
      const games = node("div", "sfx-strip-row sfx-strip-games");
      for (const g of p.next) {
        const chip = node("span", "sfx-strip-game");
        const level = core.fdrLevel(g.bucket);
        if (level) chip.style.setProperty("--sfx-d", colour(level));
        chip.title = `${g.opponent}, ${g.venue === "H" ? "at home" : "away"}${g.label ? ` · ${g.label}` : ""} · ${kickoffLabel(g.kickoff)}`;
        if (g.crest) {
          const img = node("img");
          img.src = g.crest;
          img.alt = "";
          img.width = 14;
          img.height = 14;
          chip.append(img);
        }
        chip.append(node("b", "", g.code), node("span", "sfx-strip-venue", g.venue === "H" ? "v" : "@"), node("span", "sfx-strip-label", g.label || "no odds"));
        games.append(chip);
      }
      box.append(games);
    }
    box.title = `Sofix's numbers, as on its Players page (refresh of ${new Date(p.at).toLocaleString(undefined, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })})`;
    block.prepend(box);
    strip = box;
  }

  // -- Guide me (dock.js) ------------------------------------------------------------------------------------------
  // The dock names the card to pick next (or to take out of a mission); it is ringed here, on Sorare's own picture, and pressing it
  // moves the dock to the next one. Nothing is picked for you: the ring only shows where to press.

  const guided = (record, guide) =>
    Boolean(guide) && ((guide.card && record.cardSlug === guide.card) || (guide.player && record.playerSlug === guide.player));

  function showGuide() {
    const guide = globalThis.__sofixGuide;
    for (const record of live) {
      const role = guided(record, guide) ? guide.role : null;
      if (role) record.media.setAttribute("data-sfx-guide", role === "out" ? "out" : "pick");
      else if (record.media.hasAttribute("data-sfx-guide")) record.media.removeAttribute("data-sfx-guide");
    }
  }

  const onGuidePress = guard((event) => {
    setTimeout(guard(schedule), 300); // a press may change the page by a class alone (Sorare's captain), which is not watched
    const guide = globalThis.__sofixGuide;
    if (!guide || typeof guide.advance !== "function") return;
    for (const record of live) {
      if (!record.media.hasAttribute("data-sfx-guide")) continue;
      const rect = record.media.getBoundingClientRect();
      if (event.clientX >= rect.left && event.clientX <= rect.right && event.clientY >= rect.top && event.clientY <= rect.bottom) {
        setTimeout(guide.advance, 250); // after Sorare has taken the press
        return;
      }
    }
  });

  // -- the loop --------------------------------------------------------------------------------------------------

  /**
   * One pass on the next frame. While a scroll is on, at most one every 400 ms (cards scrolled into view still get their tiles on
   * a long scroll), and the one its end runs; the frames between only move the crests (3b.1).
   */
  function schedule() {
    if (!enabled || frame || (settleTimer && performance.now() - passStarted < SCROLL_PASS_MS)) return;
    frame = requestAnimationFrame(guard(pass));
  }

  // What a pass costs (3b.8): the slowest of the last minute goes to the popup; the counters are what the tests read.
  const perf = { passes: 0, discovers: 0, moves: 0, slowest: 0, slowestMove: 0, minute: 0 };
  globalThis.__sofixPerf = perf;
  let moving = 0;
  let settleTimer = 0;
  let soonTimer = 0;
  const SETTLE_MS = 150;
  const SCROLL_PASS_MS = 400;
  const SOON_MS = 250;
  /** Scrolling moves only the crests; the full pass (new cards, crests for cards come into view) waits until it stops. */
  const onMove = () => {
    if (!enabled) return;
    if (!moving) moving = requestAnimationFrame(guard(moveCrests));
    clearTimeout(settleTimer);
    settleTimer = setTimeout(guard(() => {
      settleTimer = 0;
      schedule();
    }), SETTLE_MS);
  };
  /** The page changed: one pass at most every 250 ms, however often it changes (3b.5). */
  const scheduleSoon = () => {
    if (soonTimer) return;
    soonTimer = setTimeout(guard(() => {
      soonTimer = 0;
      schedule();
    }), SOON_MS);
  };

  /** A page that moves to another gameweek (Sorare changes the address without a reload) must not keep the last one's numbers. */
  function watchFixture() {
    const here = core.fixtureOf(location.href);
    const board = core.composeBoard(location.pathname); // another competition's builder counts other games
    if (here === fixtureNow && board === boardNow) return;
    fixtureNow = here;
    boardNow = board;
    teamNow = null;
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
    const started = performance.now();
    passStarted = started;
    budgetHit = false;
    try {
      passOnce();
      if (budgetHit) schedule();
    } finally {
      const minute = Math.floor(Date.now() / 60000);
      if (minute !== perf.minute) {
        perf.minute = minute;
        perf.slowest = 0;
      }
      perf.passes += 1;
      perf.slowest = Math.max(perf.slowest, performance.now() - started);
    }
  }

  function passOnce() {
    if (!alive()) {
      dead = true;
      stop();
      return;
    }
    claim(false);
    watchFixture();
    if (scan) {
      scan = false;
      perf.discovers += 1;
      discover();
    }
    identify().catch(() => {}); // asks the bridge; its answer draws on a later pass
    readOdds().catch(() => {});
    wantWorth();
    wantProfile();
    wantNumbers();
    wantNeed();
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
        const text = `${seen}/${matched}/${fixtureNow || ""}/${Math.round(perf.slowest)}`;
        if (text === lastReport) return;
        lastReport = text;
        try {
          chrome.runtime.sendMessage({ type: "overlay-stats", seen, matched, fixture: fixtureNow, slowest: Math.round(perf.slowest) }, () => void chrome.runtime.lastError);
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
    claim(true);
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
        : !ours(change.target) && [...change.addedNodes, ...change.removedNodes].some((node) => node.nodeType === 1 && !ours(node)); // a timer's text ticking is not news
    mutations = new MutationObserver(
      guard((list) => {
        if (!list.some(theirs)) return;
        pageEpoch += 1;
        if (list.some((change) => change.type === "attributes" || change.addedNodes.length)) scan = true;
        scheduleSoon();
      }),
    );
    mutations.observe(document, { childList: true, subtree: true, attributes: true, attributeFilter: ["src", "srcset", "poster", "alt"] });
    window.addEventListener("message", onBridge);
    window.addEventListener("popstate", schedule); // back and forward change the address: the gameweek it names may have too
    window.addEventListener("scroll", onMove, { capture: true, passive: true }); // the crests live outside the cards: they follow them
    window.addEventListener("resize", onMove, { passive: true });
    window.addEventListener("sofix-guide", schedule);
    document.addEventListener("pointerup", onGuidePress, true);
    for (const type of ["pointerdown", "mousedown", "click"]) document.addEventListener(type, onListClick, true);
    document.addEventListener("keydown", onCompareKey, true);
    liveTimer = setInterval(guard(() => wantLive(true)), LIVE_POLL_MS);
    schedule();
  }

  function stop() {
    if (!enabled) return;
    enabled = false;
    const root = document.documentElement;
    const mine = !root || !root.hasAttribute("data-sfx-run") || root.getAttribute("data-sfx-run") === ME; // else a newer copy draws this page now
    if (mutations) mutations.disconnect();
    if (visibility) visibility.disconnect();
    if (resizing) resizing.disconnect();
    mutations = visibility = resizing = null;
    window.removeEventListener("message", onBridge);
    window.removeEventListener("popstate", schedule);
    window.removeEventListener("scroll", onMove, { capture: true });
    window.removeEventListener("resize", onMove);
    window.removeEventListener("sofix-guide", schedule);
    document.removeEventListener("pointerup", onGuidePress, true);
    for (const type of ["pointerdown", "mousedown", "click"]) document.removeEventListener(type, onListClick, true);
    document.removeEventListener("keydown", onCompareKey, true);
    undoList();
    if (frame) cancelAnimationFrame(frame);
    frame = 0;
    if (moving) cancelAnimationFrame(moving);
    moving = 0;
    clearTimeout(settleTimer);
    clearTimeout(soonTimer);
    settleTimer = soonTimer = 0;
    clearTimeout(askTimer);
    askTimer = 0;
    clearInterval(liveTimer);
    liveTimer = 0;
    liveAsking = false;
    liveKey = "";
    liveByMatch.clear();
    for (const record of [...live]) {
      removeWorth(record);
      forget(record);
    }
    live.clear();
    asking.clear();
    lastReport = "";
    clearTimeout(reportTimer);
    reportTimer = 0;
    pageOdds.clear();
    if (worthBox) worthBox.remove();
    if (strip) strip.remove();
    worthBox = null;
    strip = null;
    closePanel(false);
    closeIsland(false);
    if (crestLayer) crestLayer.remove();
    crestLayer = null;
    if (!mine) return;
    document.querySelectorAll("[data-sfx-guide]").forEach((el) => el.removeAttribute("data-sfx-guide"));
    document.querySelectorAll("[data-sfx]").forEach((el) => el.remove());
    document.querySelectorAll(".sfx-room").forEach((el) => el.classList.remove("sfx-room"));
  }

  // The bridge learned more cards from the page's own answers: cards it could not name a moment ago may be known now.
  const onBridge = guard((event) => {
    if (event.source !== window || !event.data || !["sofix-bridge-4", "sofix-bridge-5", "sofix-bridge-7", "sofix-bridge-8", "sofix-bridge-9"].includes(event.data.source) || event.data.type !== "cards") return;
    oddsDue = true;
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
