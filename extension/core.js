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
  // means exactly what its own numbers mean. (The board's scoreColour() in lib/cards.ts uses other cut points.)
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

  /** Below this he is not expected to start, and the chip says so: the score is greyed and the chance is red. */
  const DOUBTFUL = 0.5;

  root.__sofixCore = { CARD_SELECTOR, cardImageKey, isAvatarArt, normalizeCardName, collectCards, surfaceOf, scoreLevel, SCORE_FALLBACK, SCORE_INK, chanceLabel, DOUBTFUL };
  if (typeof module === "object" && module && module.exports) module.exports = root.__sofixCore;
})(typeof globalThis !== "undefined" ? globalThis : this);
