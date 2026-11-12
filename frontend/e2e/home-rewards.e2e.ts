import { expect, test } from "@playwright/test";
import { MOCK, offline, resetBackend, servedGrid, smallText, sorare } from "./helpers";
import { bestPlan, chanceLabel, nextWeek } from "../lib/play";
import type { Sorare } from "../lib/play";
import { seasonWeeks } from "../lib/weeks";
import { projectedPrize, rewardNumber, rewardSignature } from "../lib/playRewards";

// The hero's You vs Sofix grid (plans/recap-matchnight.md): one cell per side and reward, paid when checked, else expected.
const cell = (page: import("@playwright/test").Page, who: "Y" | "S", reward: string) => page.locator(`.rx-cmp [data-who="${who}"][data-reward="${reward}"]`);

test("Home compares the selected GW's checked rewards with the Sofix plan's without a second private read", async ({ page, request, context }) => {
  await resetBackend(request); await offline(page);
  const week = nextWeek(sorare), plan = bestPlan(week.plans)!, line = plan.lineups[0]!;
  const unit = `essence:${line.rarity}:${line.kind ?? "unknown"}`;
  await request.post(`${MOCK}/__test/my-weeks`, { data: { playRewards: { slug: week.gameweek.slug, state: "checked", you: [{ id: "actual", rewards: {} }], sofix: plan.lineups.map((l, i) => ({ signature: rewardSignature(l), rewards: i ? {} : { "cash:USD": 5, [unit]: 50 } })) } } });
  const saved = { slug: week.gameweek.slug, savedAt: new Date().toISOString(), lineups: [{ id: "actual", name: "Actual", board: line.board, competition: line.comp, draft: false, confirmable: false, result: null, cards: [...line.starters, ...line.subs].map((c, index) => ({ slug: c.slug, player: c.player, name: c.name, rarity: c.rarity, picture: c.pic, score: null, captain: !!c.captain, index })) }] };
  saved.lineups.push({ ...saved.lineups[0]!, id: "draft", draft: true });
  let reads = 0;
  await context.route("**/api/my-week", route => { reads++; return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ weeks: [], snapshots: [saved], pending: [] }) }); });
  const served = (await (await request.get(`${MOCK}/api/sorare`)).json()).data as Sorare;
  const weeks = seasonWeeks(await servedGrid(request), served, new Date());
  const selected = weeks.find(w => w.gw === week.gameweek.id)!;
  await page.goto(`/?w=${selected.id}`);
  const duel = page.getByRole("region", { name: "You against the Sofix plan" });
  await expect(duel).toContainText("1 Lineup");
  await expect(cell(page, "Y", "cash:USD")).toHaveText("$0.00");
  await expect(cell(page, "S", "cash:USD")).toHaveText("$5.00");
  await expect(cell(page, "S", unit)).toHaveText("50");
  await expect(cell(page, "S", unit)).toHaveClass(/\bwin\b/); // the better value of the column is lit
  await expect(cell(page, "Y", unit)).toHaveText(rewardNumber(unit, 0));
  await expect(duel.locator('[data-reward="card"]')).toHaveCount(0);
  await expect(cell(page, "Y", "chance")).toHaveText(line.pReturn === 1 ? "100%" : chanceLabel(line.pReturn));
  const mean = plan.lineups.reduce((sum, l) => sum + l.pReturn, 0) / plan.lineups.length;
  await expect(cell(page, "S", "chance")).toHaveText(mean === 1 ? "100%" : chanceLabel(mean));
  await expect(duel).toContainText("The Sofix plan would have won more");
  await expect(page.locator(".rx-big")).toContainText("No prize this week");
  expect(projectedPrize(line)).toBeTruthy();
  // The hand: the week's best cards, the best one named under the fan; another card takes the plate when hovered.
  const hand = page.getByRole("list", { name: "Your best cards this week, by xS" });
  await expect(hand.getByRole("listitem")).toHaveCount(Math.min(10, week.playing.players.length));
  const second = [...week.playing.players].sort((a, b) => b.x - a.x || a.name.localeCompare(b.name))[1]!;
  await hand.getByRole("link", { name: new RegExp(`^2\. ${second.name},`) }).focus(); // the lifted best card covers its neighbours' middles, so a pointer reaches them by their edges
  await expect(page.locator(".rx-plate")).toContainText(second.name);
  await expect.poll(() => reads).toBe(1); // one entered-lineup read (Your season, with its archive reads, moved to Audit · Rewards on 2 Nov 2026)
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: 900 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
    expect(await smallText(page, width === 390 ? 10 : 11)).toEqual([]);
  }
  await page.reload(); await expect(cell(page, "S", "cash:USD")).toHaveText("$5.00");
  const other = weeks.find(w => w.gw && w.gw !== week.gameweek.id)!;
  await page.goto(`/?w=${other.id}`);
  await expect(page.locator(".rx-duel", { hasText: "$5.00" })).toHaveCount(0); // that week has its own grid, or none when nothing is entered or planned
});

