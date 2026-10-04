import { readFileSync } from "node:fs";
import path from "node:path";
import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

/**
 * The sorare.com overlay, against a Sorare that is not there (plans/overlay.md, O5).
 *
 * The real extension scripts run unchanged (core.js, bridge.js, content.js, overlay.js and overlay.css) on a page
 * that draws the same card pictures Sorare does, at every size it does, and asks a GraphQL endpoint of the same
 * shape which card is which. Only the two things a test cannot have are faked: the browser's `chrome.*` (with the
 * app's answers scripted) and the network. So a change to how a card is found, named, sized or drawn fails here
 * rather than on the owner's lineup page.
 */

const EXTENSION = path.join(__dirname, "..", "..", "extension");
const FIXTURE = readFileSync(path.join(__dirname, "fixtures", "sorare-cards.html"), "utf8");
const PAGE_URL = "https://sorare.com/football/e2e/cards";

const uuid = (n: number) => `11111111-aaaa-4aaa-8aaa-00000000000${n}`;
const picture = (n: number) => `https://assets.sorare.com/card/${uuid(n)}/picture/tinified-x.png`;

/** The defenders of a "Select your Defender" list, best expected score first, and three forwards under "Select your Forward". */
const PICKS = [70, 65, 60, 55, 50, 45].map((x, i) => ({ n: i + 1, x, slug: `pick-${i + 1}`, card: `pick-${i + 1}-2026-limited-1`, pic: picture(11 + i) }));
const FORWARDS = [1, 2, 3].map((n) => ({ n, slug: `fwd-${n}`, card: `fwd-${n}-2026-limited-1`, pic: picture(30 + n) }));
const EXTRA_CARDS = [
  ...PICKS.map((p) => ({ slug: p.card, pictureUrl: p.pic, anyPlayer: { slug: p.slug, displayName: `Pick ${p.n}` } })),
  ...FORWARDS.map((p) => ({ slug: p.card, pictureUrl: p.pic, anyPlayer: { slug: p.slug, displayName: `Fwd ${p.n}` } })),
  { slug: "ivan-over-2026-limited-1", pictureUrl: picture(20), anyPlayer: { slug: "ivan-over", displayName: "Ivan Over" } },
  { slug: "olga-old-2026-limited-1", pictureUrl: picture(21), anyPlayer: { slug: "olga-old", displayName: "Olga Old" } },
  { slug: "dan-double-2026-limited-1", pictureUrl: picture(40), anyPlayer: { slug: "double-dan", displayName: "Dan Double" } },
];

/** What Sorare's own page would learn from its GraphQL answers: which card each picture is. */
const IDENTITY = {
  data: {
    cards: [
      { slug: "unai-simon-2026-limited-12", pictureUrl: picture(1), anyPlayer: { slug: "unai-simon", displayName: "Unai Simón" } },
      { slug: "pau-cubarsi-2026-rare-3", pictureUrl: picture(2), anyPlayer: { slug: "pau-cubarsi", displayName: "Pau Cubarsí" } },
      { slug: "lionel-messi-2026-limited-9", pictureUrl: picture(3), anyPlayer: { slug: "lionel-messi", displayName: "Lionel Messi" } },
      { slug: "unai-simon-2023-super_rare-2", pictureUrl: picture(4), anyPlayer: { slug: "unai-simon", displayName: "Unai Simón" } },
      { slug: "someone-else-2026-limited-1", pictureUrl: picture(5), anyPlayer: { slug: "someone-else", displayName: "Someone Else" } },
      { slug: "lionel-messi-2026-rare-4", pictureUrl: picture(7), anyPlayer: { slug: "lionel-messi", displayName: "Lionel Messi" } },
      { slug: "kai-havertz-2026-limited-2", pictureUrl: picture(8), anyPlayer: { slug: "kai-havertz", displayName: "Kai Havertz" } },
      ...EXTRA_CARDS,
      // Card 6 is never named by an answer: the page's own link (?card=…) is all that says which card it is.
    ],
  },
};

const ELEVEN_HOURS_AGO = new Date(Date.now() - 11 * 3600_000).toISOString();
const FORTY_HOURS_AGO = new Date(Date.now() - 40 * 3600_000).toISOString();

/**
 * What the app answers (frontend/lib/overlay.ts): the two scores and the chances, his position, the game's odds. Sofix has
 * nothing on `someone-else`. Unai Simón is a keeper on a LaLiga game (the board's own model), Pau Cubarsí a defender who starts
 * only 31% of the time, Messi a forward with an xG on a national-team game (Sorare's odds), and Pedri a midfielder whose game
 * nobody has priced yet.
 */
const NUMBERS = {
  players: {
    "unai-simon": {
      x: 53.4, p: 0.88, average: 55, pos: "GK", laliga: true, at: ELEVEN_HOURS_AGO, start: 53.4, bench: 1.2, on: 42, pStart: 0.88, pOn: 0.01,
      startSource: "sorare", sources: { sorare: 0.88, sofix: 0.7 },
      game: { win: 0.46, cleanSheet: 0.33, difficulty: 45.2, bucket: 2, label: "Favourite", source: "model" },
    },
    "pau-cubarsi": {
      x: 47.2, p: 0.31, average: 50, pos: "DEF", at: ELEVEN_HOURS_AGO, start: 52.6, bench: 8.4, pStart: 0.31, pOn: 0.3,
      startSource: "futbolfantasy", startAt: "2026-10-09T14:56:00Z", ffStatus: { kind: "doubt", since: "Desde 12/09 (18 días)" },
      sources: { futbolfantasy: 0.31, sorare: 0.4, sofix: 0.35 },
      ffMatch: { id: 22502, url: "https://www.futbolfantasy.com/partidos/22502-real-sociedad-deportivo" }, ffPlayer: "2802", benchedOn: 0.435,
      game: { win: 0.38, cleanSheet: 0.22, difficulty: 58.4, bucket: 3, label: "Even", source: "sorare" },
    },
    "lionel-messi": {
      x: 61.3, p: 0.9, average: 70, pos: "FWD", laliga: false, at: ELEVEN_HOURS_AGO, start: 64.2, bench: 20.1, on: 45.2, pStart: 0.82, pOn: 0.08, xg: 0.38,
      shape: { p: 0.28, dec: 84, plain: 51, sdDec: 9, sdPlain: 15, low: 41, high: 80, why: [["Form", 7], ["Attack", 5], ["Home", 1]] },
      onShape: { p: 0.07, dec: 70, plain: 43, sdDec: 8, sdPlain: 7, low: 33, high: 62, why: [["Minutes", -19]] },
      startSource: "sofix", sources: { sofix: 0.82 },
      game: { win: 0.65, cleanSheet: 0.29, difficulty: 30.4, bucket: 1, label: "Very favourite", source: "sorare" },
    },
    // A forward at a club Understat does not cover, with a priced game: he has odds but no xG.
    "kai-havertz": {
      x: 55.1, p: 0.85, average: 58, pos: "FWD", at: ELEVEN_HOURS_AGO, start: 58.4, bench: 9.1, pStart: 0.8, pOn: 0.05,
      game: { win: 0.52, cleanSheet: 0.31, difficulty: 38.7, bucket: 2, label: "Favourite", source: "model" },
    },
    ...Object.fromEntries(
      PICKS.map((p) => [
        p.slug,
        {
          x: p.x, p: 0.9, average: 55, pos: "DEF", at: ELEVEN_HOURS_AGO, start: p.x, bench: 5, pStart: 0.9, pOn: 0.03,
          game: { win: 0.5, cleanSheet: 0.3, difficulty: 44, bucket: 2, label: "Favourite", source: "model" },
          // The best plan uses the second and fourth of them, and captains the fourth.
          // The last of them is out, as Futbol Fantasy says: a red row on his tile.
          ...(p.n === 6 ? { pStart: 0.05, startSource: "futbolfantasy", startAt: "2026-10-09T14:56:00Z", ffStatus: { kind: "out" }, sources: { futbolfantasy: 0 } } : {}),
          ...(p.n === 2 ? { inPlan: { [p.card]: { lineup: "All Star", captain: false } } } : {}),
          ...(p.n === 4 ? { inPlan: { [p.card]: { lineup: "All Star", captain: true } } } : {}),
        },
      ]),
    ),
    ...Object.fromEntries(
      FORWARDS.map((p) => [
        p.slug,
        { x: 60 - p.n, p: 0.9, average: 55, pos: "FWD", at: ELEVEN_HOURS_AGO, start: 60 - p.n, bench: 5, pStart: 0.9, pOn: 0.03, game: null },
      ]),
    ),
    // His game has kicked off, and a gameweek published two days ago: numbers that no longer hold.
    "ivan-over": { x: 58, p: 0.9, average: 55, pos: "MID", at: ELEVEN_HOURS_AGO, over: true, start: 58, bench: 5, pStart: 0.9, pOn: 0.03, game: null },
    "olga-old": { x: 58, p: 0.9, average: 55, pos: "MID", at: FORTY_HOURS_AGO, start: 58, bench: 5, pStart: 0.9, pOn: 0.03, game: null },
    // Two games in the gameweek (a national team in an international week): his tile says so, and his panel lists both.
    "double-dan": {
      x: 61, p: 0.93, average: 55, pos: "MID", at: ELEVEN_HOURS_AGO, start: 58, bench: 14, pStart: 0.7, pOn: 0.2, game: null,
      fixtures: [
        { opponent: "Slovenia", venue: "H", kickoff: new Date(Date.now() + 26 * 3600_000).toISOString(), competition: "uefa-nations-league" },
        { opponent: "Macedonia", venue: "A", kickoff: new Date(Date.now() + 98 * 3600_000).toISOString(), competition: "uefa-nations-league" },
      ],
    },
  },
  cards: {
    "pedri-2026-limited-7": { x: 61.2, p: 0.9, average: 65, pos: "MID", at: ELEVEN_HOURS_AGO, start: 62.3, bench: 15, pStart: 0.9, pOn: 0.04, game: null },
  },
};

