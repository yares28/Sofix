import { expect, test, type Page } from "@playwright/test";
import { offline, resetBackend, smallText } from "./helpers";

/** Arcade reads everything from the extension; a stub answers as Sorare would (shapes from lib/arcade.test.ts). */
const ANSWERS: Record<string, unknown> = {
  arcade: {
    cardSet: { currentSet: { slug: "glitch", name: "HyperGlitch", startDate: null, endDate: "2026-10-27T16:00:00Z", availableCompetitions: [] } },
    currentUser: {
      slug: "owner",
      gems: [{ currency: "COMMON_GEM", amount: 40 }],
      essence: [{ rarity: "common", cardShardsCount: 3200, cardSet: { slug: "glitch" } }],
      setBoard: { id: "b", title: "Board", myCurrentStep: { id: "s2", level: 2 }, steps: [
        { id: "s1", level: 1, target: 260, state: "CLAIMED", rewardConfigs: [{ __typename: "CardShardRewardConfig", rarity: "common", quantity: 5000 }] },
        { id: "s2", level: 2, target: 300, state: "PLAYABLE", maxLineupsCount: 4, remainingLineupsCount: 3, lockedLineupsCount: 1, pendingLineupsCount: 0,
          rewardConfigs: [{ __typename: "InGameCurrencyRewardConfig", amount: 10, currency: "COMMON_GEM" }] },
      ] },
    },
  },
  "arcade-lineups": { currentUser: { setBoard: { steps: [] } } },
  "arcade-missions": { currentUser: { taskGroup: { myTasks: [] } } },
  "arcade-cards": { currentUser: { cards: { nodes: [{ slug: "c1", pictureUrl: null, anyPositions: ["Forward"], cardSet: { slug: "glitch" }, skinEdition: { bonus: 0.1, skinName: "Holo" }, anyPlayer: { slug: "p", displayName: "Player One" }, anyTeam: { name: "Club" } }], pageInfo: { hasNextPage: false, endCursor: null } } } },
};

test.beforeEach(async ({ page, request }) => {
  await resetBackend(request);
  await offline(page);
});

const withExtension = (page: Page) => page.addInitScript((answers) => {
  Object.defineProperty(window, "chrome", { configurable: true, value: { runtime: { sendMessage(_id: string, message: { type: string; step?: string }, reply: (answer: unknown) => void) {
    if (message.type === "ping") return reply({ ok: true, version: "0.4.5", sorareUser: "owner", appReachable: true });
    reply({ ok: true, state: "ok", step: message.step, data: answers[message.step ?? ""] });
  } } } });
}, ANSWERS);

test("Arcade shows the step you are on, its target, reward and lineups left, your gems, essence and set cards", async ({ page }) => {
  await withExtension(page);
  await page.goto("/arcade");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Step 2 of 2");
  const step = page.locator(".arc-step.is-current");
  await expect(step).toContainText("300 pts");
  await expect(step).toContainText("10 gems");
  await expect(step).toContainText("3 of 4 lineups left");
  await expect(page.locator(".arc-wallet")).toContainText("3,200");
  await expect(page.locator(".arc-card-name")).toHaveText("Player One");
  expect(await smallText(page, 11)).toEqual([]);

  await page.getByRole("searchbox", { name: "Search player or club" }).fill("nobody");
  await expect(page.locator(".arc-count")).toHaveText("No card matches");
  await page.getByRole("searchbox", { name: "Search player or club" }).fill("player");
  await expect(page.locator(".arc-count")).toHaveText("1–1 of 1");
});

test("without the extension Arcade says so instead of showing empty numbers", async ({ page }) => {
  await page.goto("/arcade");
  await expect(page.getByRole("status")).toContainText("can't reach the Sofix extension");
});

test("on a phone Arcade fits the width and keeps text readable", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await withExtension(page);
  await page.goto("/arcade");
  await expect(page.locator(".arc-card-name")).toHaveText("Player One");
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  expect(await smallText(page, 10)).toEqual([]);
  if (process.env.ARCADE_SHOT) await page.screenshot({ path: process.env.ARCADE_SHOT, fullPage: true });
});