test("Home holds the hero number and your reward cells in place while a cold saved-lineup read is pending", async ({ page, request, context }) => {
  await resetBackend(request); await offline(page);
  const served = (await (await request.get(`${MOCK}/api/sorare`)).json()).data as Sorare;
  const week = nextWeek(served), line = bestPlan(week.plans)!.lineups[0]!;
  const selected = seasonWeeks(await servedGrid(request), served, new Date()).find(w => w.gw === week.gameweek.id)!;
  let release!: () => void;
  const held = new Promise<void>(resolve => { release = resolve; });
  await context.route("**/api/my-week", async route => {
    await held;
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ weeks: [], snapshots: [{ slug: week.gameweek.slug, savedAt: new Date().toISOString(), lineups: [{ id: "saved", name: "Saved", board: line.board, competition: line.comp, draft: false, confirmable: false, result: null, cards: [...line.starters, ...line.subs].map((c, index) => ({ slug: c.slug, player: c.player, name: c.name, rarity: c.rarity, picture: c.pic, score: null, captain: !!c.captain, index })) }] }], pending: [] }) });
  });
  await page.goto(`/?w=${selected.id}`);
  const duel = page.getByRole("region", { name: "You against the Sofix plan" });
  await expect(page.locator(".rx-big")).toHaveAttribute("aria-busy", "true");
  await expect(cell(page, "Y", "cash:USD").locator(".rx-skel")).toBeVisible();
  const before = await duel.boundingBox();
  release();
  await expect(cell(page, "Y", "chance")).not.toContainText("—");
  const after = await duel.boundingBox();
  expect(Math.abs(before!.height - after!.height)).toBeLessThanOrEqual(1);
  await expect(duel).toContainText("1 Lineup · expected");
});

test("Home keeps settled rewards attached to the retained plan when replay and private snapshots change", async ({ page, request, context }) => {
  await resetBackend(request); await offline(page);
  const data = structuredClone(sorare), week = nextWeek(data), frozen = structuredClone(week), original = bestPlan(frozen.plans)!;
  for (const plan of week.plans) for (const line of plan.lineups) line.board = `replay-${line.board}`;
  await request.post(`${MOCK}/__test/my-weeks`, { data: { sorareData: data, livePlan: frozen, playRewards: {
    slug: week.gameweek.slug, state: "checked", planRank: original.rank,
    you: [{ id: "historical", rewards: { "cash:USD": 2.5 } }],
    sofix: original.lineups.map((line, i) => ({ signature: rewardSignature(line), rewards: i ? {} : { "cash:USD": 5 } })),
  } } });
  await context.route("**/api/my-week", route => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ weeks: [], snapshots: [], pending: [] }) }));
  const served = (await (await request.get(`${MOCK}/api/sorare`)).json()).data as Sorare;
  const selected = seasonWeeks(await servedGrid(request), served, new Date()).find(w => w.gw === week.gameweek.id)!;
  await page.goto(`/?w=${selected.id}`);
  await expect(cell(page, "Y", "cash:USD")).toHaveText("$2.50");
  await expect(cell(page, "Y", "chance")).toHaveText("—");
  await expect(cell(page, "S", "cash:USD")).toHaveText("$5.00");
  await expect(page.getByRole("region", { name: "You against the Sofix plan" })).toContainText(`${original.lineups.length} Lineups`);
  await expect(page.locator('.rx-cmp [data-who="S"][data-reward^="essence:"]').last()).toHaveText("0");
  await expect(page.locator(".rx-big")).toContainText("$2.50");
});

