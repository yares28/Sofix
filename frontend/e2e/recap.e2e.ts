import { expect, test } from "@playwright/test";
import { currentWeek, seasonWeeks } from "../lib/weeks";
import type { GameweekPlan, Sorare } from "../lib/play";
import { APP, MOCK, offline, resetBackend, servedGrid } from "./helpers";
import { E2E_REVALIDATE_SECRET } from "./constants";

test("Recap and Play keep the current GW, compare all entered and best-plan lineups, and retain custom estimates", async ({ page, request }) => {
  await resetBackend(request);
  await offline(page);
  const data = (await (await request.get(`${MOCK}/api/sorare`)).json()).data as Sorare;
  const next = data.timeline.find(w => w.id === data.nextId)!;
  const info = data.timeline.filter(w => w.start < next.start).at(-1)!;
  info.start = new Date(Date.now() - 24 * 3600_000).toISOString();
  info.end = next.start;
  const current = currentWeek(seasonWeeks(await servedGrid(request), data, new Date()))!;
  expect(current.state).toBe("live");
  expect(current.gw).toBe(info.id);
  const forecast = structuredClone(data.weeks.find(w => w.gameweek.id === data.nextId)!) as GameweekPlan;
  forecast.gameweek = { ...info, name: `Game Week ${info.number}` };
  const best = structuredClone(forecast.plans[0]!);
  best.rank = 2; best.essence = 500;
  // More than the old three-lineup cap; duplicate competition keys are normal when entering multiple teams.
  best.lineups = [...best.lineups, structuredClone(best.lineups[0]!)];
  best.lineups[0]!.actual = { total: 0, cash: 0, essence: 0, card: false, need: null, bonusLost: false, cameIn: [] };
  best.lineups[1]!.actual = { total: 312.4, cash: 0, essence: 0, card: false, need: null, bonusLost: false, cameIn: [] };
  forecast.plans = [{ ...forecast.plans[0]!, essence: 10 }, best];
  data.weeks = data.weeks.filter(w => w.gameweek.id !== info.id);
  await request.post(`${MOCK}/__test/my-weeks`, { data: { weeks: [], frozenPlans: [], livePlan: forecast, sorareData: data } });
  await request.post(`${APP}/api/revalidate`, { headers: { authorization: `Bearer ${E2E_REVALIDATE_SECRET}` } });
  const lineup = best.lineups[0]!;
  await page.addInitScript(({ slug, lineup }) => {
    const root = globalThis as typeof globalThis & { chrome?: { runtime?: { sendMessage?: (id: string, message: Record<string, unknown>, reply: (value: unknown) => void) => void } } };
    root.chrome ??= {}; root.chrome.runtime ??= {};
    root.chrome.runtime.sendMessage = (_id, message, reply) => {
      if (message.type === "ping") return reply({ ok: true, version: "0.3.13", sorareUser: "e2e-manager", appReachable: true });
      const cards = [...lineup.starters, ...lineup.subs];
      const entered = [false, true].map(custom => ({
        id: custom ? "custom" : "recorded", name: custom ? "Custom captain" : "Recorded lineup", draft: false,
        so5Leaderboard: { slug: lineup.board, displayName: lineup.comp,
          rules: { appearances: cards.map((c, i) => ({ positions: c.slot === "EXT" || c.slot === "OUT" ? ["Defender", "Midfielder", "Forward"] : [c.pos], sub: i >= lineup.starters.length })) },
          engineConfiguration: { captain: lineup.captainBonus, season: 0.05, grade: 0.01, scarcity: {} },
          displayedTypedRules: [],
        },
        so5Rankings: [{ score: custom ? 313.4 : 0, ranking: 20, so5Leaderboard: { slug: lineup.board }, so5Rewards: [] }],
        so5Appearances: cards.map((c, index) => ({ index, grade: c.level, averageScore: c.average, positions: [c.pos], anyCard: { slug: c.slug, inSeasonEligible: c.inSeason, anyTeam: { name: c.club ?? "Unknown" } }, player: { slug: c.player, displayName: c.name },
          pictureUrl: c.pic, rarity: c.rarity, score: 0,
          captain: custom ? index === (lineup.starters.findIndex(s => s.captain) === 0 ? 1 : 0) : !!c.captain,
        })),
      }));
      reply({ state: "ok", data: { so5: { so5Fixture: { mySo5Lineups: message.slug === slug ? entered : [] } } } });
    };
  }, { slug: info.slug, lineup });

  await page.goto("/");
  await expect(page.getByRole("button", { name: new RegExp(`Sorare GW${info.number} `) })).toBeVisible();
  const mine = page.getByRole("region", { name: "Your Sorare lineups", exact: true });
  await expect(mine.locator(".pl-entered-lineup")).toHaveCount(2);
  await expect(mine.locator(".pl-entered-expected b").first()).toHaveText(String(Math.round(lineup.x)));
  await expect(mine.locator(".pl-entered-expected").last()).toContainText("xScore estimate");
  await expect(mine.locator(".pl-entered-result b").first()).toHaveText("0");
  await expect(mine.locator(".pl-entered-result b").last()).toHaveText("313");
  const plan = page.getByRole("region", { name: "Best Sofix plan" });
  await expect(plan.locator(".rc-lu")).toHaveCount(best.lineups.length);
  await expect(plan).toContainText("500 expected essence");
  await expect(plan.locator(".rc-score-pair").first()).toContainText("Actual0");
  await expect(plan.locator(".rc-rest")).toHaveCount(0);
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: 900 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
    await page.screenshot({ path: `../output/playwright/recap-comparison-${width}.png`, fullPage: true });
  }

  await page.goto("/play");
  await expect(page.locator(".pl-board-note")).toContainText("Plan 2");
  await expect(page.getByRole("navigation", { name: "Plan", exact: true }).locator('[aria-current="page"]')).toContainText("best");
  await expect(mine.locator(".pl-entered-expected").last()).toContainText("xScore estimate");
  expect(await mine.evaluate(node => Boolean(document.querySelector(".pl-board")!.compareDocumentPosition(node) & Node.DOCUMENT_POSITION_FOLLOWING))).toBe(true);
  await page.reload();
  await expect(mine.locator(".pl-entered-lineup")).toHaveCount(2);
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: 900 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
    await mine.screenshot({ path: `../output/playwright/play-entered-${width}.png` });
  }
  await page.goto("/play?plan=1");
  await expect(page.locator(".pl-board-note")).toContainText("Plan 1");
  await page.getByRole("button", { name: "Next gameweek", exact: true }).click();
  await expect(mine.locator(".pl-entered-lineup")).toHaveCount(0);
  await expect(mine).not.toContainText("Custom captain");
  await page.goto("/difficulty");
  await expect(page.locator(".wk-trigger")).toContainText(`Sorare GW${info.number}`);
  await expect(page.getByRole("heading", { name: "Your week", exact: true })).toBeVisible();
});

