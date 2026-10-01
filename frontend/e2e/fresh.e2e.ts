import { expect, test } from "@playwright/test";
import { offline, resetBackend } from "./helpers";

// How fresh a reading is reads the same on every page: how long ago, and the Madrid time it was made ("9 h ago (03:33)").

const AGO = String.raw`(?:just now|\d+ (?:min|h) ago|\d+ days ago) \(\d{2}:\d{2}\)`;

test.beforeEach(async ({ page, request }) => {
  await resetBackend(request);
  await offline(page);
});

test("Home says when Sorare was synced, the way every page does", async ({ page }) => {
  await page.goto("/");

  await expect(page.getByText(new RegExp(`synced ${AGO}`)).first()).toBeVisible();
  await expect(page.getByText(new RegExp(`FF read ${AGO}`)).first()).toBeVisible();
});

test("Play says when it was synced in the same form", async ({ page }) => {
  await page.goto("/play");

  await expect(page.locator(".pl-chip")).toHaveText(new RegExp(`^synced ${AGO}$`));
});

test("Lineups says when it was read in the same form", async ({ page }) => {
  await page.goto("/lineups");

  await expect(page.getByText(new RegExp(`^Read ${AGO}$`)).first()).toBeVisible();
  await expect(page.getByRole("status").first()).toContainText(new RegExp(`teams read ${AGO}`));
});

test("Control and the status pill say when the board was updated in the same form", async ({ page }) => {
  await page.goto("/control");

  await expect(page.getByText(new RegExp(`Updated ${AGO}`)).first()).toBeVisible();
  await expect(page.getByRole("link", { name: new RegExp(`updated ${AGO}`) })).toBeVisible();
});
