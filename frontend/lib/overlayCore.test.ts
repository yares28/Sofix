import { createRequire } from "node:module";
import { describe, expect, it } from "vitest";
import { contrastRatio } from "./contrast";
import { chanceLabel } from "./play";

// extension/core.js is a plain script the browser loads before the overlay. It is required here as it is, not copied.
type Core = {
  CARD_SELECTOR: string;
  cardImageKey: (value: unknown) => string | null;
  isAvatarArt: (value: unknown) => boolean;
  normalizeCardName: (alt: unknown) => string;
  collectCards: (json: unknown, limit?: number) => { key: string; cardSlug: string | null; playerSlug: string | null; name: string | null }[];
  surfaceOf: (width: number, height: number, round?: boolean) => "full" | "compact" | "skip";
  scoreLevel: (score: number | null) => "veryLow" | "low" | "mediumLow" | "medium" | "mediumHigh" | "high" | null;
  SCORE_FALLBACK: Record<string, string>;
  SCORE_INK: string;
  chanceLabel: (p: number) => string;
  DOUBTFUL: number;
};
const core = createRequire(import.meta.url)("../../extension/core.js") as Core;

// Real card pictures, as the approved overlay design (docs/sorare/design/S7-overlay.html) carries them.
const OBLAK = "https://assets.sorare.com/card/c0af94c9-927b-422e-ac4e-a051f16e72ae/picture/tinified-4e59e1794fe68061a586ff8ba74fd171.png";
const FOYTH = "https://assets.sorare.com/card/e7524f8c-2531-4b10-9172-5a99cf7eec61/picture/tinified-dff1d4ffb9118c35d267983bcc51a3a0.png";

describe("cardImageKey", () => {
  it("is the card's own id, whatever derivative is served", () => {
    expect(core.cardImageKey(OBLAK)).toBe("c0af94c9-927b-422e-ac4e-a051f16e72ae");
    expect(core.cardImageKey(OBLAK.replace("tinified-4e59", "low_res-0000"))).toBe("c0af94c9-927b-422e-ac4e-a051f16e72ae");
    expect(core.cardImageKey("https://assets.sorare.com/image-resize/card/e7524f8c-2531-4b10-9172-5a99cf7eec61/video/x.mp4")).toBe(
      "e7524f8c-2531-4b10-9172-5a99cf7eec61",
    );
    expect(core.cardImageKey("https://assets.sorare.com/carddata/abc123/picture/p.png?w=200#x")).toBe("abc123");
  });

  it("reads an original address wrapped in a resizer's query, and the first candidate of a srcset", () => {
    expect(core.cardImageKey(`https://sorare.com/_next/image?url=${encodeURIComponent(FOYTH)}&w=256&q=75`)).toBe(
      "e7524f8c-2531-4b10-9172-5a99cf7eec61",
    );
    expect(core.cardImageKey(`${OBLAK} 1x, ${FOYTH} 2x`)).toBe("c0af94c9-927b-422e-ac4e-a051f16e72ae");
  });

  it("reads a sample picture", () => {
    expect(core.cardImageKey("https://assets.sorare.com/cardsamplepicture/jan-oblak-2026/x.png")).toBe("jan-oblak-2026");
  });

  it("is null for anything that is not card art", () => {
    expect(core.cardImageKey("https://assets.sorare.com/player/football/unai-simon/avatar.png")).toBeNull();
    expect(core.cardImageKey("https://assets.sorare.com/club/getafe-cf/logo.png")).toBeNull();
    expect(core.cardImageKey("")).toBeNull();
    expect(core.cardImageKey(undefined)).toBeNull();
    expect(core.cardImageKey("%E0%A4%A")).toBeNull(); // a broken escape must not throw
  });
});

describe("isAvatarArt", () => {
  it("tells a card's small face-only derivative from the card", () => {
    // Seen on a real player page: the same card id, drawn 18px wide next to a name.
    const avatar = "https://assets.sorare.com/image-resize/card/c0af94c9-927b-422e-ac4e-a051f16e72ae/picture/avatar-4e59e1794fe68061a586ff8ba74fd171.png?width=40";
    expect(core.cardImageKey(avatar)).toBe("c0af94c9-927b-422e-ac4e-a051f16e72ae");
    expect(core.isAvatarArt(avatar)).toBe(true);
    expect(core.isAvatarArt(OBLAK)).toBe(false);
    expect(core.isAvatarArt("https://assets.sorare.com/image-resize/card/cc2d2a9a-fccf-4647-ab01-b02b27c45067/picture/tinified-fb33.png?width=80")).toBe(false);
    expect(core.isAvatarArt(undefined)).toBe(false);
  });
});

describe("normalizeCardName", () => {
  it("keeps the player and drops the rest of the alt text", () => {
    expect(core.normalizeCardName("Jan Oblak - Limited 2023 - #344")).toBe("jan oblak");
    expect(core.normalizeCardName("Unai Simón - Limited")).toBe("unai simon");
    expect(core.normalizeCardName("  Pau   Cubarsí  ")).toBe("pau cubarsi");
    expect(core.normalizeCardName(undefined)).toBe("");
  });
});

