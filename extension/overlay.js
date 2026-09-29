// Sofix extension, the sorare.com overlay (plans/overlay.md, O3 and O4).
// Draws Sofix's numbers on the cards Sorare shows: one chip with the expected score and the chance he plays. Nothing
// about the game: Sorare's own card already draws that. It only reads and draws. It has no button that writes to Sorare; the one thing here that takes a click opens the app.
//
//   find a card by where its picture comes from (never by Sorare's class names)
//   -> ask the page bridge which card that is (bridge.js learned it from the page's own answers)
//   -> ask the app for that player's numbers (through the background worker, which caches them)
//   -> hang a chip off the picture's left edge, sized to how big the card is drawn and clear of Sorare's own chips.
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
  let chanceOn = true; // the popup's "Show chance of playing"
  let pageEpoch = 0; // bumped whenever the page itself changes, so a chip re-checks what is near it

  const records = new WeakMap(); // picture element -> its record (or a note that it is not a card)
  const live = new Set(); // the records being drawn; the WeakMap alone cannot be walked
  const numbers = new Map(); // "p:slug" | "c:slug" -> { at, entry | null }
  const asking = new Set(); // slugs the app has been asked about and has not answered
  let askTimer = 0;
  let sending = false;
  let downUntil = 0;

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
    if (record.ribs) record.ribs.remove();
    record.ribs = null;
    release(record);
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
    return held && now() - held.at < NUMBERS_TTL_MS ? held : null;
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
    try {
      chrome.runtime.sendMessage({ type: "overlay-numbers", cards, players }, (reply) => {
        sending = false;
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

  // -- the chip --------------------------------------------------------------------------------------------------

  const GREY = "#d9dde4"; // the score of a player who is not expected to start: the number stays, its colour goes
  const HEIGHT = { full: 18, compact: 15 };
  const HANG = { full: 6, compact: 3 }; // how far the chip hangs off the card's left edge, like Sorare's own do off the right
  const INSET = { full: 8, compact: 4 }; // and how far down from its top

  let tokenAt = 0;
  let tokens = {};
  /** Sorare's own colour for a level, read from the page so the chip follows its theme; the measured value otherwise. */
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

  function segment(className, text) {
    const b = document.createElement("b");
    b.className = className;
    b.textContent = text;
    return b;
  }

  /** What to draw on a card of this size: a signature (to skip redrawing what has not changed), the chip, its name. */
  function build(record, tier) {
    const slug = slugOf(record);
    const held = entryOf(record);
    const entry = held && held.entry;
    if (entry) {
      const score = Math.round(entry.x);
      const doubtful = entry.p < core.DOUBTFUL;
      const fill = doubtful ? GREY : colour(core.scoreLevel(score));
      const withChance = tier === "full" && chanceOn;
      const chip = document.createElement("span");
      chip.className = `sfx-chip${doubtful ? " sfx-chip--doubt" : ""}`;
      chip.style.setProperty("--sfx-fill", fill);
      if (doubtful) chip.style.setProperty("--sfx-red", colour("veryLow"));
      if (tier === "full") chip.append(segment("sfx-x", "X"));
      chip.append(segment("sfx-v", String(score)));
      if (withChance) chip.append(segment("sfx-c", core.chanceLabel(entry.p)));
      const label = `Sofix: expected score ${score}, ${core.chanceLabel(entry.p)} chance of playing`;
      return { sig: [tier, score, entry.p, fill, withChance].join("|"), chip, label };
    }
    if (held) return null; // asked, and Sofix has nothing on this player: a card we cannot help with draws nothing
    if (appState !== "ok") {
      if (tier !== "full") return null;
      const button = document.createElement("button"); // a real button, so it can be reached and pressed from the keyboard
      button.type = "button";
      button.className = "sfx-chip sfx-chip--auth";
      button.textContent = "Sofix";
      button.setAttribute("aria-label", appState === "auth" ? "Sofix does not recognise this extension. Open Sofix" : "Sofix is not reachable. Open Sofix");
      button.addEventListener("click", guard((event) => {
        event.preventDefault();
        event.stopPropagation();
        chrome.runtime.sendMessage({ type: "open-app", path: "/" });
      }));
      return { sig: `${tier}|auth|${appState}`, chip: button, label: "Sofix" };
    }
    if (slug && asking.has(slug)) {
      const chip = document.createElement("span");
      chip.className = "sfx-chip sfx-chip--loading";
      chip.append(segment("sfx-v", ""));
      return { sig: `${tier}|loading`, chip, label: "Sofix: loading" };
    }
    return null;
  }

  /**
   * Where the chip goes down the card's left edge. Sorare draws its own chips there on some cards (a season badge, a
   * serial number), and they differ per card, so this looks at what is actually under the strip the chip would take
   * and starts below it. Found by position and size, never by what anything is called: a backdrop or a card-sized
   * link is not a chip; a small box in the strip is.
   */
  function clearOf(media, rect, tier, width) {
    const height = HEIGHT[tier];
    const wanted = rect.top + INSET[tier];
    const limit = rect.top + rect.height * 0.45; // never sink into the player's face to get out of the way
    const left = Math.max(rect.left - HANG[tier], 2);
    const xs = [];
    for (let x = left + 1; x < left + width; x += 10) xs.push(x);
    xs.push(left + width - 1);
    let top = wanted;
    for (let round = 0; round < 4; round += 1) {
      let lowest = 0;
      for (const y of [top + 2, top + height - 2]) {
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
  function clearOfCached(record, rect, tier, width) {
    const key = [rect.left, rect.top, rect.width, rect.height, tier, Math.round(width), pageEpoch].map((n) => (typeof n === "number" ? Math.round(n) : n)).join("|");
    if (record.bandKey !== key) {
      record.bandKey = key;
      record.bandTop = clearOf(record.media, rect, tier, width);
    }
    return record.bandTop;
  }

  /** The two nearest ancestors that would cut the chip off where it hangs past the card's left edge. */
  function clippers(ribs, box) {
    const found = [];
    let node = ribs.parentElement;
    for (let level = 0; level < 2 && node && node !== document.body; level += 1, node = node.parentElement) {
      const overflow = getComputedStyle(node).overflowX;
      if (!/hidden|clip|auto|scroll/.test(overflow)) continue;
      if (box.left < node.getBoundingClientRect().left - 0.5) found.push({ node, level, scrolls: /auto|scroll/.test(overflow) });
    }
    return found;
  }

  /** Hand back what was overridden to let the chip hang out. */
  function release(record) {
    for (const node of record.anchored || []) node.classList.remove("sfx-anchor", "sfx-anchor-up");
    record.anchored = [];
  }

  /** Draws, updates or removes one card's chip. Returns true when it needs another pass to be placed. */
  function place({ record, rect, tier, ribs, box, at, top, clip }) {
    const drawn = tier === "skip" ? null : build(record, tier);
    if (!drawn) {
      if (record.ribs) record.ribs.remove();
      record.ribs = null;
      record.sig = "";
      release(record);
      return false;
    }
    let target = ribs;
    let created = false;
    if (!target || record.sig !== drawn.sig) {
      if (!target) {
        target = document.createElement("span");
        target.setAttribute("data-sfx", "");
        target.setAttribute("data-pending", ""); // hidden until it has been placed, so it never flashes in the corner
        target.setAttribute("role", "group");
        record.media.parentElement.append(target);
        record.ribs = target;
        created = true;
      }
      target.className = `sfx-ribs sfx-ribs--${tier}`;
      target.setAttribute("aria-label", drawn.label);
      target.replaceChildren(drawn.chip);
      record.sig = drawn.sig;
    }
    if (box && at) {
      // A card that sits in a box that cuts what hangs past its edge: let a wrapper that only clips (hidden) show it,
      // two levels up at most, and given back when the chip goes; one that scrolls is never touched, so the chip
      // stays inside the picture there instead.
      if ((clip || []).some((cut) => cut.scrolls)) {
        record.inside = true;
        release(record);
      } else {
        for (const { node, level } of clip || []) {
          node.classList.add(level === 0 ? "sfx-anchor" : "sfx-anchor-up");
          (record.anchored ||= []).push(node);
        }
      }
      // Sorare's layout decides where an absolutely placed box starts, so the chip is moved by how far it is from
      // where it should be, rather than worked out from their styles.
      const left = record.inside ? rect.left + HANG.compact : Math.max(rect.left - HANG[tier], 2);
      const dx = left - box.left;
      const dy = top - box.top;
      if (Math.abs(dx) > 0.5) target.style.left = `${at.left + dx}px`;
      if (Math.abs(dy) > 0.5) target.style.top = `${at.top + dy}px`;
      target.removeAttribute("data-pending");
    }
    return created || (!box && Boolean(target));
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
      const ribs = record.ribs && record.ribs.isConnected ? record.ribs : null;
      const box = ribs ? ribs.getBoundingClientRect() : null;
      return {
        record,
        rect,
        tier,
        ribs,
        box,
        at: ribs ? { left: parseFloat(ribs.style.left) || 0, top: parseFloat(ribs.style.top) || 0 } : null,
        top: tier === "skip" || !box ? rect.top + INSET.full : clearOfCached(record, rect, tier, box.width),
        clip: tier === "skip" || !box || record.inside ? null : clippers(ribs, box),
      };
    });

    let again = false;
    for (const read of reads) {
      try {
        if (place(read)) again = true;
      } catch {
        // one card that will not take a chip must not stop the others
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

  function pass() {
    frame = 0;
    if (!enabled) return;
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
        const text = `${seen}/${matched}`;
        if (text === lastReport) return;
        lastReport = text;
        try {
          chrome.runtime.sendMessage({ type: "overlay-stats", seen, matched }, () => void chrome.runtime.lastError);
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
    if (frame) cancelAnimationFrame(frame);
    frame = 0;
    clearTimeout(askTimer);
    askTimer = 0;
    for (const record of [...live]) forget(record);
    live.clear();
    asking.clear();
    lastReport = "";
    clearTimeout(reportTimer);
    reportTimer = 0;
    document.querySelectorAll("[data-sfx]").forEach((el) => el.remove());
    document.querySelectorAll(".sfx-anchor, .sfx-anchor-up").forEach((el) => el.classList.remove("sfx-anchor", "sfx-anchor-up"));
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
  // The popup's "Scores on sorare.com" writes `overlay` to storage; flipping it adds or removes the chips at once.
  // "Show chance of playing" writes `overlayChance`; it redraws them with or without that segment.

  const apply = guard((value) => (value === false ? stop() : start()));
  try {
    chrome.storage.sync.get({ overlay: true, overlayChance: true }).then(
      ({ overlay, overlayChance }) => {
        chanceOn = overlayChance !== false;
        apply(overlay);
      },
      () => apply(true),
    );
    chrome.storage.onChanged.addListener((changes, area) => {
      if (area !== "sync") return;
      if (changes.overlayChance) {
        chanceOn = changes.overlayChance.newValue !== false;
        schedule();
      }
      if (changes.overlay) apply(changes.overlay.newValue);
    });
  } catch {
    apply(true);
  }
})();