test("Home's table skyline gives each club its next game's FDR after the selected round, and switches to the table now", async ({ page, request }) => {
  await resetBackend(request); await offline(page);
  const served = (await (await request.get(`${MOCK}/api/sorare`)).json()).data as Sorare;
  const grid = await servedGrid(request), weeks = seasonWeeks(grid, served, new Date());
  const selected = weeks.find(w => w.column !== null && grid.teams.some(t => t.cells[w.column! + 1]?.some(c => c.prediction)))!;
  await page.goto(`/?w=${selected.id}`);
  const sky = page.getByRole("region", { name: /^Table after round/ });
  await expect(sky.locator(".rx-col")).toHaveCount(grid.teams.length);
  const team = grid.teams.find(t => t.cells[selected.column! + 1]?.some(c => c.prediction))!;
  const next = team.cells.slice(selected.column! + 1).find(c => c.length)![0]!;
  const col = sky.locator(".rx-col").filter({ hasText: `${team.name}, place` });
  await expect(col.locator(".difficulty-chip")).toHaveText(next.prediction ? String(Math.round(next.prediction.difficulty)) : "—");
  if (next.prediction) await expect(col.locator(".difficulty-chip")).toHaveClass(new RegExp(`f${next.prediction.bucket}`));
  await expect(sky.locator(".rx-bar").first()).toHaveClass(/zone-ucl/); // Champions League places wear UEFA's blue
  await sky.getByRole("button", { name: "Now", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Table now" })).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
});

test("Home's round shows every competition's games of the week, one competition or one day at a time, and the picked game's sheet", async ({ page, request }) => {
  await resetBackend(request); await offline(page);
  const served = (await (await request.get(`${MOCK}/api/sorare`)).json()).data as Sorare;
  const grid = await servedGrid(request), weeks = seasonWeeks(grid, served, new Date());
  const selected = weeks.find(w => w.column !== null && grid.teams.some(t => t.cells[w.column!]?.some(c => c.prediction)))!;
  await page.goto(`/?w=${selected.id}`);
  const round = page.getByRole("region", { name: "The round" });
  const stubs = round.locator(".rx-stub, .rx-wt");
  const total = await stubs.count();
  expect(total).toBeGreaterThan(0);
  // It opens on LaLiga alone; the competition menu offers All and only competitions with games; the day menu only days with games.
  await round.getByRole("button", { name: /^LaLiga/ }).click();
  const options = round.getByRole("group", { name: "Competition" }).getByRole("button");
  await expect(options.first()).toContainText("All competitions");
  for (const text of await options.allInnerTexts()) expect(Number(text.match(/(\d+)\s*$/)?.[1])).toBeGreaterThan(0);
  await options.first().click();
  await expect(round.getByRole("group", { name: "Competition" })).toHaveCount(0);
  expect(await stubs.count()).toBeGreaterThanOrEqual(total);
  await round.getByRole("button", { name: /^All days/ }).click();
  const day = round.getByRole("group", { name: "Day" }).getByRole("button").nth(1);
  const dayCount = Number((await day.innerText()).match(/(\d+)\s*$/)![1]);
  await day.click();
  await expect(stubs).toHaveCount(dayCount);
  // A picked game opens its match sheet.
  const first = stubs.first();
  await first.click();
  await expect(first).toHaveAttribute("aria-pressed", "true");
  await expect(round.getByRole("region", { name: /^Match sheet:/ })).toBeVisible();
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: 900 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
    expect(await smallText(page, width === 390 ? 10 : 11)).toEqual([]);
  }
});
