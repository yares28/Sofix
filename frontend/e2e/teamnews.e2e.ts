import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import { offline, resetBackend } from "./helpers";

// The Recap's Team news (`teamNews` of the gameweek being planned, served by the mock API): how the owner's players
// look, who in his plan might not start, and what moved since yesterday.

test.beforeEach(async ({ page, request }) => {
  await resetBackend(request);
  await offline(page);
});

test("the home says how your players look for the round, in one bar", async ({ page }) => {
  await page.goto("/");
  const news = page.getByRole("region", { name: "Team news" });

  await expect(news.getByRole("heading", { level: 2, name: "Team news" })).toBeVisible();
  await expect(news).toContainText("FF read");
  await expect(news).toContainText("73 of your players have an FF chance this round");
  await expect(news.getByRole("img", { name: "35 likely to start, 21 in doubt, 16 unlikely, 1 out" })).toBeVisible();
  await expect(news).toContainText("11 more without one: SO or SF");
  await expect(news.getByText(/^Locks .* · in /)).toBeVisible();
  await expect(news.getByRole("link", { name: "Lineups" })).toHaveAttribute("href", "/lineups");
});

test("the plan's starters who might not start are named with their game, their lineup and whose number it is", async ({ page }) => {
  await page.goto("/");
  const news = page.getByRole("region", { name: "Team news" });

  await expect(news.getByRole("heading", { level: 3, name: /4 starters in your plan might not start/ })).toBeVisible();
  const rows = news.locator(".hm-nw-col").first().locator(".hm-nw-row");
  await expect(rows).toHaveCount(4);
  await expect(rows.first()).toContainText("Unai Simón");
  await expect(rows.first()).toContainText("v Getafe CF");
  await expect(rows.first()).toContainText("LALIGA EA SPORTS");
  await expect(rows.first().getByRole("img", { name: "Doubt" })).toBeVisible();
  await expect(rows.first().getByRole("img", { name: "FF" })).toBeVisible();
  await expect(rows.first()).toContainText("50%");
  await expect(news.getByRole("link", { name: "Open Play" })).toHaveAttribute("href", "/play");
});

test("what moved since yesterday shows from and to, with the reason", async ({ page }) => {
  await page.goto("/");
  const moved = page.getByRole("region", { name: "Team news" }).locator(".hm-nw-col").nth(1);

  await expect(moved.getByRole("heading", { level: 3, name: "Moved since yesterday" })).toBeVisible();
  const rows = moved.locator(".hm-nw-row");
  await expect(rows).toHaveCount(5);
  await expect(rows.first()).toContainText("80 →");
  await expect(rows.first()).toContainText("0%");
  await expect(rows.first()).toContainText("Out");
  await expect(rows.first()).toContainText("down from 80%");
  await expect(rows.nth(1)).toContainText("up from 20%");
});

test("the team news has no accessibility violations", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("region", { name: "Team news" })).toBeVisible();

  const results = await new AxeBuilder({ page }).include(".hm-news").analyze();
  expect(results.violations.map((v) => `${v.id}: ${v.nodes.length}`)).toEqual([]);
});

test.describe("while Futbol Fantasy has told nothing about the week", () => {
  test("a break of national-team games says so, and where the next club games are", async ({ page, request }) => {
    await resetBackend(request, "no-news-national");
    await page.goto("/");
    const news = page.getByRole("region", { name: "Team news" });

    await expect(news.getByRole("status")).toContainText(/GW\d+ is national-team games\./);
    await expect(news.getByRole("status")).toContainText("Futbol Fantasy covers LaLiga only.");
    await expect(news.getByRole("status")).toContainText(/Round 8's lineups are on Lineups \(\d+ of your players\)\./);
    await expect(news).not.toContainText("has not published a lineup");
    await expect(news.getByRole("link", { name: "Lineups" })).toHaveAttribute("href", "/lineups");
  });

  test("a week of club games says when Futbol Fantasy publishes a club's next game", async ({ page, request }) => {
    await resetBackend(request, "no-news-laliga");
    await page.goto("/");
    const news = page.getByRole("region", { name: "Team news" });

    await expect(news.getByRole("status")).toContainText("Futbol Fantasy has not published a lineup for your players yet.");
    await expect(news.getByRole("status")).toContainText("about a day after its last one");
    await expect(news).not.toContainText("national-team games");
  });
});

test("with nothing to say, Team news shares a row with the tiles beside it instead of a full-width card holding one sentence", async ({ page, request }) => {
  await resetBackend(request, "no-news-national");
  await page.goto("/");
  const news = page.getByRole("region", { name: "Team news" });
  const page_ = page.viewportSize()!.width;
  const box = (await news.boundingBox())!;
  const beside = (await page.locator(".rc-news").boundingBox())!;

  expect(box.width, "narrower than the page's content").toBeLessThan(page_ * 0.5);
  expect(beside.y, "on the row of News this week").toBeLessThan(box.y + box.height);
});

