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
      // Card 6 is never named by an answer: the page's own link (?card=…) is all that says which card it is.
    ],
  },
};

/** What the app answers (frontend/lib/overlay.ts): the score, the chance, the average. Sofix has nothing on `someone-else`. */
const NUMBERS = {
  players: {
    "unai-simon": { x: 53.4, p: 0.88, average: 55 },
    "pau-cubarsi": { x: 47.2, p: 0.31, average: 50 },
    "lionel-messi": { x: 61.3, p: 0.9, average: 70 },
  },
  cards: {
    "pedri-2026-limited-7": { x: 61.2, p: 0.9, average: 65 },
  },
};

/** What the app answers for the drawer: the gameweek's plan in a few numbers (lib/overlay.ts, overlayPlan). */
const PLAN = { state: "ready", week: 17, lineups: 1, x: 417, comp: "All Star", pics: [1, 2, 3, 4, 7].map(picture), pAny: 0.16, essence: 55, cardsUsed: 9, cardsAvailable: 87 };

type Mode = "ok" | "auth" | "unreachable";
type Probe = { sent: { type: string; cards?: string[]; players?: string[] }[]; opened: string[]; setOverlay: (value: boolean) => void; setChance: (value: boolean) => void };

async function openPage(page: Page, options: { mode?: Mode; overlay?: boolean; viewport?: { width: number; height: number } } = {}) {
  const mode = options.mode ?? "ok";
  if (options.viewport) await page.setViewportSize(options.viewport);

  await page.route(PAGE_URL, (route) => route.fulfill({ contentType: "text/html", body: FIXTURE }));
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
        chance: true,
        setOverlay(value: boolean) {
          probe.overlay = value;
          listeners.forEach((listener) => listener({ overlay: { newValue: value } }, "sync"));
        },
        setChance(value: boolean) {
          probe.chance = value;
          listeners.forEach((listener) => listener({ overlayChance: { newValue: value } }, "sync"));
        },
      };
      (window as unknown as { __sfx: unknown }).__sfx = probe;
      const answer = (message: { type: string; cards?: string[]; players?: string[] }) => {
        if (message.type === "overlay-plan") return config.mode === "ok" ? { state: "ok", plan: config.plan } : { state: config.mode };
        if (message.type !== "overlay-numbers") return undefined;
        if (config.mode !== "ok") return { state: config.mode };
        const out = { state: "ok", cards: {} as Record<string, unknown>, players: {} as Record<string, unknown> };
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
            if (reply) setTimeout(() => reply(answer(message)), 15);
          },
        },
        storage: {
          sync: { get: async (defaults: Record<string, unknown>) => ({ ...defaults, overlay: probe.overlay, overlayChance: probe.chance }) },
          onChanged: { addListener: (listener: (changes: unknown, area: string) => void) => listeners.push(listener) },
        },
      };
    },
    { mode, overlay: options.overlay ?? true, numbers: NUMBERS, plan: PLAN },
  );
  for (const file of ["core.js", "bridge.js", "content.js", "overlay.js", "drawer.js"]) await page.addInitScript({ path: path.join(EXTENSION, file) });

  await page.goto(PAGE_URL);
  await page.addStyleTag({ path: path.join(EXTENSION, "overlay.css") });
}

const probe = (page: Page) => page.evaluate(() => (window as unknown as { __sfx: Probe }).__sfx as unknown as { sent: Probe["sent"]; opened: string[] });
const ribs = (page: Page, id: string) => page.locator(`#${id} [data-sfx]`);
/** The chip's segments, in order: the label, the score, the chance. */
const text = (page: Page, id: string) => ribs(page, id).evaluate((el) => [...el.querySelectorAll(".sfx-chip > b")].map((part) => part.textContent));
type Box = { left: number; top: number; right: number; bottom: number; width: number; height: number };
const box = (page: Page, selector: string): Promise<Box> =>
  page.evaluate((query) => {
    const r = document.querySelector(query)!.getBoundingClientRect();
    return { left: r.left, top: r.top, right: r.right, bottom: r.bottom, width: r.width, height: r.height };
  }, selector);
const chip = (page: Page, id: string) => box(page, `#${id} [data-sfx] .sfx-chip`);
const art = (page: Page, id: string) => box(page, `#${id} img, #${id} video`);
const meets = (a: Box, b: Box) => a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;

