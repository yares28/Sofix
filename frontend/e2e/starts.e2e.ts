import { expect, test } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { resetBackend, smallText } from "./helpers";

test.beforeEach(async ({ request }) => { await resetBackend(request, "audit-enough"); });

test("all seven competitions, source totals and every chart use the selected scope after reload and reopening", async ({ page, context }) => {
  await page.goto("/audit/starts");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Who starts");
  const comps = page.getByRole("region", { name: "By competition", exact: true });
  await expect(comps.getByRole("heading", { level: 3 })).toHaveText(["01LaLiga", "02Premier League", "03Bundesliga", "04Ligue 1", "05Champions League", "06Europa League", "07Conference League"]);
  await expect(comps).not.toContainText("Serie A");
  await page.getByLabel("Competition", { exact: true }).selectOption("uefa-europa-league");
  const sofix = page.getByRole("article", { name: "Sofix", exact: true });
  await expect(sofix).toContainText("0%");
  await expect(sofix).toContainText("1 game checked");
  await page.getByRole("tablist", { name: "Prediction source" }).getByRole("tab", { name: "Sofix", exact: true }).click();
  const styles = page.getByRole("tablist", { name: "Chart style" });
  await styles.getByRole("tab", { name: "B · Calibration" }).click();
  await expect(page.locator(".ws-evidence")).toHaveText("90% predicted · 0% started · 1 game");
  await styles.getByRole("tab", { name: "B · Calibration" }).press("ArrowRight");
  await expect(styles.getByRole("tab", { name: "C · Paired bars" })).toBeFocused();
  await expect(page.getByRole("list", { name: "Paired probability bars" })).toContainText("0% started");
  const bookmark = page.url();
  await page.reload();
  await expect(styles.getByRole("tab", { name: "C · Paired bars" })).toHaveAttribute("aria-selected", "true");
  await expect(sofix).toContainText("1 game checked");
  const another = await context.newPage();
  await another.goto(bookmark);
  await expect(another.getByRole("tab", { name: "C · Paired bars" })).toHaveAttribute("aria-selected", "true");
  await another.close();
  await page.getByRole("navigation", { name: "Audit", exact: true }).getByRole("link", { name: "Lineups", exact: true }).click();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Lineups");
  await page.goBack();
  await expect(page.getByLabel("Competition", { exact: true })).toHaveValue("uefa-europa-league");
  await expect(page.getByRole("tab", { name: "C · Paired bars" })).toHaveAttribute("aria-selected", "true");
});

test("club comparisons and probability bands paginate without suppressing one-case results", async ({ page }) => {
  await page.goto("/audit/starts");
  await page.getByRole("tablist", { name: "Eleven breakdown" }).getByRole("tab", { name: "Club", exact: true }).click();
  const panel = page.getByRole("tabpanel", { name: "Predicted eleven results" });
  await expect(panel.getByRole("region")).toHaveCount(12);
  await expect(panel.getByRole("region").first()).toContainText("100%");
  await expect(panel.getByRole("region").first()).toContainText("1 of 1 started");
  await page.getByRole("navigation", { name: "Predicted eleven groups" }).getByRole("button", { name: "Next", exact: true }).click();
  await expect(panel.getByRole("region")).toHaveCount(8);
  await page.reload();
  await expect(panel.getByRole("region")).toHaveCount(8);
  await expect(page.locator(".ws-board")).not.toContainText(/Too few|Not yet|to go/);
});

test("all chart styles are readable and accessible at phone width", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/audit/starts");
  for (const name of ["A · Connected dots", "B · Calibration", "C · Paired bars"]) {
    await page.getByRole("tab", { name, exact: true }).click();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    expect(await smallText(page, 10)).toEqual([]);
  }
  await expect(page.getByRole("article")).toHaveCount(3);
  // Check the readable resting state after the chart's short reveal transition.
  await expect(page.locator(".ws-chart")).toHaveCSS("opacity", "1");
  const scan = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa"]).analyze();
  expect(scan.violations).toEqual([]);
});