describe("collectCards", () => {
  it("finds a card and, inside a lineup, the card an appearance stands for", () => {
    const answer = {
      data: {
        card: { slug: "jan-oblak-2023-limited-344", pictureUrl: OBLAK, anyPlayer: { slug: "jan-oblak", displayName: "Jan Oblak" } },
        so5: {
          so5Fixture: {
            mySo5Lineups: [
              { so5Appearances: [{ id: "a1", pictureUrl: FOYTH, player: { slug: "juan-marcos-foyth", displayName: "Juan Foyth" }, anyCard: { slug: "juan-marcos-foyth-2026-limited-238" } }] },
            ],
          },
        },
      },
    };
    const found = core.collectCards(answer);
    expect(found).toContainEqual({
      key: "c0af94c9-927b-422e-ac4e-a051f16e72ae",
      cardSlug: "jan-oblak-2023-limited-344",
      playerSlug: "jan-oblak",
      name: "Jan Oblak",
    });
    expect(found).toContainEqual({
      key: "e7524f8c-2531-4b10-9172-5a99cf7eec61",
      cardSlug: "juan-marcos-foyth-2026-limited-238",
      playerSlug: "juan-marcos-foyth",
      name: "Juan Foyth",
    });
    expect(found).toHaveLength(2);
  });

  it("skips pictures that are not cards, or that name nobody", () => {
    expect(core.collectCards({ club: { slug: "getafe", pictureUrl: "https://assets.sorare.com/club/getafe-cf/logo.png" } })).toEqual([]);
    expect(core.collectCards({ pictureUrl: OBLAK })).toEqual([]);
    expect(core.collectCards(null)).toEqual([]);
    expect(core.collectCards("text")).toEqual([]);
  });

  it("is bounded: a huge answer is read only so far", () => {
    const wide = { list: Array.from({ length: 500 }, (_, i) => ({ slug: `c-${i}`, pictureUrl: `https://assets.sorare.com/card/id-${i}/picture/p.png` })) };
    expect(core.collectCards(wide, 100).length).toBeLessThan(500);
    expect(core.collectCards(wide)).toHaveLength(500);
  });
});

describe("surfaceOf", () => {
  it("tells the four places one card is drawn", () => {
    expect(core.surfaceOf(240, 339)).toBe("full"); // a gallery or a player page
    expect(core.surfaceOf(140, 198)).toBe("full");
    expect(core.surfaceOf(112, 158)).toBe("compact"); // a lineup slot
    expect(core.surfaceOf(150, 160)).toBe("skip"); // near-square: a tile, not a card
    expect(core.surfaceOf(64, 90)).toBe("compact"); // a thumbnail in a list
  });

  it("skips what is not a card", () => {
    expect(core.surfaceOf(96, 96)).toBe("skip"); // a face
    expect(core.surfaceOf(200, 339, true)).toBe("skip"); // round
    expect(core.surfaceOf(0, 0)).toBe("skip"); // not laid out yet
    expect(core.surfaceOf(20, 28)).toBe("skip"); // too small to read anything on
    // Seen on a real player page: a 40px rarity thumbnail. A chip there would cover a tenth of the picture.
    expect(core.surfaceOf(40, 65)).toBe("skip");
    expect(core.surfaceOf(48, 68)).toBe("compact");
  });
});

// Sorare's own rule for colouring a football score, read from its public script (thresholds-*.js) on 2026-09-29 and
// checked against 42 hexagons on its scouting pages: the first step whose limit is >= the score, else the top colour.
const STEPS: [number, string][] = [[20, "veryLow"], [35, "low"], [50, "mediumLow"], [60, "medium"], [75, "mediumHigh"]];

describe("scoreLevel", () => {
  it("paints a score the way Sorare does, boundaries included", () => {
    for (const [score, level] of [
      [0, "veryLow"], [20, "veryLow"], [21, "low"], [35, "low"], [36, "mediumLow"], [50, "mediumLow"], [51, "medium"],
      [60, "medium"], [61, "mediumHigh"], [75, "mediumHigh"], [76, "high"], [99, "high"], [100, "high"],
    ] as const) {
      expect(core.scoreLevel(score), String(score)).toBe(level);
    }
  });

  it("agrees with the steps written above and with real hexagons seen on Sorare's pages", () => {
    for (const [limit, level] of STEPS) expect(core.scoreLevel(limit)).toBe(level);
    // (score, colour) read off real scouting pages: 41 and 50 yellow, 53 and 60 lime, 61 and 75 green, 76 and 96 cyan.
    for (const [score, level] of [[41, "mediumLow"], [47, "mediumLow"], [50, "mediumLow"], [53, "medium"], [60, "medium"], [61, "mediumHigh"], [75, "mediumHigh"], [76, "high"], [96, "high"]] as const) {
      expect(core.scoreLevel(score)).toBe(level);
    }
  });

  it("is null for no score at all, never a colour", () => {
    expect(core.scoreLevel(null)).toBeNull();
    expect(core.scoreLevel(Number.NaN)).toBeNull();
  });

  it("keeps Sorare's measured colours as the fallback when the page's own tokens go away", () => {
    expect(core.SCORE_FALLBACK).toEqual({
      veryLow: "#ff5a5a", low: "#ff7e34", mediumLow: "#f0ce1d", medium: "#b6ff1a", mediumHigh: "#25ed36", high: "#00f3eb",
    });
  });

  it("reads on every colour Sorare uses: dark type passes AA on all six", () => {
    for (const [level, fill] of Object.entries(core.SCORE_FALLBACK)) {
      expect(contrastRatio(core.SCORE_INK, fill), level).toBeGreaterThanOrEqual(4.5);
    }
  });
});

describe("shared with the app", () => {
  it("writes a chance the way the board does", () => {
    for (const p of [0, 0.001, 0.004, 0.005, 0.43, 0.885, 0.994, 0.995, 1]) expect(core.chanceLabel(p)).toBe(chanceLabel(p));
  });

  it("looks for card art by its address, never by a class name", () => {
    expect(core.CARD_SELECTOR).toContain('img[src*="/card/"]');
    expect(core.CARD_SELECTOR).not.toMatch(/\.[A-Za-z_-]+[\s,]/); // no class selectors
  });
});
