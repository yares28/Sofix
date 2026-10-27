import { expect, test } from "@playwright/test";
import { MOCK, offline, resetBackend, servedGrid, smallText, sorare } from "./helpers";
import { bestPlan, nextWeek } from "../lib/play";
import type { Sorare } from "../lib/play";
import { seasonWeeks } from "../lib/weeks";
import { rewardNumber, rewardSignature } from "../lib/playRewards";

test("Home compares the selected GW's expected and checked rewards without a second private read", async ({ page, request, context }) => {
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
  const card = page.getByRole("region", { name: "Rewards", exact: true });
  const own = card.getByRole("region", { name: "You GW rewards" });
  const sofix = card.getByRole("region", { name: "Sofix GW rewards" });
  await expect(own).toContainText("1 lineup · 1/1 checked");
  await expect(own.locator('[data-reward="cash:USD"] dd').last()).toHaveText("$0.00");
  await expect(sofix.locator('[data-reward="cash:USD"] dd').last()).toHaveText("$5.00");
  await expect(sofix.locator(`[data-reward="${unit}"] dd`).last()).toHaveText("50");
  await expect(own).toContainText("Expected");
  expect(typeof line.eEss).toBe("number");
  await expect(own.locator(`[data-reward="${unit}"] dd`).first()).toHaveText(rewardNumber(unit, line.eEss!));
  await expect.poll(() => reads).toBe(3); // season archive reads before/after, plus one entered-lineup read
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: 900 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
    expect(await smallText(page, width === 390 ? 10 : 11)).toEqual([]);
  }
  await page.reload(); await expect(own).toContainText("1/1 checked");
  const other = weeks.find(w => w.gw && w.gw !== week.gameweek.id)!;
  await page.goto(`/?w=${other.id}`);
  await expect(page.locator(".rc-rewards")).not.toContainText("$5.00");
});

test("Home reserves the reward rows while a cold saved-lineup read is pending", async ({ page, request, context }) => {
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
  const own = page.getByRole("region", { name: "You GW rewards" });
  await expect(own).toHaveAttribute("aria-busy", "true");
  const before = await own.boundingBox();
  release();
  await expect(own).toContainText("1 lineup · 0/1 checked");
  const after = await own.boundingBox();
  expect(Math.abs(before!.height - after!.height)).toBeLessThanOrEqual(1);
  await expect(own.locator('[data-reward="cash:USD"] dd').last()).toHaveText("—");
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
  const own = page.getByRole("region", { name: "You GW rewards" }), sofix = page.getByRole("region", { name: "Sofix GW rewards" });
  await expect(own).toContainText("1 lineup · 1/1 checked");
  await expect(own.locator('[data-reward="cash:USD"] dd').first()).toHaveText("—");
  await expect(own.locator('[data-reward="cash:USD"] dd').last()).toHaveText("$2.50");
  await expect(sofix.locator('[data-reward="cash:USD"] dd').last()).toHaveText("$5.00");
  await expect(sofix).toContainText(`${original.lineups.length}/${original.lineups.length} checked`);
  const line = original.lineups[0]!;
  await expect(sofix.locator(`[data-reward="essence:${line.rarity}:${line.kind ?? "unknown"}"] dd`).last()).toHaveText("0");
});
