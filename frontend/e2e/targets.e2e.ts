import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import fixture from "./fixtures/reward-bars-response.json";
import { offline, resetBackend, smallText } from "./helpers";

// Targets draws the block the refresh publishes (e2e/fixtures/reward-bars-response.json: the real cut-offs of 13 finished weeks and
// the competitions of the lineups saved in the last six, built by backend/app/sorare/reward_bars.py). Nothing here recomputes a
// level: it checks every level reaches its ladder, XP ones included, and that pins follow what you play and what you click.

type Comp = (typeof fixture.data.competitions)[number];
const comps = fixture.data.competitions;
const byKey = (key: string) => comps.find((c) => c.key === key)!;
const laliga = byKey("LALIGA EA SPORTS | Limited");
const played = fixture.data.played.map(byKey);
const label = (c: Comp) => `${c.name}${c.rarity ? ` ${c.rarity}` : ""}`;

test.beforeEach(async ({ page, request }) => {
  await resetBackend(request);
  await offline(page);
});

test("the competitions you play are pinned as ladders, every level with its average score, XP levels below a line", async ({ page }) => {
  await page.goto("/targets");
  await expect(page.getByRole("heading", { level: 1, name: "What each reward takes" })).toBeVisible();
  await expect(page.getByText(`Average of ${fixture.data.weeks.length} finished gameweeks, latest ${fixture.data.latest}`)).toBeVisible();
  await expect(page.getByRole("link", { name: "Targets" })).toHaveAttribute("aria-current", "page");

  const pinned = page.getByRole("region", { name: "Pinned" });
  await expect(pinned.getByRole("article")).toHaveCount(played.length);
  for (const [i, c] of played.entries()) await expect(pinned.getByRole("article").nth(i)).toHaveAttribute("aria-label", label(c));

  const ladder = pinned.getByRole("article", { name: label(laliga), exact: true });
  const rungs = ladder.locator(".tg-rung");
  await expect(rungs).toHaveCount(laliga.ladder.length);
  for (const [i, l] of laliga.ladder.entries()) await expect(rungs.nth(i).locator("b")).toHaveText(String(Math.round(l.bar!)));
  await expect(rungs.first()).toContainText("1st");
  await expect(rungs.first()).toContainText("$2,000");
  await expect(ladder.locator(".tg-xpline")).toHaveText("XP only");
  await expect(rungs.last()).toContainText("500 XP");
  await expect(ladder.locator(".tg-rung[data-first]")).toContainText("250 essence");
  await expect(ladder).toContainText(`Paid from ${Math.round(laliga.bar!)}`);

  // A Pro board's best step sits on top too.
  const pro = byKey("LALIGA EA SPORTS | Pro");
  const steps = pinned.getByRole("article", { name: label(pro), exact: true }).locator(".tg-rung");
  await expect(steps.first()).toContainText(`Step ${Math.max(...pro.ladder.map((l) => l.lo))}`);
  await expect(steps.last()).toContainText(`Step ${Math.min(...pro.ladder.map((l) => l.lo))}`);
});

test("every competition reaches its group's list, and opening one shows its whole staircase", async ({ page }) => {
  await page.goto("/targets");
  const groups = { "In-season": "In-season", Classic: "Classic", Room: "Rooms", Pro: "Pro" } as const;
  for (const [group, name] of Object.entries(groups)) {
    await page.getByRole("group", { name: "Kind of competition" }).getByRole("button", { name, exact: true }).click();
    const inGroup = comps.filter((c) => c.group === group);
    for (let i = 0; i < inGroup.length; i += 10) {
      for (const c of inGroup.slice(i, i + 10)) {
        await expect(page.getByRole("button", { name: `Hide ${label(c)}`, exact: true })).toBeVisible();
      }
      if (i + 10 < inGroup.length) await page.getByRole("button", { name: "Next page" }).click();
    }
  }

  await page.getByRole("button", { name: "In-season", exact: true }).click();
  const open = page.getByRole("button", { name: `Every level of ${label(laliga)}`, exact: true });
  await open.click();
  await expect(open).toHaveAttribute("aria-expanded", "true");
  const stair = page.getByRole("img", { name: new RegExp(`^Every level of ${label(laliga)}, lowest first: 2,001–3,500 500 XP at 225`) });
  await expect(stair.locator(".tg-st")).toHaveCount(laliga.ladder.length);
  await open.click();
  await expect(stair).toHaveCount(0);

  await page.getByRole("button", { name: "Not read", exact: true }).click();
  await expect(page.locator(".tg-list")).toContainText("Reward table not read yet");
  const next = page.getByRole("button", { name: "Next page" });
  while (await next.isVisible() && await next.isEnabled()) await next.click();
  await expect(page.locator(".tg-list")).toContainText("No cards in this league");
});

test("pins and hidden competitions follow your clicks and stay after a reload", async ({ page }) => {
  await page.goto("/targets");
  const pinned = page.getByRole("region", { name: "Pinned" });
  const champion = byKey("Champion | Limited");
  // Unpinning one you play keeps it off; pinning another adds it after the ones you play.
  await pinned.getByRole("button", { name: `Unpin ${label(champion)}`, exact: true }).click();
  await expect(pinned.getByRole("article")).toHaveCount(played.length - 1);
  await page.getByRole("button", { name: "Classic", exact: true }).click();
  await page.getByRole("button", { name: "Pin All Star rare", exact: true }).click();
  await expect(pinned.getByRole("article").last()).toHaveAttribute("aria-label", "All Star rare");

  await page.getByRole("button", { name: "Hide U23 rare", exact: true }).click();
  await expect(page.getByRole("button", { name: "Hide U23 rare", exact: true })).toHaveCount(0);
  await page.reload();
  await expect(pinned.getByRole("article")).toHaveCount(played.length);
  await expect(pinned.getByRole("article", { name: label(champion), exact: true })).toHaveCount(0);
  await page.getByText("Hidden (1)").click();
  await page.getByRole("button", { name: "Show U23 rare" }).click();
  await expect(page.getByText("Hidden (1)")).toHaveCount(0);

  await page.getByRole("button", { name: "Classic", exact: true }).click();
  await page.getByRole("button", { name: `Pin ${label(champion)}`, exact: true }).click();
  await expect(pinned.getByRole("article", { name: label(champion), exact: true })).toHaveCount(1);
});

test("reads at 1440 and 390 px with no small text, no overflow and no accessibility violations", async ({ page }) => {
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/targets");
    await expect(page.locator(".tg-lad")).toHaveCount(played.length);
    await page.getByRole("button", { name: `Every level of ${label(laliga)}`, exact: true }).click();
    expect(await smallText(page, width === 390 ? 10 : 11)).toEqual([]);
    expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(0);
    expect((await new AxeBuilder({ page }).include(".tg").withTags(["wcag2a", "wcag2aa", "wcag21aa"]).analyze()).violations).toEqual([]);
  }
});

test("before the first refresh writes it, the page says so", async ({ page, request }) => {
  await resetBackend(request, "no-sorare");
  await page.goto("/targets");
  await expect(page.getByText("Waiting for the first refresh to record the cut-offs")).toBeVisible();
});