/** What the app answers for the drawer: the gameweek's plan in a few numbers (lib/overlay.ts, overlayPlan). */
const PLAN = { state: "ready", week: 17, lineups: 1, x: 417, comp: "All Star", pics: [1, 2, 3, 4, 7].map(picture), pAny: 0.16, essence: 55, cardsUsed: 9, cardsAvailable: 87 };

type Mode = "ok" | "auth" | "unreachable";
type Live = Record<string, { at: string; players: Record<string, { p: number; lesion: number }> }>;
type Probe = { sent: { type: string; cards?: string[]; players?: string[]; fixture?: string | null }[]; opened: string[]; setOverlay: (value: boolean) => void };

/** The gameweek Sofix is planning, as a page would name it in its address; any other gameweek has no numbers in these tests. */
const THIS_WEEK = "football-25-29-sep-2026";
const OLD_WEEK = "football-18-22-sep-2026";

async function openPage(
  page: Page,
  options: { mode?: Mode; overlay?: boolean; delay?: number; viewport?: { width: number; height: number }; query?: string; live?: Live } = {},
) {
  const mode = options.mode ?? "ok";
  if (options.viewport) await page.setViewportSize(options.viewport);

  // The page answers at its address whatever the query is, as Sorare's does.
  await page.route((url) => url.origin + url.pathname === PAGE_URL, (route) => route.fulfill({ contentType: "text/html", body: FIXTURE }));
  await page.route("https://assets.sorare.com/**", (route) => {
    if (/\.webm/.test(route.request().url())) return route.fulfill({ status: 200, contentType: "video/webm", body: "" });
    const art =
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 320 452"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">' +
      '<stop offset="0" stop-color="#f7c948"/><stop offset="1" stop-color="#b87a08"/></linearGradient></defs>' +
      '<rect width="320" height="452" fill="url(#g)"/><circle cx="160" cy="190" r="74" fill="#2b2b30"/><rect x="64" y="310" width="192" height="30" rx="6" fill="#2b2b30"/></svg>';
    return route.fulfill({ contentType: "image/svg+xml", body: art });
  });
  await page.route("https://api.sorare.com/graphql", (route) => {
    const operation = (route.request().postDataJSON() as { operationName?: string } | null)?.operationName;
    const body = operation === "LineupQuery" ? IDENTITY : { data: { currentUser: null } };
    return route.fulfill({ contentType: "application/json", body: JSON.stringify(body) });
  });

  // The browser's extension API, with the app's answers scripted. Everything else is the real thing.
  await page.addInitScript(
    (config) => {
      const listeners: ((changes: unknown, area: string) => void)[] = [];
      const probe = {
        sent: [] as unknown[],
        opened: [] as string[],
        overlay: config.overlay,
        setOverlay(value: boolean) {
          probe.overlay = value;
          listeners.forEach((listener) => listener({ overlay: { newValue: value } }, "sync"));
        },
      };
      (window as unknown as { __sfx: unknown }).__sfx = probe;
      const answer = (message: { type: string; cards?: string[]; players?: string[]; fixture?: string | null }) => {
        // What the worker answers for Futbol Fantasy read live: nothing unless a test gives it a reading.
        if (message.type === "ff-live") return config.mode === "ok" ? { state: "ok", live: config.live } : { state: config.mode };
        if (message.type === "overlay-plan") {
          if (config.mode !== "ok") return { state: config.mode };
          // What the app does for a page about a gameweek it holds nothing on: says so, in words.
          if (message.fixture && message.fixture !== config.thisWeek) return { state: "ok", plan: { state: "none", week: 0, note: "Sofix holds nothing on this gameweek." } };
          return { state: "ok", plan: config.plan };
        }
        if (message.type !== "overlay-numbers") return undefined;
        if (config.mode !== "ok") return { state: config.mode };
        const out = { state: "ok", cards: {} as Record<string, unknown>, players: {} as Record<string, unknown> };
        // What the app does: a page that names a gameweek is answered for that week, and only this week has numbers here.
        if (message.fixture && message.fixture !== config.thisWeek) return out;
        for (const slug of message.cards ?? []) if (slug in config.numbers.cards) out.cards[slug] = (config.numbers.cards as Record<string, unknown>)[slug];
        for (const slug of message.players ?? []) if (slug in config.numbers.players) out.players[slug] = (config.numbers.players as Record<string, unknown>)[slug];
        return out;
      };
      (window as unknown as { chrome: unknown }).chrome = {
        runtime: {
          id: "e2e",
          lastError: undefined,
          onMessage: { addListener() {} },
          sendMessage(message: { type: string; path?: string }, reply?: (response: unknown) => void) {
            probe.sent.push(message);
            if (message.type === "open-app") probe.opened.push(String(message.path));
            if (reply) setTimeout(() => reply(answer(message)), config.delay);
          },
        },
        storage: {
          sync: { get: async (defaults: Record<string, unknown>) => ({ ...defaults, overlay: probe.overlay }) },
          onChanged: { addListener: (listener: (changes: unknown, area: string) => void) => listeners.push(listener) },
        },
      };
    },
    { mode, overlay: options.overlay ?? true, numbers: NUMBERS, plan: PLAN, delay: options.delay ?? 15, thisWeek: THIS_WEEK, live: options.live ?? {} },
  );
  for (const file of ["core.js", "bridge.js", "content.js", "overlay.js", "drawer.js"]) await page.addInitScript({ path: path.join(EXTENSION, file) });

  await page.goto(PAGE_URL + (options.query ?? ""));
  await page.addStyleTag({ path: path.join(EXTENSION, "overlay.css") });
}

const probe = (page: Page) => page.evaluate(() => (window as unknown as { __sfx: Probe }).__sfx as unknown as { sent: Probe["sent"]; opened: string[] });
const ribs = (page: Page, id: string) => page.locator(`#${id} [data-sfx]`);
const tileOf = (page: Page, id: string) => page.locator(`#${id} [data-sfx] .sfx-tile`);
/** What a tile says, in reading order: the score, the driver's label and value, and the doubtful starter's chance. */
const text = (page: Page, id: string) =>
  tileOf(page, id).evaluate((el) => [...el.querySelectorAll(".sfx-score, .sfx-cap, .sfx-fdr, .sfx-xg, .sfx-starts b")].map((part) => part.textContent));
type Box = { left: number; top: number; right: number; bottom: number; width: number; height: number };
const box = (page: Page, selector: string): Promise<Box> =>
  page.evaluate((query) => {
    const r = document.querySelector(query)!.getBoundingClientRect();
    return { left: r.left, top: r.top, right: r.right, bottom: r.bottom, width: r.width, height: r.height };
  }, selector);
const tile = (page: Page, id: string) => box(page, `#${id} [data-sfx] .sfx-tile`);
const art = (page: Page, id: string) => box(page, `#${id} img, #${id} video`);
const meets = (a: Box, b: Box) => a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
const panel = (page: Page) => page.getByRole("dialog", { name: "Sofix details" });

/**
 * Cards wait their turn until they are near the screen, as on the real site, so the page has settled once each kind
 * has been scrolled to and drawn. What is drawn stays drawn, so the tests then read the whole page.
 */
async function settled(page: Page) {
  for (const id of ["slot-a", "badged", "midchip", "linked", "noxg", "over", "old", "doubtful", "composecard", "pinnedcard", "realcard", "scrolled", "big", "pick-1", "pick-6", "fwd-1"]) {
    await page.locator(`#${id}`).scrollIntoViewIfNeeded();
    await expect(ribs(page, id)).toBeVisible();
  }
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(250);
}

