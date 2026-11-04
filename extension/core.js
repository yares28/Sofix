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

  /** Odds the native Sorare page actually received. Carry identities down each branch, never between siblings. */
  function collectStartingOdds(json, limit = 40000) {
    if (!json || json.errors?.length) return [];
    const found = [];
    const stack = [{ node: json, player: null, game: null, status: null }];
    const gameId = (id) => typeof id === "string" && /^Game:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);
    const slug = (s) => typeof s === "string" && /^[a-z0-9-]{1,160}$/.test(s);
    let visited = 0;
    while (stack.length && visited++ < limit) {
      const { node, player: inheritedPlayer, game: inheritedGame, status: inheritedStatus } = stack.pop();
      if (!node || typeof node !== "object") continue;
      if (node.errors?.length) continue;
      const scoped = Object.hasOwn(node, "anyPlayerGameStats") || typeof node.slug === "string";
      // A lineup slot (Lineups page, 21 Oct 2026) names its player on its card; the start % sits in its scores, which name only the game.
      const slotPlayer = !scoped && node.anyCard && typeof node.anyCard === "object" ? node.anyCard.anyPlayer : null;
      const person = node.__typename === "Player" ? node : scoped ? (node.anyPlayer ?? node.player) : slotPlayer;
      const player = person ? (slug(person.slug) ? person.slug : null) : inheritedPlayer;
      const match = gameId(node.id) ? node : (Object.hasOwn(node, "anyPlayerGameStats") || Object.hasOwn(node, "footballPlayingStatusOdds")) ? (node.anyGame ?? node.game) : null;
      const game = match ? (gameId(match.id) ? match.id : null) : inheritedGame;
      // "scheduled" or "played" when the answer says (the Lineups page does): after kickoff Sorare's number says what happened.
      const said = match && (match.statusTyped ?? match.status);
      const status = match ? (typeof said === "string" ? said.toLowerCase() : null) : inheritedStatus;
      if (player && game && Object.hasOwn(node, "footballPlayingStatusOdds")) {
        const odds = node.footballPlayingStatusOdds;
        const n = odds?.starterOddsBasisPoints;
        if (odds === null || n === null || (Number.isInteger(n) && n >= 0 && n <= 10000)) {
          found.push({ game, player, basisPoints: n ?? null, ...(status ? { status } : {}) });
        }
      }
      for (const [key, child] of Object.entries(node)) {
        if (child && typeof child === "object") stack.push({ node: child, player: ["anyPlayer", "player"].includes(key) ? (slug(child.slug) ? child.slug : null) : player, game, status });
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

  /** Sofix and Sorare are far apart when their start chances differ by this many points or more (plans/overlay-v2.md 1.2, 3 Nov 2026). */
  const APART_POINTS = 30;

  /**
   * Sofix's start chance and Sorare's own when they are APART_POINTS or more apart; null otherwise, or when Sorare has
   * no number. `onPage` is Sorare's number as the page itself received it (the badge at the card's foot); it wins over the copy in
   * Sofix's answer, which can be missing or older.
   */
  function startDisagreement(entry, onPage) {
    const sorare = typeof onPage === "number" ? onPage : entry.sources && entry.sources.sorare;
    if (typeof sorare !== "number" || entry.startSource === "sorare") return null;
    const sofix = startChance(entry);
    return Math.round(Math.abs(sofix - sorare) * 100) >= APART_POINTS ? { sofix, sorare } : null;
  }

  const SOURCE_NAME = { futbolfantasy: "FF", sorare: "Sorare", sofix: "Sofix" };

  /**
   * Sorare's own steps for its start badge, read from its script on 3 Nov 2026 ([[49.5, "low"], [79.5, "medium"]], then "high")
   * with its colours: --c-score-veryLow, --c-yellow-400, --c-onBase-success.
   */
  const START_STEPS = [[49.5, "low"], [79.5, "medium"]];
  const START_COLOURS = { low: ["--c-score-veryLow", "#ff5a5a"], medium: ["--c-yellow-400", "#ffd914"], high: ["--c-onBase-success", "#00f3eb"] };
  function startLevel(p) {
    const pct = p * 100;
    for (const [limit, level] of START_STEPS) if (pct < limit) return level;
    return "high";
  }

  /**
   * His last ten games for the panel's "Comes on" side (plans/overlay-v2.md 1.6), from the answer's `benchRecord`: the chance he
   * comes on (came on / (came on + unused), shown from one such game; none, null), the four numbers and a bar per game, oldest
   * first, its height his minutes out of 90. Null without a record.
   */
  function comesOnRecord(entry) {
    const r = entry && entry.benchRecord;
    if (!r || typeof r.games !== "string" || !Array.isArray(r.mins)) return null;
    const benched = r.on + r.unused;
    const KIND = { S: "started", O: "on", U: "unused" };
    return {
      p: benched > 0 ? r.on / benched : null,
      started: r.started,
      on: r.on,
      unused: r.unused,
      minsOn: typeof r.minsOn === "number" ? r.minsOn : null,
      bars: [...r.games].map((k, i) => ({ kind: KIND[k] || "unused", mins: Number(r.mins[i]) || 0, h: Math.max(6, Math.min(100, Math.round(((Number(r.mins[i]) || 0) / 90) * 100))) })),
    };
  }

  // -- the team gauge on Sorare's builder (plans/overlay-v2.md 1.4, step 5) ------------------------------------------------------
  // The planner's own simulation (backend/app/sorare/planner.py `_draw`, `totals`; links.py), so the gauge reads what the plan reads.

  const TEAM_RUNS = 10000; // about 8 ms, once per pitch change; the mean within a point (the planner draws 3,000)
  const TEAM_SD = 17.6; // planner.SCORE_SD, for a player with no spread of his own
  // links.py: how far two players' scores move together, by positions, same side or opposite sides of one game
  const LINK_SAME = { "DEF|GK": 0.29, "DEF|DEF": 0.16, "FWD|FWD": 0.1, "GK|MID": 0.08, "DEF|MID": 0.07, "MID|MID": 0.08, "FWD|MID": 0.05 };
  const LINK_OPPOSITE = { "FWD|GK": -0.26, "DEF|FWD": -0.16, "GK|MID": -0.09, "DEF|MID": -0.08, "MID|MID": -0.09, "FWD|MID": -0.06, "DEF|DEF": -0.05 };

  /** The lower triangle of a correlation matrix, or null when it is not safely positive definite. */
  function cholesky(m) {
    const n = m.length;
    const l = m.map(() => new Array(n).fill(0));
    for (let i = 0; i < n; i++) {
      for (let j = 0; j <= i; j++) {
        let s = m[i][j];
        for (let k = 0; k < j; k++) s -= l[i][k] * l[j][k];
        if (i === j) {
          if (s < 0.05) return null;
          l[i][i] = Math.sqrt(s);
        } else l[i][j] = s / l[j][j];
      }
    }
    return l;
  }

  /**
   * What the cards on the pitch add up to, simulated 10,000 times with a fixed seed: `cards` as { p (chance he plays), mu (his score if
   * he plays), sd, mult (his card's bonus here), pos, game, venue, club, average, captain }, `team` as { captainBonus, clubBonus:
   * [most from one club, bonus], averageBonus: [cap, bonus], tiers: [{ need, label }] }. Returns the expected total, the 10th to 90th
   * percentile, and each tier with the chance of reaching it; null with no card.
   */
  function teamChances(cards, team, runs = TEAM_RUNS, seed = 7) {
    const list = (cards || []).filter((c) => c && Number.isFinite(c.mu) && Number.isFinite(c.p));
    if (!list.length) return null;
    const n = list.length;
    const pos = list.map((c) => String(c.pos || "")); // GK, DEF, MID or FWD, as the answer gives it
    const corr = list.map((_, i) => list.map((__, j) => (i === j ? 1 : 0)));
    for (let i = 0; i < n; i++) {
      for (let j = i + 1; j < n; j++) {
        if (!list[i].game || list[i].game !== list[j].game) continue;
        const key = [pos[i], pos[j]].sort().join("|");
        const v = (list[i].venue === list[j].venue ? LINK_SAME : LINK_OPPOSITE)[key] || 0;
        corr[i][j] = corr[j][i] = v;
      }
    }
    let low = cholesky(corr);
    // ponytail: links.py shrinks to an eigenvalue of 0.05; here the links shrink by tenths until the matrix factors
    for (let shrink = 0.9; !low && shrink > 0; shrink -= 0.1) low = cholesky(corr.map((row, i) => row.map((v, j) => (i === j ? 1 : v * shrink))));
    if (!low) low = cholesky(corr.map((row, i) => row.map((_, j) => (i === j ? 1 : 0))));
    // the lineup's own bonuses (planner._lineup_bonus): few enough cards from one club, a low enough sum of averages
    let bonus = 0;
    const t = team || {};
    if (Array.isArray(t.clubBonus)) {
      const clubs = {};
      for (const c of list) clubs[c.club] = (clubs[c.club] || 0) + 1;
      if (Math.max(...Object.values(clubs)) <= t.clubBonus[0]) bonus += t.clubBonus[1];
    }
    if (Array.isArray(t.averageBonus) && list.reduce((s, c) => s + (Number(c.average) || 0), 0) <= t.averageBonus[0]) bonus += t.averageBonus[1];
    const captainBonus = Number(t.captainBonus) || 0;
    let a = seed >>> 0;
    const next = () => {
      a = (a + 0x6d2b79f5) >>> 0;
      let x = a;
      x = Math.imul(x ^ (x >>> 15), x | 1);
      x ^= x + Math.imul(x ^ (x >>> 7), x | 61);
      return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
    };
    const normal = () => Math.sqrt(-2 * Math.log(1 - next())) * Math.cos(2 * Math.PI * next());
    const totals = new Array(runs);
    const z = new Array(n);
    for (let r = 0; r < runs; r++) {
      let total = 0;
      for (let i = 0; i < n; i++) z[i] = normal();
      for (let i = 0; i < n; i++) {
        const c = list[i];
        let shock = 0;
        for (let k = 0; k <= i; k++) shock += low[i][k] * z[k];
        if (next() >= c.p) continue;
        const score = Math.min(100, Math.max(0, c.mu + (Number.isFinite(c.sd) ? c.sd : TEAM_SD) * shock));
        total += score * ((Number(c.mult) || 1) + bonus + (c.captain ? captainBonus : 0));
      }
      totals[r] = total;
    }
    totals.sort((x, y) => x - y);
    const at = (q) => {
      const i = (runs - 1) * q;
      const lo = Math.floor(i);
      return totals[lo] + (totals[Math.min(lo + 1, runs - 1)] - totals[lo]) * (i - lo);
    };
    const reach = (need) => {
      let lo = 0;
      let hi = runs;
      while (lo < hi) {
        const mid = (lo + hi) >> 1;
        if (totals[mid] < need) lo = mid + 1;
        else hi = mid;
      }
      return (runs - lo) / runs;
    };
    const tiers = (t.tiers || []).filter((tier) => Number.isFinite(tier.need)).sort((x, y) => x.need - y.need).map((tier) => ({ ...tier, p: reach(tier.need) }));
    return { x: totals.reduce((s, v) => s + v, 0) / runs, lo: at(0.1), hi: at(0.9), n, bonus, tiers };
  }

  /**
   * The team panel's three rings: the level the total most likely ends on (nothing, or a tier) in the centre, the one below on the
   * left and the one above on the right (null past either end). Each with the chance shown: for nothing, the chance of ending there;
   * for a tier, the chance of reaching it. A tie goes to the lower level.
   */
  function teamRings(tiers) {
    const list = tiers || [];
    if (!list.length) return null;
    const levels = [{ label: "No reward", need: null, p: 1 - list[0].p, end: 1 - list[0].p }, ...list.map((tier, i) => ({ ...tier, end: tier.p - (list[i + 1] ? list[i + 1].p : 0) }))];
    let at = 0;
    levels.forEach((level, i) => {
      if (level.end > levels[at].end + 1e-9) at = i;
    });
    const ring = (level) => (level ? { label: level.label, need: level.need, p: level.p } : null);
    return { below: ring(levels[at - 1]), at: ring(levels[at]), above: ring(levels[at + 1]) };
  }

  /**
   * The card on Sorare's builder pitch Sofix would make captain, from `{ x, captain }` per pitch card: the highest xScore (Sorare
   * adds bonuses together, so the captain's bonus is worth most on the best score whatever the card's own bonus), first on a tie.
   * -1 when no card has a number, or when Sorare already has that card as captain.
   */
  function captainPick(cards) {
    let best = -1;
    cards.forEach((card, i) => {
      if (Number.isFinite(card.x) && (best < 0 || card.x > cards[best].x)) best = i;
    });
    return best >= 0 && cards[best].captain ? -1 : best;
  }

  /** The start % chip's hover: "Sofix 83% · Sorare 80%" on a full card, the number's own source on a small one ("FF 90%"). */
  function startHover(entry, onPage, full) {
    const mine = chanceLabel(startChance(entry));
    if (!full || entry.startSource === "sorare") return `${SOURCE_NAME[entry.startSource] || "Sofix"} ${mine}`;
    const sorare = typeof onPage === "number" ? onPage : entry.sources && entry.sources.sorare;
    return typeof sorare === "number" ? `Sofix ${mine} · Sorare ${chanceLabel(sorare)}` : `Sofix ${mine}`;
  }

  const SOURCE_FROM = { futbolfantasy: "Futbol Fantasy's expected lineup", sorare: "Sorare's starter odds", sofix: "his form" };

  /** The start row's hover: that the number is Sofix's, whose number it stands on, and Sorare's when the two disagree. */
  function startTitle(entry, onPage) {
    const from = SOURCE_FROM[entry.startSource];
    const apart = startDisagreement(entry, onPage);
    return (
      `Sofix: ${chanceLabel(startChance(entry))} to start${from ? ` (from ${from})` : ""}` +
      (apart ? `. Sorare says ${chanceLabel(apart.sorare)}: they disagree` : "")
    );
  }

  /** Whose gallery a page is ("/football/my-club/yares/cards/limited" -> "yares"), or null when it is not a gallery. */
  function galleryOf(pathname) {
    const found = /^\/football\/my-club\/([a-z0-9][a-z0-9_-]{0,80})\/cards(?:\/[a-z_]+)?\/?$/i.exec(String(pathname || ""));
    return found ? found[1].toLowerCase() : null;
  }

  /** A player's Sorare page or one of its tabs (/football/players/<slug>/fixtures, …): his slug, else null. */
  function playerPageOf(pathname) {
    const found = /^\/football\/players\/([a-z0-9][a-z0-9-]{0,80})(?:\/[a-z-]+){0,2}\/?$/.exec(String(pathname || ""));
    return found ? found[1] : null;
  }

  /** The strip's last word on him: yours and the plan's lineups he is in, or what he would add to your squad (the Players page's verdict). */
  function verdictLine(profile) {
    if (profile.yours) return { text: profile.inPlan.length ? `Yours · in ${profile.inPlan.join(", ")}` : "Yours · not in the plan", tone: "own" };
    const v = profile.verdict;
    if (!v) return null;
    return v.kind === "up" ? { text: `Upgrade ${v.value} ${v.note}`, tone: "up" } : { text: `${v.value} · ${v.note}`, tone: "flat" };
  }

  const euros = (amount) => `€${amount.toFixed(2)}`;
  const tone = (amount) => (amount > 0.005 ? "up" : amount < -0.005 ? "down" : "flat"); // the Prices page's own cut-off

  /** A gallery card's line: its worth now, and how far that is up or down on what you paid ("not bought" for a crafted or won card). */
  function worthLine(paid, value) {
    const now = `now ${euros(value)}`;
    if (paid === null) return { now, change: "not bought", tone: "free" };
    const t = tone(value - paid);
    const percent = Math.round((Math.abs(value - paid) / paid) * 100);
    return { now, change: t === "up" ? `▲${percent}%` : t === "down" ? `▼${percent}%` : "level", tone: t };
  }

  /** The gallery's box: the bought cards' worth now, what they cost, and the difference, as the Prices page says them. */
  function worthTotal(w) {
    const t = tone(w.profit);
    const percent = w.paid > 0 ? Math.round((Math.abs(w.profit) / w.paid) * 100) : 0;
    const change = t === "flat" ? euros(0) : `${t === "up" ? "▲" : "▼"} ${euros(Math.abs(w.profit))} · ${t === "up" ? "+" : "−"}${percent}%`;
    return { now: euros(w.worth), paid: `paid ${euros(w.paid)} for ${w.bought} card${w.bought === 1 ? "" : "s"}`, change, tone: t };
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


  /** One of your picks for a mission, as Sorare lists it: the player, his game, the card's rarity and Sorare's verdict (READY, SUCCESS, FAILURE). */
  function missionPick(node) {
    const player = node && node.anyPlayer && node.anyPlayer.slug;
    if (typeof player !== "string" || !player) return null;
    const game = node.game && node.game.id;
    return {
      player: player.slice(0, 120),
      game: typeof game === "string" ? game.slice(0, 80) : null,
      rarity: typeof node.rarity === "string" ? node.rarity.toLowerCase().slice(0, 20) : null,
      status: typeof node.status === "string" ? node.status.slice(0, 20) : null,
      ...(node.anyCard?.slug ? { card: String(node.anyCard.slug).slice(0, 120) } : {}),
      ...(node.id ? { id: String(node.id).slice(0, 120) } : {}),
      ...(typeof node.locked === "boolean" ? { locked: node.locked } : {}),
      ...(typeof node.score === "number" ? { score: node.score } : {}),
      ...(typeof node.target === "number" ? { target: node.target } : {}),
    };
  }

  /**
   * The daily missions a Sorare answer lists: every `DecisivePlayerPickerTask` in it, cut down to what Sofix ranks cards by (its name, the rule in words, its
   * mode, how many picks, how many were made, the XP or essence it pays in the rule's words), its rarity, the stats it counts and your picks with Sorare's
   * verdict, when the answer has them. An expired mission or one without a name is left out. Bounded like `collectCards`. Nothing else of the answer is kept.
   */
  function collectMissions(json, limit = 40000, archived = false) {
    const found = new Map();
    const stack = [json];
    let visited = 0;
    while (stack.length && visited++ < limit) {
      const node = stack.pop();
      if (!node || typeof node !== "object") continue;
      if (!Array.isArray(node) && node.__typename === "DecisivePlayerPickerTask" && typeof node.id === "string" && typeof node.title === "string" && node.title && (archived || node.expired !== true)) {
        const appearances = Array.isArray(node.taskAppearances) ? node.taskAppearances : [];
        found.set(node.id, {
          id: node.id,
          title: node.title.slice(0, 80),
          description: typeof node.description === "string" ? node.description.slice(0, 1000) : "",
          mode: node.mode === "SCORE" ? "SCORE" : "DECISIVE",
          picks: Number.isInteger(node.maxAppearancesCount) ? node.maxAppearancesCount : 3,
          made: appearances.length,
          period: typeof node.periodicity === "string" ? node.periodicity : null,
          state: typeof node.aasmState === "string" ? node.aasmState : null,
          rarity: typeof node.rarity === "string" ? node.rarity.toLowerCase().slice(0, 20) : null,
          ...(node.startDate ? { startDate: String(node.startDate).slice(0, 40) } : {}),
          ...(node.taskConfigSlug ? { config: String(node.taskConfigSlug).slice(0, 120) } : {}),
          ...(Array.isArray(node.displayedTypedRules) ? { ruleTypes: node.displayedTypedRules.map((r) => String(r.__typename).slice(0, 80)).slice(0, 20) } : {}),
          ...(Array.isArray(node.rewardConfigs) ? { rewards: node.rewardConfigs.slice(0, 20).map((r) => ({ type: String(r.__typename).slice(0, 80), ...(typeof r.quantity === "number" ? { amount: r.quantity } : typeof r.amount === "number" ? { amount: r.amount } : {}), label: String(r.title ?? r.description ?? r.flavour?.displayName ?? r.currency ?? "").slice(0, 300) })) } : {}),
          ...(Array.isArray(node.statThresholds) ? { thresholds: node.statThresholds.slice(0, 20).map((t) => ({ stat: String(t.stat).slice(0, 40), min: Number(t.min) })) } : {}),
          ...(node.overperform ? { overperform: { by: Number(node.overperform.by), averageType: String(node.overperform.averageType).slice(0, 40) } } : {}),
          stats: Array.isArray(node.decisiveStats)
            ? node.decisiveStats.map((stat) => (stat && typeof stat.name === "string" ? stat.name.slice(0, 40) : null)).filter(Boolean).slice(0, 20)
            : [],
          appearances: appearances.map(missionPick).filter(Boolean).slice(0, 10),
        });
      }
      for (const value of Array.isArray(node) ? node : Object.values(node)) {
        if (value && typeof value === "object") stack.push(value);
      }
    }
    return [...found.values()].sort((a, b) => a.title.localeCompare(b.title) || a.id.localeCompare(b.id));
  }

  /** The rarity a missions question asked for ("rare" -> "rare"), from the request's own variables, or null: one answer is one rarity's missions. */
  function missionsAsked(body) {
    try {
      const sent = typeof body === "string" ? JSON.parse(body) : null;
      const rarity = sent && sent.operationName === "MissionsCategoryRarityPageQuery" && sent.variables && sent.variables.rarity;
      return typeof rarity === "string" && /^(limited|rare|super_rare|unique|custom_series)$/i.test(rarity) ? rarity.toLowerCase() : null;
    } catch {
      return null;
    }
  }

  /** The rarity a missions page is about, from its address ("/football/missions/play/limited" -> "limited"), or null. */
  function missionsRarity(pathname) {
    const found = /^\/football\/(?:play\/)?missions\/[a-z-]+\/(limited|rare|super_rare|unique|custom_series)\/?$/i.exec(String(pathname || ""));
    return found ? found[1].toLowerCase() : null;
  }

  // -- The dock (extension/dock.js) ---------------------------------------------------------------------------------------

  /** A picture the dock may draw: Sorare's own, nothing else (the app's answer is data, never a place to load from). */
  const sorarePic = (url) => (typeof url === "string" && url.startsWith("https://assets.sorare.com/") ? url : "");

  /** The lock in the pill's words: "Locks 16:00", "Locks in 42 min" in its last hour, "Locked" after. Madrid time, as Sorare shows it to you. */
  function lockLabel(iso, now = Date.now()) {
    const at = typeof iso === "string" ? Date.parse(iso) : NaN;
    if (!Number.isFinite(at)) return { text: "", soon: false };
    const left = at - now;
    if (left <= 0) return { text: "Locked", soon: false };
    if (left < 60 * 60 * 1000) return { text: `Locks in ${Math.max(1, Math.round(left / 60000))} min`, soon: true };
    const time = new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Madrid", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(at);
    const day = new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Madrid", weekday: "short" });
    return { text: day.format(at) === day.format(now) ? `Locks ${time}` : `Locks ${day.format(at)} ${time}`, soon: false };
  }

  /** How many mission swaps Sofix would make today: the pill's badge. */
  function swapCount(missions) {
    const list = missions && Array.isArray(missions.missions) ? missions.missions : [];
    return list.reduce((sum, one) => sum + (Array.isArray(one && one.swaps) ? one.swaps.length : 0), 0);
  }

  /**
   * Sorare's answer to one Apply step from the dock, read as lib/apply.ts reads it for the app: `ok` with the rules it broke (in its own
   * words), the lineup it saved and those it holds; `rejected` with its words; or why the step could not run. Anything that does not prove
   * the step happened is an `error`, so a press is never taken for a success it was not.
   */
  function stepAnswer(response, step) {
    if (!response || typeof response !== "object") return { state: "error" };
    if (response.state === "rejected") return { state: "rejected", errors: (Array.isArray(response.errors) ? response.errors : []).map(String).slice(0, 4) };
    if (response.state !== "ok") return { state: response.state === "unknown" ? "no-bridge" : ["no-tab", "no-bridge", "timeout"].includes(response.state) ? response.state : "error" };
    const data = response.data && typeof response.data === "object" ? response.data : null;
    const board = data && data.so5 && data.so5.so5Leaderboard;
    const write = data && (data.createOrUpdateSo5Lineup || data.confirmSo5Lineups);
    if (write && Array.isArray(write.errors) && write.errors.length) return { state: "rejected", errors: write.errors.map((e) => String(e && e.message)).slice(0, 4) };
    const confirmed = data && data.confirmSo5Lineups && Array.isArray(data.confirmSo5Lineups.so5Lineups) ? data.confirmSo5Lineups.so5Lineups : null;
    const saved = step === "draft" ? data && data.createOrUpdateSo5Lineup && data.createOrUpdateSo5Lineup.so5Lineup : step === "enter" ? confirmed && confirmed[0] : null;
    const proven =
      step === "check" ? Boolean(board && board.previewSo5Lineup)
        : step === "entered" ? Boolean(board && Array.isArray(board.mySo5Lineups))
          : step === "draft" ? Boolean(saved && saved.id && saved.draft === true)
            : step === "enter" ? Boolean(saved && saved.id && confirmed.every((one) => one && one.draft === false))
              : false;
    if (!proven) return { state: "error" };
    const rules = (board && board.previewSo5Lineup && Array.isArray(board.previewSo5Lineup.feedbackRules) ? board.previewSo5Lineup.feedbackRules : [])
      .filter((rule) => rule && rule.state === "INVALID")
      .map((rule) => String(rule.message || rule.ruleName));
    const entered = (board && Array.isArray(board.mySo5Lineups) ? board.mySo5Lineups : []).map((one) => ({
      id: String(one.id),
      draft: one.draft === true,
      cards: (Array.isArray(one.so5Appearances) ? one.so5Appearances : []).map((slot) => (slot && (slot.anyCard || slot.card) || {}).slug).filter(Boolean),
    }));
    return { state: "ok", broken: rules, lineupId: saved ? String(saved.id) : null, entered };
  }

  /**
   * What your entered lineups of a gameweek have scored so far, from Sorare's answer to the dock's read of them: the sum of the
   * entered ones (drafts are no entry) and, per competition, the best of them. `null` when the answer is not a gameweek's lineups,
   * so a failed read is never shown as a score of 0. A lineup Sorare has not scored yet counts for nothing.
   */
  function liveScores(response) {
    if (!response || response.state !== "ok") return null;
    const fixture = response.data && response.data.so5 && response.data.so5.so5Fixture;
    if (!fixture || !Array.isArray(fixture.mySo5Lineups)) return null;
    const byBoard = {};
    let total = 0;
    let lineups = 0;
    for (const lineup of fixture.mySo5Lineups) {
      if (!lineup || lineup.draft !== false) continue;
      const board = lineup.so5Leaderboard && lineup.so5Leaderboard.slug;
      const ranks = Array.isArray(lineup.so5Rankings) ? lineup.so5Rankings : [];
      const rank = ranks.find((one) => one && one.so5Leaderboard && one.so5Leaderboard.slug === board) || ranks[0];
      if (!board || !rank || typeof rank.score !== "number") continue;
      total += rank.score;
      lineups += 1;
      byBoard[board] = Math.max(byBoard[board] === undefined ? -Infinity : byBoard[board], rank.score); // ponytail: the best of several entries in one competition
    }
    return { total: Math.round(total), lineups, byBoard };
  }

  // -- Sorare's lineup page (checked on the page itself, 20 Oct 2026) -------------------------------------------------------
  // A slot is a button labelled "Select <player>" once a card is in it and "Select DEF", "Select MID"... while it is empty. The
  // cards to pick from sit under "Pick <player>". The captain is not chosen on this page, so a total here is the cards' scores alone.

  /** The competition a lineup page is about, from its address ("/football/play/classic/compose/<slug>"), or null. */
  function composeBoard(pathname) {
    const found = /^\/football\/play\/(?:classic\/)?compose\/([a-z0-9_-]{1,120})\/?$/i.exec(String(pathname || ""));
    return found ? found[1].toLowerCase() : null;
  }

  /**
   * What the cards in a lineup page's slots add up to, from `{ label, width, score }` per slot button: the button's label without "Select ",
   * its width in pixels and the score on Sofix's tile in it (NaN when it has none yet). Empty slots (a position's name) and the small
   * bench boxes (under 90 px; unconfirmed for a filled bench card) are left out, as is a card whose tile has not arrived.
   */
  function composeSum(items) {
    let n = 0;
    let total = 0;
    for (const one of Array.isArray(items) ? items : []) {
      if (!one || /^(GK|DEF|MID|FWD|EX|SUB|GK SUB)$/.test(String(one.label).trim()) || !(one.width >= 90) || !Number.isFinite(one.score)) continue;
      n += 1;
      total += one.score;
    }
    return { n, total };
  }

  /** Whether Sorare already holds this lineup entered (the same cards, not a draft): entering it again would spend a second slot. */
  function alreadyEntered(entered, cardSlugs) {
    const want = [...cardSlugs].sort().join(",");
    return (entered || []).some((one) => !one.draft && [...one.cards].sort().join(",") === want);
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


  const bell = (x, mean, sd) => Math.exp(-0.5 * ((x - mean) / sd) ** 2) / sd;




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

  // Points needed (plans/points-needed.md), the same calculation as frontend/lib/pointsNeeded.ts (frontend/lib/overlayCore.test.ts
  // checks they agree): each scoring card's equal share of the step's target, divided by its multiplier, the 100-point ceiling
  // shared out again; during the games what is still needed from now. Cards: { multiplier|null, unknown?, state: "to play" |
  // "live" | "finished", raw|null }.
  const NEED_EPS = 1e-9;
  function pointsNeeded(target, cards, size = 5) {
    const none = (reason, state = "unknown") => ({ state, current: null, remaining: null, room: null, cards: cards.map(() => ({ kind: "unknown", reason })) });
    if (typeof target !== "number" || !Number.isFinite(target) || target <= 0) return none("no target for this step");
    if (cards.length < size) return none(`the lineup has ${cards.length} of ${size} cards`, "incomplete");
    const blind = cards.find((c) => c.state !== "to play" && (c.raw === null || c.multiplier === null));
    if (blind) return none(blind.raw === null ? "a started card's score is unknown" : blind.unknown || "a started card's bonus is unknown");
    const raw = (c) => (c.state === "to play" ? 0 : c.raw);
    const contribution = (c) => (c.state === "to play" ? 0 : c.raw * c.multiplier);
    const current = cards.reduce((sum, c) => sum + contribution(c), 0);
    const remaining = Math.max(0, target - current);
    if (remaining <= NEED_EPS) return { state: "reached", current, remaining: 0, room: 0, cards: cards.map((c) => ({ kind: "reached", contribution: c.state === "to play" ? null : contribution(c) })) };
    const open = cards.map((c, i) => ({ c, i, room: c.multiplier === null ? Infinity : Math.max(0, 100 - raw(c)) * c.multiplier }))
      .filter(({ c, room }) => c.state !== "finished" && room > NEED_EPS);
    const room = open.some((o) => !Number.isFinite(o.room)) ? null : open.reduce((sum, o) => sum + o.room, 0);
    const out = cards.map((c) => ({ kind: "settled", contribution: contribution(c) }));
    if (room !== null && room < remaining - NEED_EPS) {
      for (const o of open) out[o.i] = { kind: "unreachable" };
      return { state: "unreachable", current, remaining, room, cards: out };
    }
    // One level for every card still able to score, counting what it has already (the owner, 3 Nov 2026); frontend/lib/pointsNeeded.ts.
    const goal = target - cards.reduce((sum, c) => sum + (c.state === "finished" ? contribution(c) : 0), 0);
    const end = (o, level) => Math.max(contribution(o.c), Math.min(level, contribution(o.c) + o.room));
    let low = 0;
    let high = Math.max(...open.map((o) => contribution(o.c) + (Number.isFinite(o.room) ? o.room : goal)), goal);
    for (let step = 0; step < 100; step += 1) {
      const level = (low + high) / 2;
      if (open.reduce((sum, o) => sum + end(o, level), 0) < goal) low = level;
      else high = level;
    }
    for (const o of open) {
      out[o.i] = o.c.multiplier === null ? { kind: "unknown", reason: o.c.unknown || "score bonus unknown" }
        : { kind: "need", raw: Math.min(high, contribution(o.c) + o.room) / o.c.multiplier, share: end(o, high), live: o.c.state === "live", multiplier: o.c.multiplier, ...(o.c.state === "live" ? { now: raw(o.c) } : {}) };
    }
    return { state: "open", current, remaining, room, cards: out };
  }
  const needRoundUp = (x) => Math.ceil(x * 10 - 1e-6) / 10;
  const needRoundDown = (x) => Math.floor(x * 10 + 1e-6) / 10;
  const needOne = (x) => String(Math.round(x * 10) / 10);
  function needBadge(result, i, target, captain = false) {
    const c = result.cards[i];
    const goal = typeof target === "number" ? `the ${needOne(target)}-point target` : "the target";
    const bonus = (m) => `Score bonus: ${m > 1 + NEED_EPS ? `+${Math.round((m - 1) * 100)}%` : "none"}${captain ? " (captain included)" : ""}.`;
    if (!c || c.kind === "unknown") return { label: "—", detail: `Points needed unknown: ${c && c.kind === "unknown" ? c.reason : "no data"}.`, tone: "unknown" };
    if (c.kind === "reached") return { label: "✓", detail: `Target reached on provisional scores: ${needOne(result.current || 0)} of ${needOne(target || 0)}. Sorare validates the result after the games${c.contribution === null ? "" : `; this card has ${needOne(c.contribution)}`}.`, tone: "reached" };
    if (c.kind === "settled") return { label: "✓", detail: `Finished: contributed ${needOne(c.contribution)} toward ${goal}.`, tone: "settled" };
    if (c.kind === "unreachable") return { label: "Unreachable", detail: `Even 100 from every card still able to score adds ${needOne(result.room || 0)}, short of the ${needOne(result.remaining || 0)} still needed for ${goal}.`, tone: "unreachable" };
    const sofar = result.current ? ` (${needOne(result.current)} so far)` : "";
    if (c.live && c.now !== undefined) {
      const gap = c.raw - c.now; // playing: "-7" short of the score he should end on, "+3" past it (the owner, 3 Nov 2026)
      return gap > NEED_EPS
        ? { label: `-${needRoundUp(gap)}`, detail: `${needOne(c.now)} so far: ${needRoundUp(gap)} short of the ${needRoundUp(c.raw)} he should end on, to contribute ${needOne(c.share)} toward ${goal}${sofar}. ${bonus(c.multiplier)}`, tone: "live" }
        : { label: `+${needRoundDown(-gap)}`, detail: `${needOne(c.now)} so far: ${needRoundDown(-gap)} past the ${needRoundUp(c.raw)} he should end on; the others need less. ${bonus(c.multiplier)}`, tone: "ahead" };
    }
    return c.live
      ? { label: `-${needRoundUp(c.raw)}`, detail: `Needs ${needRoundUp(c.raw)} raw points toward ${goal}${sofar}. ${bonus(c.multiplier)}`, tone: "live" }
      : { label: String(needRoundUp(c.raw)), detail: `Needs ${needRoundUp(c.raw)} raw points to contribute ${needOne(c.share)} toward ${goal}${sofar}. ${bonus(c.multiplier)}`, tone: "need" };
  }

  // The crest above each card and its island (plans/overlay-v2.md 1.2, step 2). `entry.island` is the app's list of his games, kickoff order.
  const LIVE_FOR_MS = 115 * 60 * 1000; // from kick-off to the final whistle, stoppages included (the points-needed pill uses the same)
  /** What the crest shows: "out" (sure not to play), "live" (his game is on), "crests" (one per game), or "none" (no game). */
  function crestState(entry, now) {
    const games = entry && Array.isArray(entry.island) ? entry.island.filter((g) => g && g.opponent) : [];
    if (!games.length) return { kind: "none", games: [] };
    if (entry.ffStatus && entry.ffStatus.kind === "out") return { kind: "out", games: games.slice(0, 1) };
    const at = Date.parse(games[0].kickoff);
    if (Number.isFinite(at) && now >= at && now < at + LIVE_FOR_MS) return { kind: "live", games: games.slice(0, 1) };
    return { kind: "crests", games: games.slice(0, 2) };
  }
  /** The three letters on the shield that stands in for a crest Sorare does not have: Sorare's own code, else the name's first three. */
  function shieldCode(game) {
    const code = game && typeof game.opponentCode === "string" && game.opponentCode.trim();
    if (code) return code.slice(0, 4).toUpperCase();
    const name = game && typeof game.opponent === "string" ? game.opponent.normalize("NFD").replace(/[^A-Za-z]/g, "") : "";
    return name ? name.slice(0, 3).toUpperCase() : "?";
  }
  /** "Wed 4 Nov · 21:00", in Madrid; "Date TBC" when there is no date. */
  function islandWhen(kickoff) {
    const at = typeof kickoff === "string" ? new Date(kickoff) : null;
    if (!at || Number.isNaN(at.getTime())) return "Date TBC";
    const parts = new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Madrid", weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(at);
    const of = (type) => (parts.find((part) => part.type === type) || {}).value || "";
    return `${of("weekday")} ${of("day")} ${of("month")} · ${of("hour")}:${of("minute")}`;
  }
  const COMPETITIONS = {
    "laliga-es": "LaLiga", "premier-league-gb-eng": "Premier League", "bundesliga-de": "Bundesliga", "ligue-1-fr": "Ligue 1",
    "serie-a-it": "Serie A", "uefa-champions-league": "Champions League", "uefa-europa-league": "Europa League",
    "uefa-europa-conference-league": "Conference League", "uefa-nations-league": "Nations League",
  };
  /** A competition by its name; one not listed by its slug's words ("copa-del-rey" → "Copa Del Rey"). */
  function competitionName(slug) {
    if (typeof slug !== "string" || !slug) return "";
    return COMPETITIONS[slug] || slug.split("-").filter(Boolean).map((w) => w[0].toUpperCase() + w.slice(1)).join(" ");
  }
  /** Sorare's six score colours, worst sixth first: a game stat's place among the week's games (plans/overlay-v2.md 7). */
  const SIXTHS = ["#ff5a5a", "#ff7e34", "#f0ce1d", "#b6ff1a", "#25ed36", "#00f3eb"];

  root.__sofixCore = {
    crestState, shieldCode, islandWhen, competitionName, SIXTHS,
    CARD_SELECTOR, cardImageKey, isAvatarArt, normalizeCardName, collectCards, collectStartingOdds, surfaceOf, scoreLevel, SCORE_FALLBACK, SCORE_INK,
    chanceLabel, ffPlayersOf, liveSplit, DOUBTFUL, OUT_CHANCE, SOURCE_SHORT, startTone, startDisagreement, startTitle, startHover, startLevel, START_COLOURS, captainPick, comesOnRecord, teamChances, teamRings, galleryOf, playerPageOf, verdictLine, worthLine, worthTotal, statusNote, clockLabel, sourceRows, sorarePic, lockLabel, swapCount, stepAnswer, liveScores, composeBoard, composeSum, alreadyEntered, STRIPE, fdrLevel, driverOf, startChance, benchOnChance, comesOnScore, agoLabel, freshLabel, STALE_HOURS, staleness, topThree,
    isPickHeading, fixtureOf, gamesCount, collectMissions, missionsRarity, missionsAsked, pointsNeeded, needBadge,
  };
  if (typeof module === "object" && module && module.exports) module.exports = root.__sofixCore;
})(typeof globalThis !== "undefined" ? globalThis : this);
