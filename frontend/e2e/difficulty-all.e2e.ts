import { expect, test } from "@playwright/test";
import { offline, resetBackend } from "./helpers";

test.beforeEach(async ({ page, request }) => {
  await resetBackend(request);
  await offline(page);
});

test("All combines competitions, ranks forty clubs and keeps the chosen date through navigation", async ({ page, context }) => {
  await page.goto("/difficulty?league=PL");
  const picker = page.locator(".df-hero").getByRole("group", { name: "Competition", exact: true });
  await expect(picker.getByRole("button")).toHaveCount(8);
  await picker.getByRole("button", { name: "All", exact: true }).click();
  await expect(page).toHaveURL(/league=ALL/, { timeout: 30_000 });
  await expect(page.locator(".table-card")).toHaveCount(0);
  await expect(page.locator(".bento-all .ladder-card")).toBeVisible();
  await expect(page.getByRole("navigation", { name: "Expected points pages" })).toContainText("1–10 of 40");
  const rowsOverlap = await page.locator(".ladder-card .list-rows > li").evaluateAll(rows => rows.some(row =>
    [...row.querySelectorAll(".tile")].some(tile => tile.getBoundingClientRect().bottom > row.getBoundingClientRect().bottom + 1)));
  expect(rowsOverlap).toBe(false);
  const names: string[] = [];
  for (let i = 0; i < 4; i++) {
    names.push(...await page.locator(".ladder-card .list-name").allTextContents());
    if (i < 3) await page.getByRole("navigation", { name: "Expected points pages" }).getByRole("button", { name: "Next page" }).click();
  }
  expect(new Set(names).size).toBe(40);
  await page.getByRole("group", { name: "Horizon", exact: true }).getByRole("button", { name: "Next 3", exact: true }).click();
  await expect(page).toHaveURL(/h=3/, { timeout: 30_000 });
  await expect(page.getByRole("navigation", { name: "Expected points pages" })).toContainText("1–10 of 40");
  await page.getByRole("group", { name: "Lens", exact: true }).getByRole("button", { name: "Attack", exact: true }).click();
  await expect(page.locator(".ladder-card h2")).toHaveText("Expected goals");
  const bookmark = page.url();
  const cold = await context.newPage();
  await cold.goto(bookmark);
  await page.close();
  await expect(cold.locator(".competition-icons").getByRole("button", { name: "All", exact: true })).toHaveAttribute("aria-pressed", "true");
  await expect(cold.locator(".ladder-card h2")).toHaveText("Expected goals");
  const href = await cold.locator(".ladder-card .list-club").first().getAttribute("href");
  expect(href).toMatch(/league=(PD|PL|BL1|FL1|CL|EL|CONF)/);
  expect(href).toContain("w=");
  await cold.locator(".competition-icons").getByRole("button", { name: "Bundesliga", exact: true }).click();
  await expect(cold).toHaveURL(/league=BL1/);
  await expect(cold.locator(".table-card")).toBeVisible();
  expect(new URL(cold.url()).searchParams.get("w")).toBe(new URL(bookmark).searchParams.get("w"));
});

test("All has a usable empty week and keyboard competition controls", async ({ page }) => {
  await page.goto("/difficulty?league=ALL&w=2028-12-01");
  await expect(page.getByRole("status")).toContainText("No All fixtures");
  await page.goto("/difficulty?league=ALL");
  const button = page.locator(".competition-icons").getByRole("button", { name: "LaLiga", exact: true });
  await expect(button).toBeEnabled();
  await button.focus();
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/league=PD/);
});

test("All never creates a combined domestic and European league table", async ({ page }) => {
  await page.goto("/table?league=ALL&w=2026-10-26");
  await expect(page).toHaveURL(/league=PD/);
  await expect(page.getByRole("combobox", { name: "Competition" })).toHaveValue("PD");
});