/**
 * Cards wait their turn until they are near the screen, as on the real site, so the page has settled once each kind
 * has been scrolled to and drawn. What is drawn stays drawn, so the tests then read the whole page.
 */
async function settled(page: Page) {
  for (const id of ["slot-a", "badged", "linked", "doubtful", "composecard", "scrolled", "big"]) {
    await page.locator(`#${id}`).scrollIntoViewIfNeeded();
    await expect(ribs(page, id)).toBeVisible();
  }
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(200);
}

test.describe("the sorare.com overlay", () => {
  test("draws each card at the size it is drawn, from the right numbers", async ({ page }, testInfo) => {
    await openPage(page);
    await settled(page);

    // A gallery or player page: the score and the chance in ONE chip, painted with Sorare's own colour for a 53
    // (the page's token, not the extension's fallback: the fixture's differs by a digit).
    expect(await text(page, "big")).toEqual(["X", "53", "88%"]);
    await expect(ribs(page, "big").locator(".sfx-chip")).toHaveCount(1);
    await expect(ribs(page, "big").locator(".sfx-chip")).toHaveCSS("--sfx-fill", "#b7ff1b");
    await expect(ribs(page, "big").locator(".sfx-c")).toHaveCSS("background-color", "rgb(255, 255, 255)");
    await expect(ribs(page, "big")).toHaveAttribute("aria-label", "Sofix: expected score 53, 88% chance of playing");

    // Another copy of the same player is the same numbers: xScore belongs to the player, not the card.
    expect(await text(page, "copy")).toEqual(["X", "53", "88%"]);

    // A lineup slot and a thumbnail: one number, no label, no chance.
    expect(await text(page, "slot-a")).toEqual(["53"]);
    expect(await text(page, "thumb")).toEqual(["53"]);
    await expect(ribs(page, "slot-a")).toHaveClass(/sfx-ribs--compact/);
    await expect(ribs(page, "big")).toHaveClass(/sfx-ribs--full/);

    // A video is a card too.
    expect(await text(page, "clip")).toEqual(["X", "53", "88%"]);

    // Not expected to start: the score's colour is withdrawn (grey) and the chance turns red, whatever the score.
    await expect(ribs(page, "slot-b").locator(".sfx-chip")).toHaveClass(/sfx-chip--doubt/);
    await expect(ribs(page, "slot-b").locator(".sfx-chip")).toHaveCSS("--sfx-fill", "#d9dde4");
    await expect(ribs(page, "doubtful").locator(".sfx-c")).toHaveCSS("background-color", "rgb(255, 90, 90)");
    expect(await text(page, "doubtful")).toEqual(["X", "47", "31%"]);

    // Nothing about the game: Sorare's own card draws the opponent, the odds and the kickoff.
    expect(await text(page, "abroad")).toEqual(["X", "61", "90%"]);
    expect(await page.locator("[data-sfx]").evaluateAll((all) => all.some((el) => /\(H\)|\(A\)|odds/i.test(el.textContent ?? "")))).toBe(false);

    // A card only its link names still finds its numbers (the card slug, since nothing said which player).
    expect(await text(page, "linked")).toEqual(["X", "61", "90%"]);

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
    expect(players.sort()).toEqual(["lionel-messi", "pau-cubarsi", "someone-else", "unai-simon"]);
    expect(cards).toEqual(["pedri-2026-limited-7"]);
    for (const message of asked) expect((message.players?.length ?? 0) + (message.cards?.length ?? 0)).toBeLessThanOrEqual(120);
    // Nothing but slugs leaves the page: no picture addresses, no names, no prices.
    expect(JSON.stringify(asked)).not.toMatch(/https?:|Unai|assets\.sorare/);
  });

  test("never doubles a ribbon when the page re-renders, and follows an element that is given another card", async ({ page }) => {
    await openPage(page);
    await settled(page);

    await page.evaluate(() => (window as unknown as { rerender: () => void }).rerender());
    await expect(ribs(page, "slot-a")).toHaveCount(1);
    await expect(ribs(page, "slot-b")).toHaveCount(1);
    await expect(ribs(page, "big")).toBeVisible();
    await page.waitForTimeout(300);
    for (const id of ["slot-a", "slot-b", "slot-c", "copy", "abroad", "linked"]) await expect(ribs(page, id)).toHaveCount(1);
    expect(await text(page, "slot-a")).toEqual(["53"]);

    // The same element, now Pau Cubarsí's card: the old numbers must not stay on it.
    await page.evaluate((n) => (window as unknown as { swapCard: (id: string, uuid: string, alt: string) => void }).swapCard("slot-a", `11111111-aaaa-4aaa-8aaa-00000000000${n}`, "Pau Cubarsí - rare"), 2);
    await expect(ribs(page, "slot-a").locator(".sfx-chip")).toHaveClass(/sfx-chip--doubt/);
    expect(await text(page, "slot-a")).toEqual(["47"]);
    await expect(ribs(page, "slot-a")).toHaveCount(1);
  });

  test("hangs off the card's left edge the way Sorare's own chips hang off the right, and lets a clipping wrapper show it", async ({ page }) => {
    await openPage(page);
    await settled(page);
    await page.waitForTimeout(250);

    for (const id of ["big", "copy", "clip", "composecard"]) {
      const [c, m] = [await chip(page, id), await art(page, id)];
      expect(Math.abs(c.left - (m.left - 6)), `${id} hangs 6px off the edge`).toBeLessThan(1);
      expect(Math.abs(c.top - (m.top + 8)), `${id} sits 8px down`).toBeLessThan(1);
      expect(c.height, id).toBeCloseTo(18, 0); // Sorare's own height
    }
    for (const id of ["slot-a", "slot-b"]) {
      const [c, m] = [await chip(page, id), await art(page, id)];
      expect(Math.abs(c.left - (m.left - 3)), id).toBeLessThan(1);
      expect(c.height, id).toBeCloseTo(15, 0);
    }

    // The gallery card's wrapper clips whatever hangs past it, so it is let show the chip: this wrapper only.
    await expect(page.locator("#big")).toHaveClass(/sfx-anchor/);
    await expect(page.locator("#big")).toHaveCSS("overflow", "visible");

    // Switching off gives every wrapper back exactly as it was.
    await page.evaluate(() => (window as unknown as { __sfx: Probe }).__sfx.setOverlay(false));
    await expect(page.locator("[data-sfx]")).toHaveCount(0);
    await expect(page.locator(".sfx-anchor, .sfx-anchor-up")).toHaveCount(0);
    await expect(page.locator("#big")).toHaveCSS("overflow", "hidden");
  });

  test("takes little room and none of the card's face", async ({ page }) => {
    await openPage(page);
    await settled(page);
    await page.waitForTimeout(250);
    for (const id of ["big", "copy", "clip", "composecard", "slot-a", "thumb", "linked"]) {
      const [c, m] = [await chip(page, id), await art(page, id)];
      // The owner's first live look lost about 17% of a card to three chips. One chip stays under 6% of a full card
      // and under 8% of a thumbnail, where a single number is all there is room for.
      expect((c.width * c.height) / (m.width * m.height), `${id} covers little of the card`).toBeLessThan(id === "thumb" ? 0.08 : 0.06);
      const centre: Box = { left: m.left + m.width * 0.25, right: m.right - m.width * 0.25, top: m.top + m.height * 0.25, bottom: m.bottom - m.height * 0.25, width: 0, height: 0 };
      expect(meets(c, centre), `${id} stays out of the centre`).toBe(false);
    }
  });

  test("starts below a chip of Sorare's own, and never covers a control of theirs", async ({ page }) => {
    await openPage(page);
    await settled(page);
    await expect(ribs(page, "badged")).toBeVisible();
    await page.waitForTimeout(250);

    // A badge of theirs sits where the chip would go: the chip starts under it, whatever it is called.
    const [mine, badge] = [await chip(page, "badged"), await box(page, "#badge")];
    expect(meets(mine, badge)).toBe(false);
    expect(mine.top).toBeGreaterThanOrEqual(badge.bottom);

    // On the compose card their percentage and their captain control hang off the right: neither is touched, and the
    // captain control is still what is under the pointer.
    const [ours, gold, cap] = [await chip(page, "composecard"), await box(page, "#gold"), await box(page, "#cap")];
    expect(meets(ours, gold)).toBe(false);
    expect(meets(ours, cap)).toBe(false);
    const under = await page.evaluate(() => {
      const at = (id: string) => {
        const r = document.querySelector(id)!.getBoundingClientRect();
        return (document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2) as HTMLElement | null)?.id;
      };
      return { cap: at("#cap"), gold: at("#gold") };
    });
    expect(under).toEqual({ cap: "cap", gold: "gold" });

    // Their "Buy now" button under a card is still the thing under the pointer, and no chip lies over it.
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

    // A chip takes no click: only the signed-out chip (checked below) ever does.
    const catching = await page.evaluate(() => [...document.querySelectorAll("[data-sfx]")].filter((el) => getComputedStyle(el).pointerEvents !== "none").length);
    expect(catching).toBe(0);
  });

  test("in a list that scrolls the chip stays inside the picture, and the list is left exactly as it was", async ({ page }) => {
    await openPage(page);
    await settled(page);
    await expect(ribs(page, "scrolled")).toBeVisible();
    await page.waitForTimeout(250);
    const [mine, m] = [await chip(page, "scrolled"), await art(page, "scrolled")];
    expect(mine.left).toBeGreaterThanOrEqual(m.left);
    await expect(page.locator("#scroller")).toHaveCSS("overflow-x", "auto");
    await expect(page.locator("#scrolled")).toHaveCSS("overflow", "hidden");
    expect(await page.locator("#scroller, #scrolled").evaluateAll((all) => all.some((el) => /sfx-anchor/.test(el.className)))).toBe(false);
  });

  test("shows the chance only while \"Show chance of playing\" is on", async ({ page }) => {
    await openPage(page);
    await settled(page);
    expect(await text(page, "big")).toEqual(["X", "53", "88%"]);

    await page.evaluate(() => (window as unknown as { __sfx: Probe }).__sfx.setChance(false));
    await page.locator("#big").scrollIntoViewIfNeeded(); // a card off the screen is redrawn when it comes back
    await expect(ribs(page, "big").locator(".sfx-c")).toHaveCount(0);
    expect(await text(page, "big")).toEqual(["X", "53"]);
    await expect(ribs(page, "big")).toHaveAttribute("aria-label", "Sofix: expected score 53, 88% chance of playing"); // the name keeps it

    await page.evaluate(() => (window as unknown as { __sfx: Probe }).__sfx.setChance(true));
    await expect(ribs(page, "big").locator(".sfx-c")).toHaveCount(1);
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
    expect(await text(page, "big")).toEqual(["X", "53", "88%"]);
    await expect(ribs(page, "big")).toHaveCount(1);
  });

  test("starts switched off when the switch is off", async ({ page }) => {
    await openPage(page, { overlay: false });
    await expect(page.locator("body")).toHaveAttribute("data-answered", "yes");
    await page.waitForTimeout(400);
    await expect(page.locator("[data-sfx]")).toHaveCount(0);
    expect((await probe(page)).sent.filter((message) => message.type === "overlay-numbers")).toEqual([]); // and asks nothing
  });

  for (const mode of ["auth", "unreachable"] as const) {
    test(`says so, and opens the app, when the app answers "${mode}"`, async ({ page }) => {
      await openPage(page, { mode });
      await page.locator("#big").scrollIntoViewIfNeeded();
      const chip = ribs(page, "big").getByRole("button", { name: /Open Sofix/ });
      await expect(chip).toBeVisible();
      await expect(chip).toHaveText("Sofix");
      await expect(ribs(page, "slot-a")).toHaveCount(0); // a small card has no room for it
      await expect(ribs(page, "stranger")).toHaveCount(1);
      await chip.click();
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
    await expect(drawer.getByRole("list", { name: /leading lineup, All Star/ }).locator("img")).toHaveCount(5);
    await expect(drawer.getByRole("button", { name: "Close" })).toBeFocused();

    await drawer.getByRole("button", { name: "Open Apply in Sofix" }).click();
    expect((await probe(page)).opened).toEqual(["/play?gw=17"]);

    // Escape closes it, and the tab has the focus again.
    await page.keyboard.press("Escape");
    await expect(drawer).toBeHidden();
    await expect(tab).toBeFocused();

    // It shows and opens things. Nothing it sends is a step that writes to Sorare.
    const kinds = new Set((await probe(page)).sent.map((message) => message.type));
    expect([...kinds].filter((kind) => !["overlay-numbers", "overlay-plan", "overlay-stats", "open-app", "sorare-user"].includes(kind))).toEqual([]);
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
