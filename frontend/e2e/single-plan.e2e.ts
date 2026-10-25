import { expect, test } from "@playwright/test";
import { offline, resetBackend, sorare } from "./helpers";

test.beforeEach(async ({ page, request }) => { await resetBackend(request); await offline(page); });

test("one recommendation links to all alternatives for the selected GW, survives closing, and returns to the same Play week", async ({ page, context }) => {
  await page.goto("/play");
  await expect(page.getByRole("heading", { name: "Recommended plan", exact: true })).toBeVisible();
  await expect(page.getByRole("navigation", { name: "Plan", exact: true })).toHaveCount(0);
  const original = await page.locator('.wk-strip [aria-checked="true"]').getAttribute("aria-label");
  await page.getByRole("link", { name: "Other plans & strategies" }).click();
  await expect(page.getByRole("heading", { name: "Plan alternatives", exact: true })).toBeVisible();
  await expect(page.getByRole("navigation", { name: "Plan", exact: true }).getByRole("link")).toHaveCount(2);
  await expect(page.getByRole("region", { name: "Your Sorare lineups" })).toHaveCount(0);
  await page.getByRole("navigation", { name: "Plan", exact: true }).getByRole("link", { name: /^Plan 1 / }).click();
  await expect(page.getByRole("navigation", { name: "Plan", exact: true }).getByRole("link", { name: /^Plan 1 / })).toHaveAttribute("aria-current", "page");
  await expect(page).toHaveURL(/plan=1/);
  await page.getByRole("group", { name: "Plan made from" }).getByRole("link", { name: "Sorare", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Sorare plan", exact: true })).toBeVisible();
  const saved = page.url();
  await page.close();
  const reopened = await context.newPage();
  await offline(reopened);
  await reopened.goto(saved);
  await expect(reopened.getByRole("group", { name: "Plan made from" }).getByRole("link", { name: "Sorare", exact: true })).toHaveAttribute("aria-current", "page");
  await reopened.getByRole("link", { name: "Recommended plan", exact: true }).click();
  await expect(reopened).toHaveURL(/\/play\?/);
  await expect(reopened.locator('.wk-strip [aria-checked="true"]')).toHaveAttribute("aria-label", original!);
  await expect(reopened.getByRole("navigation", { name: "Plan", exact: true })).toHaveCount(0);
});

test("legacy bookmarks keep their source and plan and Results retains the podium and charts", async ({ page }) => {
  await page.goto(`/play?gw=${sorare.nextId}&plan=2`);
  await expect(page).toHaveURL(/\/audit\/strategies\?view=plans.*plan=2/);
  await expect(page.getByRole("navigation", { name: "Plan", exact: true }).getByRole("link", { name: /^Plan 2/ })).toHaveAttribute("aria-current", "page");
  await page.getByRole("navigation", { name: "Strategies view" }).getByRole("link", { name: "Results", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Best strategies", exact: true })).toBeVisible();
  await page.getByRole("navigation", { name: "Strategies view" }).getByRole("link", { name: "Plans", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Plan alternatives", exact: true })).toBeVisible();
  expect(new URL(page.url()).searchParams.get("gw")).toBe(sorare.nextId);
});

test("missing source plans stay missing rather than showing a different source's lineup", async ({ page, request }) => {
  await resetBackend(request, "no-sorare");
  await page.goto("/audit/strategies?view=plans&by=sorare");
  await expect(page.getByRole("heading", { name: "Plan alternatives", exact: true })).toBeVisible();
  await expect(page.getByRole("status")).toContainText("appears after the next refresh");
  await expect(page.getByRole("navigation", { name: "Plan", exact: true })).toHaveCount(0);
});
