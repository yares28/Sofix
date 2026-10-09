import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import { offline, resetBackend, smallText } from "./helpers";

test("Control names all five kept datasets even before the first health publication", async ({ page, request }) => {
  await resetBackend(request);
  await offline(page);
  await page.goto("/control");
  const saved = page.getByRole("region", { name: "Saved data" });
  for (const name of ["Player games", "Match odds", "Match forecasts", "Absence spells", "Your weeks"]) {
    await expect(saved.getByText(name, { exact: true })).toBeVisible();
  }
  await expect(saved).toContainText("Not checked yet");
  expect((await new AxeBuilder({ page }).include(".cc-data").analyze()).violations).toEqual([]);
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: 900 });
    expect(await smallText(page, width === 1440 ? 11 : 10)).toEqual([]);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  }
});