test.describe("the sorare.com overlay", () => {
  test("draws each card at the size it is drawn, from the right numbers", async ({ page }, testInfo) => {
    await openPage(page);
    await settled(page);

    // A gallery or player page, a keeper: the score if he starts, then the difficulty of his game. Painted with
    // Sorare's own colours (the page's tokens, not the extension's fallbacks: the fixture's 53 differs by a digit).
    expect(await text(page, "big")).toEqual(["53", "FDR", "45", "88%"]);
    await expect(tileOf(page, "big")).toHaveCount(1);
    await expect(tileOf(page, "big")).toHaveCSS("--sfx-c", "#b7ff1b");
    await expect(tileOf(page, "big").locator(".sfx-fdr")).toHaveCSS("background-color", "rgb(37, 237, 54)"); // band 2 of 5
    await expect(tileOf(page, "big")).toHaveAttribute("aria-label", "Sofix: 53 if he starts. Difficulty 45 of 100, favourite. He starts 88% of the time (SO).");
    await expect(tileOf(page, "big")).toHaveAttribute("aria-haspopup", "dialog");
    await expect(ribs(page, "big")).toHaveClass(/sfx-ribs--full/);

    // Another copy of the same player is the same numbers: the score belongs to the player, not the card.
    expect(await text(page, "copy")).toEqual(["53", "FDR", "45", "88%"]);

    // A lineup slot and a thumbnail: the number alone, and the thumbnail's is the smallest.
    expect(await text(page, "slot-a")).toEqual(["53"]);
    expect(await text(page, "thumb")).toEqual(["53"]);
    await expect(ribs(page, "slot-a")).toHaveClass(/sfx-ribs--compact/);
    await expect(tileOf(page, "slot-a")).not.toHaveClass(/sfx-tile--tiny/);
    await expect(tileOf(page, "thumb")).toHaveClass(/sfx-tile--tiny/);

    // A video is a card too.
    expect(await text(page, "clip")).toEqual(["53", "FDR", "45", "88%"]);

    // A forward: his xG, not the difficulty, and the score painted for a 64.
    expect(await text(page, "abroad")).toEqual(["64", "xG", "0.38", "82%"]);
    await expect(tileOf(page, "abroad")).toHaveCSS("--sfx-c", "#25ed36");
    await expect(tileOf(page, "abroad")).toHaveAttribute("aria-label", "Sofix: 64 if he starts. Expected goals 0.38. He starts 82% of the time (SF).");

    // A defender Futbol Fantasy calls a doubt, at 31%: his score if he starts is still shown, with an amber row that says so.
    expect(await text(page, "doubtful")).toEqual(["53", "FDR", "58", "31%"]);
    await expect(tileOf(page, "doubtful")).toHaveClass(/sfx-tile--doubt/);
    await expect(tileOf(page, "doubtful").locator(".sfx-doubt b")).toHaveCSS("color", "rgb(240, 206, 29)");
    await expect(tileOf(page, "doubtful").locator(".sfx-doubt .sfx-src--futbolfantasy")).toHaveCount(1);
    await expect(tileOf(page, "doubtful")).toHaveAttribute("aria-label", /He starts only 31% of the time \(FF\)\./);
    await expect(tileOf(page, "slot-b")).toHaveClass(/sfx-tile--doubt/);

    // A forward Understat cannot name (his club is in another league), though his game is priced: it is his xG that is
    // missing, so that is what it says (the odds row under Sorare's bar still has the game's odds).
    expect(await text(page, "noxg")).toEqual(["58", "No xG", "80%"]);
    await expect(tileOf(page, "noxg")).toHaveAttribute("aria-label", "Sofix: 58 if he starts. No xG: expected goals are not available for this player. He starts 80% of the time.");

    // A midfielder whose game nobody has priced either: the score, and the plain words, never an invented number.
    expect(await text(page, "linked")).toEqual(["62", "No xG", "90%"]);
    await expect(tileOf(page, "linked")).toHaveAttribute("aria-label", "Sofix: 62 if he starts. No xG for this player, and no odds for this game yet. He starts 90% of the time.");

    // Nothing about the game's teams or kickoff: Sorare's own card draws those.
    expect(await page.locator("[data-sfx]").evaluateAll((all) => all.some((el) => /\(H\)|\(A\)|Sat 10 Oct|kickoff/i.test(el.textContent ?? "")))).toBe(false);

    // Nothing for what is not a card, or what Sofix has nothing on.
    await expect(ribs(page, "stranger")).toHaveCount(0);
    await expect(ribs(page, "face")).toHaveCount(0);
    await expect(ribs(page, "mini")).toHaveCount(0);

    await page.screenshot({ path: testInfo.outputPath("overlay-desktop.png"), fullPage: true });
    await page.locator("#frame").screenshot({ path: testInfo.outputPath("overlay-compose.png") });
  });

  test("asks the app only for slugs, once each, and only for what a card names", async ({ page }) => {
    await openPage(page);
    await settled(page);
    await page.waitForTimeout(300);
    const asked = (await probe(page)).sent.filter((message) => message.type === "overlay-numbers");
    const players = asked.flatMap((message) => message.players ?? []);
    const cards = asked.flatMap((message) => message.cards ?? []);
    // Six pictures show him, and he is asked about once. The linked card only has a card slug, so that is what is sent.
    expect(players.filter((slug) => slug === "unai-simon")).toHaveLength(1);
    expect(players.sort()).toEqual(
      ["double-dan", "fwd-1", "fwd-2", "fwd-3", "ivan-over", "kai-havertz", "lionel-messi", "olga-old", "pau-cubarsi", ...PICKS.map((p) => p.slug), "someone-else", "unai-simon"].sort(),
    );
    expect(cards).toEqual(["pedri-2026-limited-7"]);
    for (const message of asked) expect((message.players?.length ?? 0) + (message.cards?.length ?? 0)).toBeLessThanOrEqual(120);
    // Nothing but slugs leaves the page: no picture addresses, no names, no prices.
    expect(JSON.stringify(asked)).not.toMatch(/https?:|Unai|assets\.sorare/);
  });

  test("never doubles a tile when the page re-renders, and follows an element that is given another card", async ({ page }) => {
    await openPage(page);
    await settled(page);

    await page.evaluate(() => (window as unknown as { rerender: () => void }).rerender());
    await expect(ribs(page, "slot-a")).toHaveCount(1);
    await expect(ribs(page, "slot-b")).toHaveCount(1);
    await expect(ribs(page, "big")).toBeVisible();
    await page.waitForTimeout(300);
    for (const id of ["slot-a", "slot-b", "slot-c", "copy", "abroad", "linked", "noxg"]) await expect(ribs(page, id)).toHaveCount(1);
    expect(await text(page, "slot-a")).toEqual(["53"]);

    // The same element, now Pau Cubarsí's card: the old numbers must not stay on it.
    await page.evaluate((n) => (window as unknown as { swapCard: (id: string, uuid: string, alt: string) => void }).swapCard("slot-a", `11111111-aaaa-4aaa-8aaa-00000000000${n}`, "Pau Cubarsí - rare"), 2);
    await expect(tileOf(page, "slot-a")).toHaveClass(/sfx-tile--doubt/);
    expect(await text(page, "slot-a")).toEqual(["53"]);
    await expect(ribs(page, "slot-a")).toHaveCount(1);
  });

  test("sits inside the card's top-left corner and leaves every wrapper of Sorare's as it was", async ({ page }) => {
    await openPage(page);
    await settled(page);
    await page.waitForTimeout(250);

    for (const id of ["big", "copy", "clip", "composecard"]) {
      const [t, m] = [await tile(page, id), await art(page, id)];
      expect(Math.abs(t.left - (m.left + 6)), `${id} sits 6px in`).toBeLessThan(1);
      expect(Math.abs(t.top - (m.top + 6)), `${id} sits 6px down`).toBeLessThan(1);
      expect([t.width, t.height], id).toEqual([44, 50]);
      expect(t.left, id).toBeGreaterThan(m.left);
      expect(t.right, id).toBeLessThan(m.right);
    }
    const slot = await tile(page, "slot-a");
    expect([slot.left - (await art(page, "slot-a")).left, slot.top - (await art(page, "slot-a")).top, slot.width]).toEqual([4, 4, 24]);
    const thumb = await tile(page, "thumb");
    expect([thumb.left - (await art(page, "thumb")).left, thumb.top - (await art(page, "thumb")).top, thumb.width]).toEqual([3, 3, 18]);

    // Nothing hangs past the picture any more, so no wrapper is told to let it show: the card keeps its own clipping.
    await expect(page.locator("#big")).toHaveCSS("overflow", "hidden");
    // The only thing of ours on a page that carries a class of Sorare's is the margin on their odds bars (checked below):
    // the compose card's, and the one three rows under a card in a list.
    const borrowed = await page.evaluate(() => [...document.querySelectorAll('[class*="sfx-"]')].filter((el) => !el.closest("[data-sfx]") && !el.hasAttribute("data-sfx")).map((el) => el.id));
    expect(borrowed.sort()).toEqual(["wdl", "wdl3"]);
  });

  test("takes little room and none of the card's face", async ({ page }) => {
    await openPage(page);
    await settled(page);
    await page.waitForTimeout(250);
    const fraction = async (id: string) => {
      const [t, m] = [await tile(page, id), await art(page, id)];
      return { t, m, share: (t.width * t.height) / (m.width * m.height) };
    };
    for (const id of ["big", "copy", "clip", "composecard", "linked"]) {
      const { t, m, share } = await fraction(id);
      // The owner's first live look lost about 17% of a card to three chips. The tile, now with the chance of starting on
      // every one (he asked for it), stays under 7% of a full card.
      expect(share, `${id} covers little of the card`).toBeLessThan(0.07);
      const centre: Box = { left: m.left + m.width * 0.25, right: m.right - m.width * 0.25, top: m.top + m.height * 0.25, bottom: m.bottom - m.height * 0.25, width: 0, height: 0 };
      expect(meets(t, centre), `${id} stays out of the centre`).toBe(false);
    }
    for (const id of ["slot-a", "thumb"]) {
      const { t, m, share } = await fraction(id);
      expect(share, `${id} covers little of a small card`).toBeLessThan(0.08);
      const centre: Box = { left: m.left + m.width * 0.25, right: m.right - m.width * 0.25, top: m.top + m.height * 0.25, bottom: m.bottom - m.height * 0.25, width: 0, height: 0 };
      expect(meets(t, centre), `${id} stays out of the centre`).toBe(false);
    }
    // The doubtful starter's red row lengthens the tile on purpose: still under 7.5% of the card and off the face.
    const doubt = await fraction("doubtful");
    expect(doubt.share).toBeLessThan(0.075);
    expect(doubt.t.bottom).toBeLessThan(doubt.m.top + doubt.m.height * 0.3);
  });

  test("starts below a chip of Sorare's own, never covers a control of theirs, and only its own box answers the pointer", async ({ page }) => {
    await openPage(page);
    await settled(page);
    await expect(ribs(page, "badged")).toBeVisible();
    await page.waitForTimeout(250);

    // A badge of theirs sits where the tile would go: the tile starts under it, whatever it is called.
    const [mine, badge] = [await tile(page, "badged"), await box(page, "#badge")];
    expect(meets(mine, badge)).toBe(false);
    expect(mine.top).toBeGreaterThanOrEqual(badge.bottom);

    // A chip of theirs lower down the edge, between the tile's top and bottom lines, is cleared all the same.
    const [low, chip] = [await tile(page, "midchip"), await box(page, "#midbadge")];
    expect(meets(low, chip)).toBe(false);
    expect(low.top).toBeGreaterThanOrEqual(chip.bottom);

    // On the compose card their percentage and their captain control hang off the right: neither is touched, and the
    // captain control is still what is under the pointer.
    const [ours, gold, cap] = [await tile(page, "composecard"), await box(page, "#gold"), await box(page, "#cap")];
    expect(meets(ours, gold)).toBe(false);
    expect(meets(ours, cap)).toBe(false);
    await page.locator("#composecard").scrollIntoViewIfNeeded(); // a point off the screen has nothing under it
    const under = await page.evaluate(() => {
      const at = (id: string) => {
        const r = document.querySelector(id)!.getBoundingClientRect();
        return (document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2) as HTMLElement | null)?.id;
      };
      return { cap: at("#cap"), gold: at("#gold") };
    });
    expect(under).toEqual({ cap: "cap", gold: "gold" });

    // Their "Buy now" button under a card is still the thing under the pointer, and nothing of ours lies over it.
    const buy = await page.evaluate(() => {
      const target = document.querySelector("#buy")!.getBoundingClientRect();
      const top = document.elementFromPoint(target.left + target.width / 2, target.top + target.height / 2) as HTMLElement | null;
      const overlaps = [...document.querySelectorAll("[data-sfx]")].some((el) => {
        const r = el.getBoundingClientRect();
        return r.left < target.right && r.right > target.left && r.top < target.bottom && r.bottom > target.top;
      });
      return { hit: top?.id, overlaps };
    });
    expect(buy).toEqual({ hit: "buy", overlaps: false });

    // The wrappers take no click. What does is the tile of a full card, in its own 44px, and never a small card's number.
    const wrappers = await page.evaluate(() => [...document.querySelectorAll("[data-sfx]")].filter((el) => getComputedStyle(el).pointerEvents !== "none").length);
    expect(wrappers).toBe(0);
    const answering = await page.evaluate(() =>
      [...document.querySelectorAll(".sfx-tile")].map((el) => ({ pointer: getComputedStyle(el).pointerEvents, width: el.getBoundingClientRect().width, compact: el.classList.contains("sfx-tile--compact") })),
    );
    for (const one of answering) {
      expect(one.pointer, JSON.stringify(one)).toBe(one.compact ? "none" : "auto");
      expect(one.width).toBeLessThanOrEqual(44);
    }

    // A press anywhere on the card except the tile still selects the card; a press on the tile selects nothing.
    await page.locator("#big").scrollIntoViewIfNeeded(); // the hero card is below the fold: a click there needs it on screen
    const face = await box(page, "#big img");
    await page.evaluate(() => ((window as unknown as { __picked: string | null }).__picked = null));
    await page.mouse.click(face.left + face.width / 2, face.top + face.height * 0.7);
    expect(await page.evaluate(() => (window as unknown as { __picked: string | null }).__picked)).toBe("big");
    await page.evaluate(() => ((window as unknown as { __picked: string | null }).__picked = null));
    await tileOf(page, "big").click();
    expect(await page.evaluate(() => (window as unknown as { __picked: string | null }).__picked)).toBeNull();
    await expect(panel(page)).toBeVisible();
  });

  test("in a list that scrolls the tile stays inside the picture, and the list is left exactly as it was", async ({ page }) => {
    await openPage(page);
    await settled(page);
    await expect(ribs(page, "scrolled")).toBeVisible();
    await page.waitForTimeout(250);
    const [mine, m] = [await tile(page, "scrolled"), await art(page, "scrolled")];
    expect(mine.left).toBeGreaterThanOrEqual(m.left);
    await expect(page.locator("#scroller")).toHaveCSS("overflow-x", "auto");
    await expect(page.locator("#scrolled")).toHaveCSS("overflow", "hidden");
  });

  test("draws Sofix's win and clean sheet directly under Sorare's odds bar, makes room without moving anything into it, and gives it back", async ({ page }) => {
    await openPage(page);
    await settled(page);
    const row = page.locator("#frame .sfx-odds");
    await expect(row).toBeVisible();
    await page.waitForTimeout(250);

    // The same width as Sorare's bar, directly under it, 22px tall.
    const [bar, mine] = [await box(page, "#wdl"), await box(page, "#frame .sfx-odds")];
    expect(Math.abs(mine.left - bar.left)).toBeLessThan(1);
    expect(Math.abs(mine.width - bar.width)).toBeLessThan(1);
    expect(Math.abs(mine.top - (bar.bottom + 4))).toBeLessThan(1);
    expect(mine.height).toBe(22);
    await expect(row).toHaveText(/WIN\s*46%\s*CS\s*33%/);
    await expect(row).toHaveAttribute("aria-label", "Sofix odds: win 46%, clean sheet 33%");
    await expect(row).toHaveCSS("pointer-events", "none");
    await expect(row.locator(".sfx-odds-num--win")).toHaveCSS("color", "rgb(182, 255, 26)");

    // Sorare's kickoff line moved down to make room: still visible, below our row, overlapped by nothing.
    const foot = await box(page, "#foot");
    expect(foot.top).toBeGreaterThanOrEqual(mine.bottom);
    expect(meets(mine, foot)).toBe(false);
    await expect(page.locator("#foot")).toBeVisible();
    await expect(page.locator("#wdl")).toHaveClass(/sfx-room/);

    // A card with no odds bar near it gets no row: the gallery and the hero have none.
    await expect(page.locator("#gallery .sfx-odds, #hero .sfx-odds, #lineup .sfx-odds")).toHaveCount(0);

    // Their kickoff line pinned in the room (making room moves nothing): no row is drawn and their bar is given back.
    await expect(page.locator("#frame2 .sfx-odds")).toHaveCount(0);
    await expect(page.locator("#wdl2")).not.toHaveClass(/sfx-room/);
    expect(meets(await box(page, "#foot2"), mine)).toBe(false);
    const pinned = await Promise.all([box(page, "#foot2"), box(page, "#wdl2")]);
    expect(pinned[0].top).toBeGreaterThan(pinned[1].bottom); // where they put it, untouched

    // Switching off gives everything back: no row, no margin, the kickoff line where it began.
    await page.evaluate(() => (window as unknown as { __sfx: Probe }).__sfx.setOverlay(false));
    await expect(page.locator(".sfx-odds")).toHaveCount(0);
    await expect(page.locator(".sfx-room")).toHaveCount(0);
    const [after, wdl] = [await box(page, "#foot"), await box(page, "#wdl")];
    expect(Math.abs(after.top - (wdl.bottom + 6))).toBeLessThan(1);
  });

  test("says on every tile how likely he is to start, and turns it into a warning only when he probably won't", async ({ page }) => {
    await openPage(page);
    await settled(page);
    await page.waitForTimeout(250);

    // Tiles are drawn near the screen, so each card is brought in front of the reader before it is looked at.
    const seen = async (id: string) => {
      await page.locator(`#${id}`).scrollIntoViewIfNeeded();
      return tileOf(page, id);
    };

    // The chance is on every full tile, the app's own where Sorare has none: Rațiu-like players at 90% no longer have nothing.
    for (const id of ["big", "abroad", "noxg", "linked", "pick-1", "fwd-1"]) {
      await expect((await seen(id)).locator(".sfx-starts")).toHaveCount(1);
    }
    const big = await seen("big");
    await expect(big.locator(".sfx-starts")).toHaveText("88%");
    await expect(big.locator(".sfx-starts")).not.toHaveClass(/sfx-doubt/);
    await expect(big.locator(".sfx-starts b")).toHaveCSS("color", "rgba(255, 255, 255, 0.88)");
    // A doubt is an amber row; a player who will not start is a red one.
    const doubtful = await seen("doubtful");
    await expect(doubtful.locator(".sfx-starts")).toHaveClass(/sfx-doubt/);
    await expect(doubtful.locator(".sfx-starts b")).toHaveCSS("color", "rgb(240, 206, 29)");
    const out = await seen("pick-6");
    await expect(out.locator(".sfx-starts")).toHaveClass(/sfx-out/);
    await expect(out.locator(".sfx-starts b")).toHaveCSS("color", "rgb(255, 122, 122)");
    // Whose number it is is a mark, not a word: FF a filled dot, SO a ring, SF a dashed ring.
    await expect(big.locator(".sfx-src--sorare")).toHaveCount(1);
    await expect((await seen("abroad")).locator(".sfx-src--sofix")).toHaveCount(1);
    // A small lineup tile has no room for it, and a number that no longer holds does not say who will start.
    await expect((await seen("slot-a")).locator(".sfx-starts")).toHaveCount(0);
    await expect((await seen("over")).locator(".sfx-tile--stale, .sfx-drive")).toHaveCount(1);
    await expect((await seen("over")).locator(".sfx-starts")).toHaveCount(0);
    await expect((await seen("old")).locator(".sfx-starts")).toHaveCount(0);

    // Still a small part of the card: under half its height on the smallest full card of a list.
    await seen("pick-1");
    const [t, m] = [await tile(page, "pick-1"), await art(page, "pick-1")];
    expect(t.height / m.height).toBeLessThan(0.45);
  });

  test("finds Sorare's odds bar three rows under a card in a list, and their next line stays clear of the row it adds", async ({ page }) => {
    await openPage(page);
    await settled(page);
    await page.waitForTimeout(250);

    // On Sorare's lists the bar is not right under the picture: a form row and a flags row come first, about 75px down.
    const [card, bar] = [await art(page, "realcard"), await box(page, "#wdl3")];
    expect(bar.top - card.bottom).toBeGreaterThan(60);

    const row = page.locator("#frame3 .sfx-odds");
    await expect(row).toBeVisible();
    const mine = await box(page, "#frame3 .sfx-odds");
    expect(Math.abs(mine.top - (bar.bottom + 4))).toBeLessThan(1);
    await expect(row).toHaveText(/WIN\s*46%\s*CS\s*33%/);
    await expect(page.locator("#wdl3")).toHaveClass(/sfx-room/);

    // Their "best score chosen" line moved down to make room: below our row, and overlapped by nothing.
    const pick = await box(page, "#pick3");
    expect(pick.top).toBeGreaterThanOrEqual(mine.bottom);
    expect(meets(mine, pick)).toBe(false);
    expect(meets(mine, await box(page, "#foot3"))).toBe(false);
  });

  test("draws nothing on a page about a gameweek Sofix has no numbers for, instead of this week's under its name", async ({ page }) => {
    await openPage(page, { query: `?so5Fixture=${OLD_WEEK}` });
    await page.waitForTimeout(900);
    await expect(page.locator(".sfx-tile")).toHaveCount(0);
    const asked = (await probe(page)).sent.filter((message) => message.type === "overlay-numbers");
    expect(asked.length).toBeGreaterThan(0);
    expect(asked.every((message) => message.fixture === OLD_WEEK)).toBe(true);
  });

  test("draws this week's numbers on a page whose address names the week being planned", async ({ page }) => {
    await openPage(page, { query: `?so5Fixture=${THIS_WEEK}` });
    await settled(page);
    expect(await text(page, "big")).toEqual(["53", "FDR", "45", "88%"]);
    expect((await probe(page)).sent.some((message) => message.type === "overlay-numbers" && message.fixture === THIS_WEEK)).toBe(true);
  });

  test("follows the page when Sorare moves to another gameweek without a reload, and back", async ({ page }) => {
    await openPage(page);
    await settled(page);
    await expect(tileOf(page, "big")).toHaveCount(1);

    // Sorare changes the address and redraws the page: its numbers are about another week now, and there are none.
    const move = (query: string) =>
      page.evaluate((next) => {
        history.pushState(null, "", next);
        document.body.append(document.createElement("i")); // the page redrawing, which is what the overlay hears
      }, query);
    await move(`?so5Fixture=${OLD_WEEK}`);
    await expect(page.locator(".sfx-tile")).toHaveCount(0);

    // And back to a page that names none: this week's numbers return.
    await move("?");
    await page.locator("#big").scrollIntoViewIfNeeded();
    await expect.poll(() => text(page, "big"), { timeout: 6000 }).toEqual(["53", "FDR", "45", "88%"]); // a shimmer first, then the numbers
  });

  test("a player with two games in the gameweek says so on his tile, and his panel lists both", async ({ page }, testInfo) => {
    await openPage(page);
    await page.locator("#double").scrollIntoViewIfNeeded();
    await expect(ribs(page, "double")).toBeVisible();

    // The tile: a small "×2" hanging off its corner, and the same in words for a screen reader. Nobody else has one.
    await expect(page.locator("#double .sfx-games")).toHaveText("×2");
    await expect(tileOf(page, "double")).toHaveAttribute("aria-label", /^Sofix: 58 if he starts\. 2 games this week, best score chosen\./);
    await expect(page.locator("[data-sfx] .sfx-games")).toHaveCount(1);
    expect(await text(page, "double")).toEqual(["58", "No xG", "70%"]); // what the tile reads is what it was

    // The panel: the two games, soonest first, the next one marked; the clock is the browser's own.
    await tileOf(page, "double").hover();
    await expect(panel(page)).toBeVisible();
    const lines = panel(page).locator(".sfx-fixtures li");
    await expect(lines).toHaveCount(2);
    await expect(lines.nth(0)).toContainText("v Slovenia");
    await expect(lines.nth(0)).toHaveClass(/is-next/);
    await expect(lines.nth(1)).toContainText("at Macedonia");
    await expect(lines.nth(1)).not.toHaveClass(/is-next/);
    await expect(panel(page).locator(".sfx-fixtures")).toContainText("2 games");
    await expect(panel(page).locator(".sfx-fixtures")).toContainText("best score chosen");
    await page.screenshot({ path: testInfo.outputPath("overlay-two-games.png") });

    // A player with one game has no list in his panel.
    await page.keyboard.press("Escape");
    await page.locator("#big").scrollIntoViewIfNeeded();
    await tileOf(page, "big").hover();
    await expect(panel(page)).toBeVisible();
    await expect(panel(page).locator(".sfx-fixtures")).toHaveCount(0);
  });

  test("opens a panel beside the card on hover: starts by default, the other score one press away, and it never writes anything", async ({ page }) => {
    await openPage(page);
    await settled(page);
    await page.waitForTimeout(250);
    await expect(panel(page)).toHaveCount(0);

    // A card far enough from the left edge: the panel opens on its left, pointing at the tile.
    await tileOf(page, "abroad").hover();
    await expect(panel(page)).toBeVisible();
    await expect(panel(page)).toHaveAttribute("data-side", "left");
    await expect(tileOf(page, "abroad")).toHaveAttribute("aria-expanded", "true");
    expect(await panel(page).evaluate((el) => el.parentElement === document.body)).toBe(true); // out of Sorare's clipping boxes
    const [p, t] = [await panel(page).boundingBox(), await tile(page, "abroad")];
    expect(p!.x + p!.width).toBeLessThanOrEqual(t.left);
    expect(p!.x).toBeGreaterThanOrEqual(0);
    await expect(panel(page)).toContainText("SOFIX");
    await expect(panel(page)).toContainText("11 h ago");
    await expect(panel(page).getByRole("button", { name: "Starts" })).toHaveAttribute("aria-pressed", "true");
    await expect(panel(page).getByRole("button", { name: "Comes on" })).toHaveAttribute("aria-pressed", "false");
    await expect(panel(page).locator(".sfx-big strong")).toHaveText("64");
    await expect(panel(page).locator(".sfx-big")).toContainText("if he starts");
    await expect(panel(page).locator(".sfx-chance")).toContainText("82%");
    await expect(panel(page).locator(".sfx-chance")).toContainText("START · SF");
    // The picture behind the number: where his games land, the two kinds of game, the range, and what moves it in points.
    await expect(panel(page).locator(".sfx-bars i")).toHaveCount(40);
    await expect(panel(page).locator(".sfx-bars .sfx-bar--me")).toHaveCount(1);
    await expect(panel(page).locator(".sfx-marks")).toContainText("84 · 28%");
    await expect(panel(page).locator(".sfx-marks")).toContainText("51 · 72%");
    await expect(panel(page).locator(".sfx-range")).toHaveText("4180");
    await expect(panel(page).locator(".sfx-why-row")).toHaveCount(2); // the two biggest, the point under the line left out
    await expect(panel(page).locator(".sfx-why-row").first()).toContainText("Form+7");
    // A forward: his expected goals, his side's chance to win and the difficulty, and nothing else to read.
    const stats = panel(page).locator(".sfx-stat");
    await expect(stats).toHaveText(["XG0.38", "WIN65%", "DIFF30"]);
    await expect(panel(page)).not.toContainText("Understat");
    await expect(panel(page)).not.toContainText("From Sorare's odds");

    // The other case: the score if he comes on from the bench (a substitute starts at 35, so it is a score near 40, never his chance
    // times it), and the chance he comes on (0.08 of the 0.18 not starting).
    await panel(page).getByRole("button", { name: "Comes on" }).click();
    await expect(panel(page).getByRole("button", { name: "Comes on" })).toHaveAttribute("aria-pressed", "true");
    await expect(panel(page).locator(".sfx-big strong")).toHaveText("45");
    await expect(panel(page).locator(".sfx-big")).toContainText("if he comes on");
    await expect(panel(page).locator(".sfx-chance")).toContainText("44%");
    await expect(panel(page).locator(".sfx-chance")).toContainText("COMES ON");
    await expect(panel(page).locator(".sfx-range")).toHaveText("3362"); // the picture of a game he comes on in
    await expect(panel(page).locator(".sfx-why-row")).toHaveText(["Minutes−19"]);

    // Moving from the tile onto the panel keeps it open; leaving both closes it.
    const inside = await panel(page).boundingBox();
    await page.mouse.move(inside!.x + inside!.width / 2, inside!.y + inside!.height / 2);
    await page.waitForTimeout(450);
    await expect(panel(page)).toBeVisible();
    await page.mouse.move(2, 2);
    await expect(panel(page)).toHaveCount(0);
    await expect(tileOf(page, "abroad")).toHaveAttribute("aria-expanded", "false");

    // A keeper's panel: his clean sheet, his side's win and the difficulty; on a card near the left edge it opens on the right.
    await tileOf(page, "big").hover();
    await expect(panel(page)).toHaveAttribute("data-side", "right");
    await expect(panel(page).locator(".sfx-stat")).toHaveText(["CS33%", "WIN46%", "DIFF45"]);
    await expect(panel(page).locator(".sfx-chance")).toContainText("START · SO");
    await panel(page).getByRole("button", { name: "Comes on" }).click();
    await expect(panel(page).locator(".sfx-big strong")).toHaveText("42"); // a keeper who comes on scores like a substitute: 0.8 was his chance times it
    await expect(panel(page).locator(".sfx-chance")).toContainText("8%");

    // A midfielder whose game is not priced has nothing to put in its cells, and they say so in a dash.
    await page.mouse.move(2, 2);
    await expect(panel(page)).toHaveCount(0);
    await tileOf(page, "linked").hover();
    await expect(panel(page).locator(".sfx-stat b.sfx-stat--none")).toHaveCount(3);
    // His payload is from before the score if he comes on existed: it still opens, with the old number under its old name.
    await panel(page).getByRole("button", { name: "Benched" }).click();
    await expect(panel(page).locator(".sfx-big")).toContainText("if benched");
    await expect(panel(page).locator(".sfx-big strong")).toHaveText("15");

    // Nothing it sends is a step that writes to Sorare.
    const kinds = new Set((await probe(page)).sent.map((message) => message.type));
    expect([...kinds].filter((kind) => !["overlay-numbers", "overlay-plan", "overlay-stats", "open-app", "sorare-user", "ff-live"].includes(kind))).toEqual([]);
  });

  test("says what the site says is wrong with him only when it does, and keeps who says it behind one button", async ({ page }) => {
    await openPage(page);
    await settled(page);
    await page.waitForTimeout(250);

    await tileOf(page, "doubtful").hover();
    await expect(panel(page).getByRole("status")).toHaveText("Doubt · since 12 Sep");
    await expect(panel(page).locator(".sfx-chance")).toContainText("START · FF");
    await expect(panel(page).locator(".sfx-src--futbolfantasy").first()).toBeVisible();

    const toggle = panel(page).getByRole("button", { name: "SOURCES" });
    await expect(toggle).toHaveAttribute("aria-expanded", "false");
    await expect(panel(page).locator(".sfx-sources-list")).toBeHidden();
    await toggle.click();
    await expect(toggle).toHaveAttribute("aria-expanded", "true");
    await expect(panel(page).locator(".sfx-sources-list li")).toHaveCount(3);
    await expect(panel(page).locator(".sfx-sources-list li").nth(0)).toContainText("FF");
    await expect(panel(page).locator(".sfx-sources-list li").nth(0)).toContainText("31%");
    await expect(panel(page).locator(".sfx-sources-list li").nth(1)).toContainText("SO");
    await expect(panel(page).locator(".sfx-sources-list li").nth(1)).toContainText("40%");
    await expect(panel(page).locator(".sfx-sources-list li").nth(2)).toContainText("35%");
    const inside = await panel(page).boundingBox();
    expect(inside!.y + inside!.height).toBeLessThanOrEqual(page.viewportSize()!.height); // it grew and stayed on the screen
    await toggle.click();
    await expect(panel(page).locator(".sfx-sources-list")).toBeHidden();

    await page.mouse.move(2, 2);
    await expect(panel(page)).toHaveCount(0);
    await tileOf(page, "abroad").hover(); // nothing wrong with him: no alert
    await expect(panel(page).getByRole("status")).toHaveCount(0);
  });

  test("says Futbol Fantasy covers LaLiga only when a game abroad has no number from it", async ({ page }) => {
    await openPage(page);
    await settled(page);
    await page.waitForTimeout(250);

    await tileOf(page, "abroad").hover(); // a national-team game: Futbol Fantasy has none of it
    await panel(page).getByRole("button", { name: "SOURCES" }).click();
    const ff = panel(page).locator(".sfx-sources-list li").first();
    await expect(ff).toContainText("FF");
    await expect(ff).toContainText("LaLiga only");
    await expect(ff.locator("b")).toHaveAttribute("title", "Futbol Fantasy covers LaLiga only");
    await expect(panel(page).locator(".sfx-sources-list li").nth(2)).toContainText("82%");
  });

  test("redraws a tile with what Futbol Fantasy says now, read live, and says so in the panel", async ({ page }) => {
    const twoMinutesAgo = new Date(Date.now() - 2 * 60_000).toISOString();
    await openPage(page, { live: { "22502": { at: twoMinutesAgo, players: { "2802": { p: 0.8, lesion: -1 } } } } });
    await settled(page);
    await page.waitForTimeout(1200);

    // The job had him at 31% and in doubt; the site now has him at 80% and fit.
    const doubtful = tileOf(page, "doubtful");
    await expect(doubtful.locator(".sfx-starts b")).toHaveText("80%");
    await expect(doubtful.locator(".sfx-starts")).not.toHaveClass(/sfx-doubt/);
    await expect(doubtful.locator(".sfx-src--futbolfantasy")).toHaveCount(1);
    await expect(doubtful).toHaveAttribute("aria-label", /He starts 80% of the time \(FF\)\./);
    await expect(doubtful).not.toHaveClass(/sfx-tile--doubt/);
    expect(await text(page, "doubtful")).toEqual(["53", "FDR", "58", "80%"]); // his score if he starts does not move

    await doubtful.hover();
    await expect(panel(page)).toContainText("FF live 2 min ago");
    await expect(panel(page).locator(".sfx-chance")).toContainText("80%");
    await expect(panel(page).getByRole("status")).toHaveCount(0); // no longer a doubt
    await panel(page).getByRole("button", { name: "SOURCES" }).click();
    await expect(panel(page).locator(".sfx-sources-list li").first()).toContainText("80%");
    await expect(panel(page).locator(".sfx-sources-list li").nth(1)).toContainText("40%"); // what SO said stays

    // It asked once, for the match the cards on screen are about, and named nothing else.
    const asked = (await probe(page)).sent.filter((message) => message.type === "ff-live") as unknown as { matches: { id: number; url: string }[] }[];
    expect(asked).toHaveLength(1);
    expect(asked[0]!.matches).toEqual([{ id: 22502, url: "https://www.futbolfantasy.com/partidos/22502-real-sociedad-deportivo" }]);
  });

  test("keeps the job's numbers when the live read says nothing", async ({ page }) => {
    await openPage(page);
    await settled(page);
    await page.waitForTimeout(1200);

    expect(await text(page, "doubtful")).toEqual(["53", "FDR", "58", "31%"]);
    await expect(tileOf(page, "doubtful")).toHaveClass(/sfx-tile--doubt/);
  });

  test("opens from the keyboard and closes with Escape, giving the focus back to the tile", async ({ page }) => {
    await openPage(page);
    await settled(page);
    await page.waitForTimeout(250);
    await tileOf(page, "big").focus();
    await expect(panel(page)).toBeVisible();

    await page.keyboard.press("Enter");
    await expect(panel(page).getByRole("button", { name: "Starts" })).toBeFocused();
    await page.keyboard.press("Tab");
    await expect(panel(page).getByRole("button", { name: "Comes on" })).toBeFocused();
    await page.keyboard.press("Enter");
    await expect(panel(page).getByRole("button", { name: "Comes on" })).toHaveAttribute("aria-pressed", "true");
    await expect(panel(page).getByRole("button", { name: "Comes on" })).toBeFocused(); // the press keeps the focus

    await page.keyboard.press("Escape");
    await expect(panel(page)).toHaveCount(0);
    await expect(tileOf(page, "big")).toBeFocused();
  });

  test("shows a loading tile until the numbers arrive", async ({ page }) => {
    await openPage(page, { delay: 1500 });
    await page.locator("#big").scrollIntoViewIfNeeded();
    await expect(tileOf(page, "big")).toHaveClass(/sfx-tile--loading/);
    await expect(tileOf(page, "big")).toHaveAttribute("aria-label", "Sofix numbers loading");
    await expect.poll(async () => text(page, "big"), { timeout: 6000 }).toEqual(["53", "FDR", "45", "88%"]);
    await expect(tileOf(page, "big")).not.toHaveClass(/sfx-tile--loading/);
  });

  test("ticks the cards the best plan uses, stars its captain, and says which lineup only to a screen reader and in the panel", async ({ page }, testInfo) => {
    await openPage(page);
    await settled(page);
    await page.locator("#pick-1").scrollIntoViewIfNeeded(); // the list has to be in front of the reader: only what is on screen is drawn
    await expect(page.locator("#pick-2 .sfx-mark")).toHaveCount(1);
    await page.waitForTimeout(250);

    await expect(page.locator("#pick-2 .sfx-mark")).toHaveCount(1);
    await expect(page.locator("#pick-2 .sfx-mark--star")).toHaveCount(0);
    await expect(page.locator("#pick-4 .sfx-mark--star")).toHaveCount(1);
    // Only those two, on the whole page: a card the plan leaves out is the plain tile, never a warning.
    await expect(page.locator(".sfx-mark")).toHaveCount(2);
    await expect(tileOf(page, "pick-2")).toHaveAttribute("aria-label", /In your best plan, All Star lineup\./);
    await expect(tileOf(page, "pick-4")).toHaveAttribute("aria-label", /In your best plan, All Star lineup, as captain\./);
    await expect(tileOf(page, "pick-3")).not.toHaveAttribute("aria-label", /best plan/);
    expect(await page.locator(".sfx-ribs").evaluateAll((all) => all.some((el) => /All Star/.test(el.textContent ?? "")))).toBe(false); // never on the art

    // Beside the tile's top-right corner, inside the card, and never in the way of a click.
    const [tick, t, m] = [await box(page, "#pick-2 .sfx-mark"), await tile(page, "pick-2"), await art(page, "pick-2")];
    expect(Math.abs(tick.right - (t.right + 6))).toBeLessThan(1);
    expect(Math.abs(tick.top - (t.top - 5))).toBeLessThan(1);
    expect(tick.top).toBeGreaterThanOrEqual(m.top);
    await expect(page.locator("#pick-2 .sfx-mark")).toHaveCSS("pointer-events", "none");
    await expect(page.locator("#pick-4 .sfx-mark--star")).toHaveCSS("background-color", "rgb(240, 206, 29)"); // Sorare's yellow

    await page.locator("#picks").screenshot({ path: testInfo.outputPath("overlay-picks.png") });

    // The panel says it in a small green chip beside the name: the lineup, and a C for the captain.
    await tileOf(page, "pick-4").hover();
    await expect(panel(page).locator(".sfx-plan")).toContainText("All Star");
    await expect(panel(page).getByLabel("Captain")).toBeVisible();
    await page.mouse.move(2, 2);
    await tileOf(page, "pick-2").hover();
    await expect(panel(page).locator(".sfx-plan")).toContainText("All Star");
    await expect(panel(page).getByLabel("Captain")).toHaveCount(0);
    await page.mouse.move(2, 2);
    await tileOf(page, "pick-3").hover();
    await expect(panel(page).locator(".sfx-plan")).toHaveCount(0);
  });

  test("ranks the best three of a list to pick from, and ranks nothing that is not one", async ({ page }) => {
    await openPage(page);
    await settled(page);
    await page.locator("#pick-1").scrollIntoViewIfNeeded(); // the list has to be in front of the reader: only what is on screen is ranked
    await expect(page.locator("#pick-1 .sfx-rank")).toHaveText("#1");
    await page.waitForTimeout(250);

    // Six defenders under "Select your Defender": the three with the best xScore, in order.
    for (const [id, rank] of [["pick-1", "#1"], ["pick-2", "#2"], ["pick-3", "#3"]] as const) {
      await expect(page.locator(`#${id} .sfx-rank`)).toHaveText(rank);
    }
    for (const id of ["pick-4", "pick-5", "pick-6"]) await expect(page.locator(`#${id} .sfx-rank`)).toHaveCount(0);
    await expect(tileOf(page, "pick-1")).toHaveAttribute("aria-label", /Number 1 of the cards on this list by expected score\./);
    // Three forwards under the next heading are not a list to choose from; the gallery and the compose page have no such heading.
    await expect(page.locator("#picks2 .sfx-rank")).toHaveCount(0);
    await expect(page.locator(".sfx-rank")).toHaveCount(3);
    await expect(page.locator(".sfx-rank").first()).toHaveCSS("pointer-events", "none");

    // Take the heading away and nothing is ranked.
    await page.evaluate(() => document.querySelectorAll("#pickhead, #pickhead2").forEach((el) => el.replaceWith(Object.assign(document.createElement("h2"), { textContent: "Defenders" }))));
    await expect(page.locator(".sfx-rank")).toHaveCount(0);
  });

  test("greys a number that is about a game that has started, or is more than a day old, and says so", async ({ page }, testInfo) => {
    await openPage(page);
    await settled(page);
    await page.waitForTimeout(250);

    expect(await text(page, "over")).toEqual(["58", "Started"]);
    await expect(tileOf(page, "over")).toHaveClass(/sfx-tile--stale/);
    await expect(tileOf(page, "over")).toHaveCSS("--sfx-c", "#a3a3ab");
    await expect(tileOf(page, "over")).toHaveAttribute("aria-label", /His game has started, so these numbers are about a game no longer ahead\./);

    expect(await text(page, "old")).toEqual(["58", "Old"]);
    await expect(tileOf(page, "old")).toHaveClass(/sfx-tile--stale/);
    await expect(tileOf(page, "old")).toHaveAttribute("aria-label", /These numbers are 40 h old\./);

    await page.locator("#gallery").screenshot({ path: testInfo.outputPath("overlay-gallery.png") });

    // Numbers made eleven hours ago are still good: no other tile on the page is grey.
    await expect(page.locator(".sfx-tile--stale")).toHaveCount(2);

    await tileOf(page, "old").hover();
    await expect(panel(page)).toContainText("These numbers are 40 h old.");
    await expect(panel(page)).toContainText("1 d ago"); // forty hours is a day and a bit: the label changes unit after 24
  });

  test("goes when the switch goes off and returns when it is back on, with no reload", async ({ page }) => {
    await openPage(page);
    await settled(page);
    await expect(page.locator("[data-sfx]")).not.toHaveCount(0);

    await page.evaluate(() => (window as unknown as { __sfx: Probe }).__sfx.setOverlay(false));
    await expect(page.locator("[data-sfx]")).toHaveCount(0);
    await page.waitForTimeout(400); // nothing comes back by itself
    await expect(page.locator("[data-sfx]")).toHaveCount(0);

    await page.evaluate(() => (window as unknown as { __sfx: Probe }).__sfx.setOverlay(true));
    await page.locator("#big").scrollIntoViewIfNeeded();
    await expect(ribs(page, "big")).toBeVisible();
    expect(await text(page, "big")).toEqual(["53", "FDR", "45", "88%"]);
    await expect(ribs(page, "big")).toHaveCount(1);
  });

  test("starts switched off when the switch is off", async ({ page }) => {
    await openPage(page, { overlay: false });
    await expect(page.locator("body")).toHaveAttribute("data-answered", "yes");
    await page.waitForTimeout(400);
    await expect(page.locator("[data-sfx]")).toHaveCount(0);
    expect((await probe(page)).sent.filter((message) => message.type === "overlay-numbers")).toEqual([]); // and asks nothing
  });

  for (const [mode, words] of [["auth", "Sign in"], ["unreachable", "Offline"]] as const) {
    test(`says so in a very small tag, and opens the app, when the app answers "${mode}"`, async ({ page }) => {
      await openPage(page, { mode });
      await page.locator("#big").scrollIntoViewIfNeeded();
      const tag = ribs(page, "big").getByRole("button", { name: /Open Sofix/ });
      await expect(tag).toBeVisible();
      await expect(tag).toHaveText(words);
      const small = await tag.boundingBox();
      expect(small!.width).toBeLessThan(44); // narrower than the tile, and only a few pixels tall
      expect(small!.height).toBeLessThanOrEqual(16);
      await expect(ribs(page, "slot-a")).toHaveCount(0); // a small card has no room for it
      await page.locator("#stranger").scrollIntoViewIfNeeded();
      await expect(ribs(page, "stranger")).toHaveCount(1);
      await page.locator("#big").scrollIntoViewIfNeeded();
      await tag.click();
      expect((await probe(page)).opened).toEqual(["/"]);
    });
  }

  test("opens your gameweek's plan from an edge tab, and sends you to Apply in the app", async ({ page }) => {
    await openPage(page);
    const tab = page.getByRole("button", { name: "Sofix", exact: true });
    await expect(tab).toHaveAttribute("aria-expanded", "false");
    await expect(page.getByRole("dialog")).toBeHidden();

    await tab.click();
    const drawer = page.getByRole("dialog", { name: "Your gameweek 17" });
    await expect(drawer).toBeVisible();
    await expect(tab).toHaveAttribute("aria-expanded", "true");
    await expect(drawer.getByText("417")).toBeVisible();
    await expect(drawer.getByText("xScore · All Star")).toBeVisible();
    await expect(drawer.getByText("16%")).toBeVisible();
    await expect(drawer.getByText("≈55")).toBeVisible();
    await expect(drawer.getByText("9 of 87")).toBeVisible();
    // five thumbnails, and "+4" for the other four of the nine cards the plan uses
    const cards = drawer.getByRole("list", { name: /best plan, All Star leading/ });
    await expect(cards.locator("img")).toHaveCount(5);
    await expect(cards.getByRole("listitem", { name: "4 more cards in the plan" })).toHaveText("+4");
    await expect(drawer.getByRole("button", { name: "Close" })).toBeFocused();

    await drawer.getByRole("button", { name: "Open Apply in Sofix" }).click();
    expect((await probe(page)).opened).toEqual(["/play?gw=17"]);

    // Escape closes it, and the tab has the focus again.
    await page.keyboard.press("Escape");
    await expect(drawer).toBeHidden();
    await expect(tab).toBeFocused();

    // It shows and opens things. Nothing it sends is a step that writes to Sorare.
    const kinds = new Set((await probe(page)).sent.map((message) => message.type));
    expect([...kinds].filter((kind) => !["overlay-numbers", "overlay-plan", "overlay-stats", "open-app", "sorare-user", "ff-live"].includes(kind))).toEqual([]);
  });

  test("shows the gameweek the page's address names, not the one being planned (3 Oct: a GW21 page showed GW20)", async ({ page }) => {
    await openPage(page, { query: `?so5Fixture=${THIS_WEEK}` });
    await page.getByRole("button", { name: "Sofix", exact: true }).click();
    await expect(page.getByRole("dialog", { name: "Your gameweek 17" })).toBeVisible();
    const asked = (await probe(page)).sent.filter((message) => message.type === "overlay-plan");
    expect(asked).toEqual([{ type: "overlay-plan", fixture: THIS_WEEK }]);
  });

  test("says Sofix holds nothing on a gameweek it has no plan for, and asks again when the page moves to another week", async ({ page }) => {
    await openPage(page, { query: `?so5Fixture=${OLD_WEEK}` });
    await page.getByRole("button", { name: "Sofix", exact: true }).click();
    const drawer = page.getByRole("dialog", { name: "Your gameweek" });
    await expect(drawer.getByText("Sofix holds nothing on this gameweek.")).toBeVisible();
    // Sorare moves to another gameweek without a reload: the open drawer follows it.
    await page.evaluate((week) => history.pushState({}, "", `${location.pathname}?so5Fixture=${week}`), THIS_WEEK);
    await page.evaluate(() => window.dispatchEvent(new PopStateEvent("popstate")));
    await expect(page.getByRole("dialog", { name: "Your gameweek 17" })).toBeVisible();
    const asked = (await probe(page)).sent.filter((message) => message.type === "overlay-plan");
    expect(asked.map((message) => (message as { fixture?: string }).fixture)).toEqual([OLD_WEEK, THIS_WEEK]);
  });

  test("says so when the app cannot be reached, and still opens it", async ({ page }) => {
    await openPage(page, { mode: "unreachable" });
    await page.getByRole("button", { name: "Sofix", exact: true }).click();
    const drawer = page.getByRole("dialog");
    await expect(drawer.getByText("Sofix is not reachable right now.")).toBeVisible();
    await drawer.getByRole("button", { name: "Open Sofix" }).click();
    expect((await probe(page)).opened).toEqual(["/"]);
  });

  test("the tab goes with the switch, and stays off a phone-sized page", async ({ page }) => {
    await openPage(page);
    const tab = page.getByRole("button", { name: "Sofix", exact: true });
    await expect(tab).toBeVisible();

    await page.evaluate(() => (window as unknown as { __sfx: Probe }).__sfx.setOverlay(false));
    await expect(page.locator("[data-sfx-drawer]")).toHaveCount(0);
    await page.evaluate(() => (window as unknown as { __sfx: Probe }).__sfx.setOverlay(true));
    await expect(tab).toBeVisible();

    await page.setViewportSize({ width: 390, height: 844 });
    await expect(tab).toBeHidden();
  });

  test("is accessible, on desktop and on a phone", async ({ page }, testInfo) => {
    await openPage(page);
    await settled(page);
    await page.waitForTimeout(300);
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);

    // With the hover panel open, and its two scores switched, still nothing to fix.
    await tileOf(page, "abroad").hover();
    await expect(panel(page)).toBeVisible();
    await panel(page).getByRole("button", { name: "Comes on" }).click();
    await page.waitForTimeout(600); // past the pop-in: contrast is measured on what is settled
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
    await page.screenshot({ path: testInfo.outputPath("overlay-panel.png") });
    await page.mouse.move(2, 2);
    await expect(panel(page)).toHaveCount(0);

    await page.getByRole("button", { name: "Sofix", exact: true }).click();
    await expect(page.getByRole("dialog", { name: "Your gameweek 17" })).toBeVisible();
    await page.waitForTimeout(500); // past the slide-in and the fade-in: contrast is measured on what is settled
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
    await page.screenshot({ path: testInfo.outputPath("overlay-drawer.png") });
    await page.keyboard.press("Escape");

    await page.setViewportSize({ width: 390, height: 844 });
    await page.waitForTimeout(300);
    await expect(ribs(page, "big")).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
    await page.screenshot({ path: testInfo.outputPath("overlay-mobile.png"), fullPage: true });
  });
});
