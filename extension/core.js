// Sofix extension, shared helpers for the sorare.com overlay. Pure: no DOM writes, no chrome APIs, no storage.
// Loaded before bridge.js (page world) and before content.js / overlay.js (extension world), so a card is
// recognised the same way on both sides of the bridge. frontend/lib/overlayCore.test.ts runs this same file.
(function (root) {
  // Sorare's class names are generated and change on every deploy. Its card art is the product, so cards are
  // found by where their picture comes from, never by how the page styles them.
  const CARD_PATHS = ["cardsamplepicture/", "/card/", "/carddata/"];
  const CARD_SELECTOR = [
    'img[alt*=" - "]',
    ...CARD_PATHS.flatMap((path) => [
      `img[src*="${path}"]`,
      `video[src*="${path}"]`,
      `video[poster*="${path}"]`,
      `video source[src*="${path}"]`,
    ]),
  ].join(", ");

  /** The stable part of a card picture's address: the same card keeps it whatever size or format is served. */
  function cardImageKey(value) {
    if (typeof value !== "string" || !value) return null;
    // A resized picture may carry the original address as an encoded query value; srcset lists several.
    let text = value.trim().split(/\s+/)[0];
    try {
      text = decodeURIComponent(text);
    } catch {
      // not encoded after all
    }
    const found =
      text.match(/cardsamplepicture\/([^/?#]+)/u) ?? text.match(/\/(?:image-resize\/)?card(?:data)?\/([^/?#]+)\/(?:picture|video)\//u);
    return found ? found[1] : null;
  }

  /** A card's small face-only picture (a name in a list). It carries the card's id but is not the card. */
  function isAvatarArt(value) {
    return typeof value === "string" && /\/picture\/avatar-/.test(value);
  }

  /** "Jan Oblak - limited" -> "jan oblak": the player as an image's alt text names him. */
  function normalizeCardName(alt) {
    const head = String(alt || "").split(" - ")[0];
    return head
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, " ")
      .trim();
  }

  /**
   * Every card a GraphQL answer mentions: what its picture key stands for. A card object carries its own
   * `slug`; a lineup appearance carries it as `anyCard.slug`. Bounded, so a huge answer costs a fixed amount.
   */
  function collectCards(json, limit = 40000) {
    const found = [];
    const stack = [json];
    let visited = 0;
    while (stack.length && visited++ < limit) {
      const node = stack.pop();
      if (!node || typeof node !== "object") continue;
      if (!Array.isArray(node) && typeof node.pictureUrl === "string") {
        const key = cardImageKey(node.pictureUrl);
        if (key) {
          const player = node.player || node.anyPlayer || null;
          const cardSlug =
            typeof node.slug === "string" ? node.slug : node.anyCard && typeof node.anyCard.slug === "string" ? node.anyCard.slug : null;
          const playerSlug = player && typeof player.slug === "string" ? player.slug : null;
          const name = player && typeof player.displayName === "string" ? player.displayName : null;
          if (cardSlug || playerSlug) found.push({ key, cardSlug, playerSlug, name });
        }
      }
      for (const value of Array.isArray(node) ? node : Object.values(node)) {
        if (value && typeof value === "object") stack.push(value);
      }
    }
    return found;
  }

  /**
   * What a picture on the page is, judged by the size it is drawn at. One page shows the same card at several
   * sizes, so the route alone says nothing. `skip`: not a card (a face, a badge, a hidden or tiny picture).
   * `compact`: a lineup slot or a thumbnail, room for one number. `full`: room for the score and the chance.
   */
  function surfaceOf(width, height, round) {
    if (!(width >= 48) || !(height > 0) || round) return "skip"; // under 48px a chip would cover a tenth of the picture
    const ratio = width / height;
    if (ratio < 0.55 || ratio > 0.9) return "skip"; // a card is portrait (320 x 452); faces and crests are square
    return width <= 112 || height <= 170 ? "compact" : "full";
  }

  // How Sorare colours a football score, read from its own public script on 2026-09-29 (thresholds-*.js) and checked
  // against 42 real hexagons: the first step whose limit is >= the score, else the top colour. A chip on its card then
  // means exactly what its own numbers mean. (The board's scoreBand() in lib/cards.ts steps the same way; a test holds the two together.)
  const SCORE_STEPS = [
    [20, "veryLow"],
    [35, "low"],
    [50, "mediumLow"],
    [60, "medium"],
    [75, "mediumHigh"],
  ];

  /** Sorare's measured colours, used only when the page's own `--c-score-*` tokens cannot be read. */
  const SCORE_FALLBACK = { veryLow: "#ff5a5a", low: "#ff7e34", mediumLow: "#f0ce1d", medium: "#b6ff1a", mediumHigh: "#25ed36", high: "#00f3eb" };

  /** The type Sorare puts on those colours. It passes AA on all six. */
  const SCORE_INK = "#0e0e0e";

  /** The name of the colour Sorare gives this score, or null when there is no score. */
  function scoreLevel(score) {
    if (typeof score !== "number" || Number.isNaN(score)) return null;
    for (const [limit, level] of SCORE_STEPS) if (score <= limit) return level;
    return "high";
  }

  /** A chance the way the board writes it: ">99%", "<1%", "43%". Kept equal to chanceLabel() in lib/play.ts. */
  function chanceLabel(p) {
    if (p >= 0.995) return ">99%";
    if (p > 0 && p < 0.005) return "<1%";
    return Math.round(p * 100) + "%";
  }

  /** Below this he is not expected to start, and the tile says so with a red row of his chance of starting. */
  const DOUBTFUL = 0.5;

  // The five difficulty bands (plans/overlay.md, O10) wear five of the six colours Sorare gives a score, easiest first:
  // band 1 is the colour of a score above 75 and band 5 that of a score under 20, so the FDR reads as a Sorare number.
  const FDR_LEVEL = { 1: "high", 2: "mediumHigh", 3: "mediumLow", 4: "low", 5: "veryLow" };
  const STRIPE = ["high", "mediumHigh", "mediumLow", "low", "veryLow"];
  const fdrLevel = (bucket) => (Number.isInteger(bucket) && FDR_LEVEL[bucket]) || null;

  /** What the tile shows under the score: the difficulty of his game for a goalkeeper or defender, his xG otherwise. */
  function driverOf(pos) {
    return pos === "GK" || pos === "DEF" ? "fdr" : pos === "MID" || pos === "FWD" ? "xg" : null;
  }

  /** Under this he is not expected to play a minute from the start: the start row says he will not start. */
  const OUT_CHANCE = 0.15;

  /** The three sources of a start chance, in the order the app trusts them: two letters each, as everywhere on screen. */
  const SOURCE_ORDER = ["futbolfantasy", "sorare", "sofix"];
  const SOURCE_SHORT = { futbolfantasy: "FF", sorare: "SO", sofix: "SF" };

  /** His chance of starting: the split when the app has it, else the chance of playing an older answer carries. */
  const startChance = (entry) => (typeof entry.pStart === "number" ? entry.pStart : entry.p);

  /**
   * How the start row reads: "out" when he will not start (injured or banned, or hardly any chance), "doubt" when Futbol Fantasy
   * calls him a doubt or he is under an even chance, "ok" otherwise.
   */
  function startTone(entry) {
    const kind = entry.ffStatus && entry.ffStatus.kind;
    const p = startChance(entry);
    if (kind === "out" || kind === "suspended" || p < OUT_CHANCE) return "out";
    if (kind === "doubt" || p < DOUBTFUL) return "doubt";
    return "ok";
  }

  const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const STATUS_WORD = { out: "Out", doubt: "Doubt", suspended: "Suspended" };

  /**
   * The line under the start chance when Futbol Fantasy says something is wrong with him: "Doubt · since 12 Sep". The site's own
   * words (its cause, in Spanish) are left out: the Lineups page translates them. Null when nothing is wrong.
   */
  function statusNote(entry) {
    const status = entry.ffStatus;
    const word = status && STATUS_WORD[status.kind];
    if (!word) return null;
    const since = typeof status.since === "string" ? /^Desde (\d{1,2})\/(\d{1,2})/i.exec(status.since) : null;
    const detail = since ? "since " + Number(since[1]) + " " + (MONTHS[Number(since[2]) - 1] || since[2]) : "";
    return { kind: status.kind, text: detail ? word + " · " + detail : word };
  }

  /** The clock time of an ISO time in the viewer's own time zone, "16:56", or null. */
  function clockLabel(iso) {
    const at = typeof iso === "string" ? new Date(iso) : null;
    if (!at || Number.isNaN(at.getTime())) return null;
    return String(at.getHours()).padStart(2, "0") + ":" + String(at.getMinutes()).padStart(2, "0");
  }

  /**
   * What each source says of his first game, in the order the app trusts them. `shown` marks the one the tile uses; a source with
   * no number says so (`value` null) and is drawn faded. Futbol Fantasy's row carries the time it was read, or the reason it has no
   * number when the game is not a LaLiga one (`note`): it covers LaLiga only.
   */
  function sourceRows(entry) {
    const said = entry.sources || {};
    return SOURCE_ORDER.map((key) => {
      const shown = entry.startSource === key;
      const value = typeof said[key] === "number" ? said[key] : shown ? startChance(entry) : null;
      return {
        source: key,
        label: SOURCE_SHORT[key],
        value,
        shown,
        at: key === "futbolfantasy" && value !== null ? clockLabel(entry.startAt) : null,
        note: key === "futbolfantasy" && value === null && entry.laliga === false ? "LaLiga only" : null,
      };
    });
  }

  /** How many games he has in the gameweek the answer is about: one unless the answer lists more than one. */
  function gamesCount(entry) {
    const list = entry && entry.fixtures;
    return Array.isArray(list) && list.length > 1 ? list.length : 1;
  }

  /**
   * One of his games as a line of the panel: "Fri 18:45 · at Hungary" ("v" for a game at home), in the viewer's own time zone unless
   * one is given. Null for a game it cannot read.
   */
  function fixtureLine(fixture, timeZone) {
    const at = fixture && typeof fixture.kickoff === "string" ? new Date(fixture.kickoff) : null;
    if (!at || Number.isNaN(at.getTime()) || !fixture.opponent) return null;
    const parts = new Intl.DateTimeFormat("en-GB", { weekday: "short", hour: "2-digit", minute: "2-digit", hourCycle: "h23", ...(timeZone ? { timeZone } : {}) }).formatToParts(at);
    const of = (type) => (parts.find((part) => part.type === type) || {}).value || "";
    return `${of("weekday")} ${of("hour")}:${of("minute")} · ${fixture.venue === "H" ? "v" : "at"} ${fixture.opponent}`;
  }

  /** The most cards the drawer draws for the plan: two rows of five. */
  const DRAWER_CARDS = 10;

  /**
   * The cards of the plan as the drawer draws them: Sorare's own pictures only, every one when they fit, else the first nine
   * and a place for the rest; `more` is how many cards the plan uses that no thumbnail stands for ("+4").
   */
  function drawerCards(plan) {
    const urls = (plan && Array.isArray(plan.pics) ? plan.pics : []).filter((url) => typeof url === "string" && url.startsWith("https://assets.sorare.com/"));
    const pics = urls.length > DRAWER_CARDS ? urls.slice(0, DRAWER_CARDS - 1) : urls;
    const used = plan && Number.isFinite(plan.cardsUsed) ? plan.cardsUsed : pics.length;
    return { pics, more: Math.max(0, used - pics.length) };
  }

  // -- Futbol Fantasy, read in the browser (plans/futbolfantasy.md, S7) ---------------------------------------------------

  /**
   * A Futbol Fantasy match page's players: `{ his number: { p: chance of starting 0-1, lesion: -1 none, 0 out, 1 doubt, 2 a knock
   * he is available despite } }`. The service worker has no HTML parser, so the page is read the way it is written: each player
   * starts at the class `jugador_<number>` and says his chance and his injury code in the attributes that follow. Only the
   * eleven and the alternatives have a role (`data-onceff`), so nothing else on the page can be taken for a player. A page that
   * is not a lineup page gives nothing.
   */
  function ffPlayersOf(html) {
    const out = {};
    if (typeof html !== "string") return out;
    const parts = html.split('class="jugador_');
    for (let i = 1; i < parts.length; i++) {
      const chunk = parts[i].slice(0, 2000);
      const id = /^(\d+)/.exec(chunk);
      // The page's text is read as it is written, and the site writes `data-onceFF` with capitals: the names are matched
      // whatever their case (a parser would have lowercased them, which is how the saved test pages hid this).
      const role = /data-onceff="(?:titular|suplente)"/i.test(chunk);
      const chance = /data-probabilidad="(\d{1,3})%"/i.exec(chunk);
      if (!id || !role || !chance || Number(chance[1]) > 100) continue;
      const lesion = /data-lesion="(-?\d)"/i.exec(chunk);
      out[id[1]] = { p: Number(chance[1]) / 100, lesion: lesion ? Number(lesion[1]) : -1 };
    }
    return out;
  }

  const LESION_KIND = { 0: "out", 1: "doubt", 2: "available" };
  const third = (x) => Math.round(x * 1000) / 1000;

  /**
   * What an answer becomes when Futbol Fantasy's chance that he starts has just been read: his chance of coming on is what is
   * left, at the rate he comes on in the games he does not start (`benchedOn`, which the job publishes), and nothing when he is out.
   * The same arithmetic as `_per_game` in backend/app/sorare/forecast.py; both read backend/tests/fixtures/live_start_cases.json.
   * The plan's ticks, his xScore and the rankings stay as the job made them. Null when there is nothing to apply.
   */
  function liveSplit(entry, live, atIso) {
    if (!entry || !live || !Number.isFinite(live.p) || live.p < 0 || live.p > 1) return null;
    const rate = typeof entry.benchedOn === "number" ? entry.benchedOn : benchOnChance(entry);
    const out = live.lesion === 0;
    const pStart = out ? 0 : live.p;
    const pOn = out ? 0 : (1 - pStart) * (rate === null ? 0 : rate);
    const kind = LESION_KIND[live.lesion];
    const before = entry.ffStatus || {};
    // The injury list's cause and date are not on this page's players: they are kept while the kind stays the same.
    const ffStatus = kind ? (before.kind === kind ? before : { kind }) : before.kind === "suspended" ? before : undefined;
    return {
      pStart: third(pStart),
      pOn: third(pOn),
      startSource: "futbolfantasy",
      startAt: atIso,
      sources: { ...(entry.sources || {}), futbolfantasy: third(pStart) },
      ffStatus,
      live: true,
    };
  }

  /**
   * His score if he comes on from the bench, for the panel's second number (plans/xscore.md, P7). A substitute starts at 35 points like
   * a starter, so it is a score near 40 whatever his chance of coming on: the chance is shown beside it, never multiplied into it. A
   * payload from before that score existed carries only `bench` (the chance times a substitute's score), which keeps its old name.
   */
  function comesOnScore(entry) {
    if (typeof entry.on === "number") return { score: Math.round(entry.on), words: "if he comes on", tab: "Comes on" };
    return { score: Math.round(entry.bench), words: "if benched", tab: "Benched" };
  }

  /** Of the times he is not in the starting eleven, how often he still plays: null when the answer has no split. */
  function benchOnChance(entry) {
    if (typeof entry.pStart !== "number" || typeof entry.pOn !== "number") return null;
    if (entry.pStart >= 1) return 0;
    return Math.min(1, Math.max(0, entry.pOn / (1 - entry.pStart)));
  }

  /** "11 h ago (03:33)": how long ago, and the Madrid time it was made; the same words as Sofix's pages. Null when there is no time to read. */
  function freshLabel(iso, nowMs) {
    const age = agoLabel(iso, nowMs);
    if (age === null) return null;
    const at = new Date(iso);
    const over = nowMs - at.getTime() >= 24 * 60 * 60 * 1000;
    const parts = new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Madrid", hourCycle: "h23", weekday: over ? "short" : undefined, hour: "2-digit", minute: "2-digit" }).format(at);
    return age + " (" + parts.replace(",", "") + ")";
  }

  /** "11 h ago": the age of an ISO time, or null when there is no time to read. */
  function agoLabel(iso, nowMs) {
    const at = typeof iso === "string" ? Date.parse(iso) : Number.NaN;
    if (Number.isNaN(at)) return null;
    const minutes = Math.floor((nowMs - at) / 60000);
    if (minutes < 1) return "just now";
    if (minutes < 60) return minutes + " min ago";
    if (minutes < 60 * 24) return Math.floor(minutes / 60) + " h ago";
    return Math.floor(minutes / (60 * 24)) + " d ago";
  }

  /** A published gameweek older than this, with no refresh, is not a number to lean on. The refresh runs at least three times a day. */
  const STALE_HOURS = 24;

  /**
   * Whether a number should be greyed and why: "over" when his game has kicked off (it is about a game no longer ahead),
   * "old" when it was made more than STALE_HOURS ago. A number that cannot be dated is not greyed on a guess.
   */
  function staleness(entry, nowMs) {
    const made = typeof entry.at === "string" ? Date.parse(entry.at) : Number.NaN;
    const hours = Number.isNaN(made) ? 0 : Math.max(0, Math.floor((nowMs - made) / 3600000));
    if (entry.over) return { kind: "over", hours };
    return hours > STALE_HOURS ? { kind: "old", hours } : null;
  }

  /** The best three of a list by xScore, as `key -> 1..3`, when there are four or more to choose from. Ties keep their order. */
  function topThree(items) {
    const ranks = new Map();
    if (items.length < 4) return ranks;
    [...items]
      .map((item, index) => ({ item, index }))
      .sort((a, b) => b.item.x - a.item.x || a.index - b.index)
      .slice(0, 3)
      .forEach(({ item }, place) => ranks.set(item.key, place + 1));
    return ranks;
  }

  /** The heading Sorare puts over a list of cards to pick from: "Select your Goalkeeper". */
  const isPickHeading = (text) => typeof text === "string" && /^\s*select your\b/i.test(text);

  // Sorare names each gameweek by the dates it covers ("football-25-29-sep-2026", "football-28-aug-1-sep-2026"). When a page's
  // address carries one, that is the gameweek the cards on it are about; a month and a year are required so that nothing
  // merely called football is taken for one.
  const FIXTURE = /(?<![a-z0-9])football(?:-[a-z0-9]+)*-(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)-20\d{2}(?![a-z0-9])/i;

  /** The gameweek slug in an address, lower-cased, or null when the address names none. */
  function fixtureOf(url) {
    const found = typeof url === "string" ? FIXTURE.exec(url) : null;
    return found ? found[0].toLowerCase() : null;
  }

  root.__sofixCore = {
    CARD_SELECTOR, cardImageKey, isAvatarArt, normalizeCardName, collectCards, surfaceOf, scoreLevel, SCORE_FALLBACK, SCORE_INK,
    chanceLabel, ffPlayersOf, liveSplit, DOUBTFUL, OUT_CHANCE, SOURCE_SHORT, startTone, statusNote, clockLabel, sourceRows, drawerCards, DRAWER_CARDS, STRIPE, fdrLevel, driverOf, startChance, benchOnChance, comesOnScore, agoLabel, freshLabel, STALE_HOURS, staleness, topThree,
    isPickHeading, fixtureOf, gamesCount, fixtureLine,
  };
  if (typeof module === "object" && module && module.exports) module.exports = root.__sofixCore;
})(typeof globalThis !== "undefined" ? globalThis : this);
