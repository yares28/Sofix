import { expect, type Page } from "@playwright/test";
import { pageLayout } from "../components/navigation/PageSkeleton";

export async function holdNavigation(page: Page, pathname: string) {
  let release!: () => void;
  const gate = new Promise<void>((resolve) => { release = resolve; });
  await page.route((url) => url.pathname === pathname && url.searchParams.has("_rsc"), async (route) => {
    await gate;
    await route.continue();
  });
  return release;
}

/** Real bar clicks, with the RSC response held, across every navigable page and both detail families. */
export async function navigationSweep(page: Page, width: number) {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/team/ATL");
  const top = page.locator(width < 701 ? ".tabbar" : ".nav-links");
  const lens = page.locator(".lens");
  const steps: [string, string, "top" | "lens" | "status"][] = [
    ["Gallery", "/cards", "top"], ["Players", "/players", "lens"], ["Stats", "/stats", "lens"], ["Prices", "/prices", "lens"],
    ["Season", "/season", "top"], ["Difficulty", "/difficulty", "lens"], ["Table", "/table", "lens"],
    ["This week", "/", "top"], ["Sorare", "/play", "lens"], ["Targets", "/targets", "lens"], ["LaLiga", "/fixtures", "lens"],
    ["Lineups", "/lineups", "lens"], ["Scores", "/scores", "lens"], ["Missions", "/missions", "lens"],
    ["Audit", "/audit", "top"], ["Who starts", "/audit/starts", "lens"], ["Lineups", "/audit/lineups", "lens"],
    ["Strategies", "/audit/strategies", "lens"], ["Rewards", "/audit/rewards", "lens"], ["Missions", "/audit/missions", "lens"],
    ["Arcade", "/arcade", "top"], ["Control Center", "/control", "status"],
  ];
  for (const [name, pathname, bar] of steps) {
    const release = await holdNavigation(page, pathname);
    const layout = pageLayout(new URL(pathname, "http://localhost"))!;
    let bounds;
    const file = pathname.replaceAll("/", "-") || "home";
    try {
      await (bar === "status" ? page.getByRole("link", { name: /^Control Center:/ }) : (bar === "top" ? top : lens).getByRole("link", { name, exact: true })).click();
      const loading = page.getByRole("main", { name: `Loading ${layout.label}`, exact: true });
      await expect(loading).toBeVisible();
      await expect(loading).toHaveAttribute("aria-busy", "true");
      expect(await page.getByRole("main").count()).toBe(1);
      expect(await page.evaluate(() => document.documentElement.scrollWidth), `${pathname}: loading overflow`).toBeLessThanOrEqual(width);
      bounds = await loading.boundingBox();
      await page.screenshot({ path: `output/playwright/navigation/${width}${file}-loading.png` });
    } finally { release(); }
    await expect(page).toHaveURL(url => url.pathname === pathname, { timeout: 30_000 }); // also covers a dev server compiling a cold route
    await expect(page.locator(".ns-page")).toHaveCount(0, { timeout: 30_000 });
    const main = page.getByRole("main");
    await expect(main).toBeVisible();
    const arrived = await main.boundingBox();
    expect(arrived!.x, `${pathname}: main left`).toBeCloseTo(bounds!.x, 0);
    expect(arrived!.width, `${pathname}: main width`).toBeCloseTo(bounds!.width, 0);
    expect(await page.evaluate(() => document.documentElement.scrollWidth), `${pathname}: loaded overflow`).toBeLessThanOrEqual(width);
    await page.screenshot({ path: `output/playwright/navigation/${width}${file}-loaded.png` });
  }
}