test("a saved custom estimate survives closed Sorare tabs and follows the selected GW", async ({ page, request, context }) => {
  await resetBackend(request);
  await offline(page);
  const data = (await (await request.get(`${MOCK}/api/sorare`)).json()).data as Sorare;
  const info = data.timeline.find(w => Date.parse(w.end) < Date.now() - 86400_000 && !data.weeks.some(p => p.gameweek.id === w.id))!;
  const forecast = structuredClone(data.weeks.find(w => w.gameweek.id === data.nextId)!) as GameweekPlan;
  forecast.gameweek = { ...info, name: `Game Week ${info.number}` };
  const l = forecast.plans[0]!.lineups[0]!;
  const saved = { slug: info.slug, number: info.number, start: info.start, end: info.end, savedAt: info.end,
    lineups: [{ id: "saved-custom", name: "Custom captain", board: l.board, competition: l.comp, draft: false, confirmable: false,
      scoring: { slots: [...l.starters, ...l.subs].map((c, i) => ({ positions: c.slot === "EXT" || c.slot === "OUT" ? ["DEF", "MID", "FWD"] : [c.pos], sub: i >= l.starters.length })), minInSeason: l.minInSeason, captain: l.captainBonus, season: 0.05, grade: 0.01, scarcity: {}, clubBonus: null, averageBonus: null },
      cards: [...l.starters, ...l.subs].map((c, index) => ({ slug: c.slug, player: c.player, name: c.name, picture: c.pic, rarity: c.rarity, captain: index === (l.starters.findIndex(c => c.captain) === 0 ? 1 : 0), index, score: 0 })),
      result: { score: 0, rank: 10, essence: 0, cash: 0, card: false } }] };
  await request.post(`${MOCK}/__test/my-weeks`, { data: { weeks: [saved], frozenPlans: [], livePlan: forecast } });
  await request.post(`${APP}/api/revalidate`, { headers: { authorization: `Bearer ${E2E_REVALIDATE_SECRET}` } });
  const week = seasonWeeks(await servedGrid(request), data, new Date()).find(w => w.gw === info.id)!;
  await page.goto(`/?w=${week.id}`);
  const mine = page.getByRole("region", { name: "Your Sorare lineups", exact: true });
  await expect(mine).toContainText("Final lineups saved in Sofix");
  await expect(mine.locator(".pl-entered-expected")).toContainText("xScore estimate");
  const expected = await mine.locator(".pl-entered-expected b").textContent();
  expect(expected).toMatch(/^\d+$/);
  await expect(mine.locator(".pl-entered-result b")).toHaveText("0");
  await page.close();
  const reopened = await context.newPage();
  await offline(reopened);
  await reopened.goto(`/play?w=${week.id}`);
  await expect(reopened.locator(".pl-entered-expected b")).toHaveText(expected!);
  await expect(reopened.locator(".pl-entered-result b")).toHaveText("0");
});
