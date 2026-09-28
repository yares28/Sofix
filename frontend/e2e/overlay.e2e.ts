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

const game = { kickoff: "2026-10-10T19:00:00+00:00", competition: "LaLiga", average: 55 };
/** What the app answers (frontend/lib/overlay.ts). Sofix has nothing on `someone-else`, so the answer omits him. */
const NUMBERS = {
  players: {
    "unai-simon": { ...game, x: 53.4, p: 0.88, opponent: "Getafe CF", code: "GET", venue: "H", difficulty: 31, bucket: 2, label: "Favourite" },
    "pau-cubarsi": { ...game, x: 47.2, p: 0.31, opponent: "RC Celta", code: "CEL", venue: "A", difficulty: 66, bucket: 4, label: "Underdog" },
    "lionel-messi": { ...game, competition: "MLS", x: 61.3, p: 0.9, opponent: "Orlando City", code: "ORL", venue: "A" },
  },
  cards: {
    "pedri-2026-limited-7": { ...game, x: 61.2, p: 0.9, opponent: "RC Celta", code: "CEL", venue: "A", difficulty: 50, bucket: 3, label: "Even" },
  },
};

/** What the app answers for the drawer: the gameweek's plan in a few numbers (lib/overlay.ts, overlayPlan). */
const PLAN = { state: "ready", week: 17, lineups: 1, x: 417, comp: "All Star", pics: [1, 2, 3, 4, 7].map(picture), pAny: 0.16, essence: 55, cardsUsed: 9, cardsAvailable: 87 };

type Mode = "ok" | "auth" | "unreachable";
type Probe = { sent: { type: string; cards?: string[]; players?: string[] }[]; opened: string[]; setOverlay: (value: boolean) => void };

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
        setOverlay(value: boolean) {
          probe.overlay = value;
          listeners.forEach((listener) => listener({ overlay: { newValue: value } }, "sync"));
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
          sync: { get: async (defaults: Record<string, unknown>) => ({ ...defaults, overlay: probe.overlay }) },
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
const text = (page: Page, id: string) => ribs(page, id).evaluate((el) => [...el.querySelectorAll(".sfx-rib")].map((chip) => chip.textContent));

/** Every card that should be drawn is: the page has settled when the last of them shows its ribbon. */
async function settled(page: Page) {
  await expect(ribs(page, "big")).toBeVisible();
  await expect(ribs(page, "linked")).toBeVisible();
  await expect(ribs(page, "slot-a")).toBeVisible();
}

test.describe("the sorare.com overlay", () => {
  test("draws each card at the size it is drawn, from the right numbers", async ({ page }, testInfo) => {
    await openPage(page);
    await settled(page);

    // A gallery or player page: the whole ribbon. 53.4 sits in the 50-64 band; he plays at home to a favourite fixture.
    expect(await text(page, "big")).toEqual(["X53", "Play88%", "GET (H)"]);
    await expect(ribs(page, "big").locator(".sfx-rib--x")).toHaveCSS("--sfx-fill", "#9bd227");
    await expect(ribs(page, "big").locator(".sfx-rib--game")).toHaveClass(/sfx-rib--f2/);
    await expect(ribs(page, "big")).toHaveAttribute("aria-label", "Sofix: expected score 53, 88% chance of playing, home to Getafe CF, Favourite");

    // Another copy of the same player is the same numbers: xScore belongs to the player, not the card.
    expect(await text(page, "copy")).toEqual(["X53", "Play88%", "GET (H)"]);

    // A lineup slot and a thumbnail: one number, no label.
    expect(await text(page, "slot-a")).toEqual(["53"]);
    expect(await text(page, "thumb")).toEqual(["53"]);
    await expect(ribs(page, "slot-a")).toHaveClass(/sfx-ribs--compact/);
    await expect(ribs(page, "big")).toHaveClass(/sfx-ribs--full/);

    // A video is a card too.
    expect(await text(page, "clip")).toEqual(["X53", "Play88%", "GET (H)"]);

    // Not expected to start: the colour is taken away and the chance is flagged, whatever the score.
    await expect(ribs(page, "slot-b").locator(".sfx-rib--x")).toHaveClass(/sfx-rib--doubt/);
    await expect(ribs(page, "slot-b").locator(".sfx-rib--x .sfx-rib__value")).toHaveCSS("background-color", "rgb(85, 85, 92)");

    // Outside LaLiga there are no odds, and none are invented.
    expect(await text(page, "abroad")).toEqual(["X61", "Play90%", "No oddsORL (A)"]);
    await expect(ribs(page, "abroad").locator(".sfx-rib--game")).not.toHaveClass(/sfx-rib--f\d/);

    // A card only its link names still finds its numbers (the card slug, since nothing said which player).
    expect(await text(page, "linked")).toEqual(["X61", "Play90%", "CEL (A)"]);
    await expect(ribs(page, "linked").locator(".sfx-rib--game")).toHaveClass(/sfx-rib--f3/);

    // Nothing for what is not a card, or what Sofix has nothing on.
    await expect(ribs(page, "stranger")).toHaveCount(0);
    await expect(ribs(page, "face")).toHaveCount(0);
    await expect(ribs(page, "mini")).toHaveCount(0);

    await page.screenshot({ path: testInfo.outputPath("overlay-desktop.png"), fullPage: true });
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
    await expect(ribs(page, "slot-a").locator(".sfx-rib--x")).toHaveClass(/sfx-rib--doubt/);
    expect(await text(page, "slot-a")).toEqual(["47"]);
    await expect(ribs(page, "slot-a")).toHaveCount(1);
  });

  test("puts a ribbon exactly on its card, and never over one of Sorare's own controls", async ({ page }) => {
    await openPage(page);
    await settled(page);
    await page.waitForTimeout(200);

    for (const id of ["big", "copy", "slot-a", "slot-b", "clip"]) {
      const on = await page.evaluate((cardId) => {
        const card = document.querySelector(`#${cardId}`)!;
        const media = card.querySelector("img, video")!.getBoundingClientRect();
        const ribbon = card.querySelector("[data-sfx]")!.getBoundingClientRect();
        return { left: ribbon.left - media.left, top: ribbon.top - media.top, inside: ribbon.right <= media.right && ribbon.bottom <= media.bottom };
      }, id);
      expect(on.inside, id).toBe(true);
      expect(Math.abs(on.left - (id.startsWith("slot") ? 3 : 6)), id).toBeLessThan(1);
      expect(Math.abs(on.top - (id.startsWith("slot") ? 3 : 6)), id).toBeLessThan(1);
    }

    // Their "Buy now" button under a card is still the thing under the pointer, and no ribbon lies over it.
    const buy = await page.evaluate(() => {
      const box = document.querySelector("#buy")!.getBoundingClientRect();
      const top = document.elementFromPoint(box.left + box.width / 2, box.top + box.height / 2) as HTMLElement | null;
      const overlaps = [...document.querySelectorAll("[data-sfx]")].some((el) => {
        const r = el.getBoundingClientRect();
        return r.left < box.right && r.right > box.left && r.top < box.bottom && r.bottom > box.top;
      });
      return { hit: top?.id, overlaps };
    });
    expect(buy).toEqual({ hit: "buy", overlaps: false });

    // A ribbon takes no click: only the signed-out chip (checked below) ever does.
    const catching = await page.evaluate(() => [...document.querySelectorAll("[data-sfx]")].filter((el) => getComputedStyle(el).pointerEvents !== "none").length);
    expect(catching).toBe(0);
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
    await expect(ribs(page, "big")).toBeVisible();
    expect(await text(page, "big")).toEqual(["X53", "Play88%", "GET (H)"]);
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
