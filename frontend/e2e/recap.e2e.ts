import { expect, test } from "@playwright/test";
import { currentWeek, seasonWeeks } from "../lib/weeks";
import type { GameweekPlan, PlayingPlayer, Sorare } from "../lib/play";
import { APP, MOCK, offline, resetBackend, servedGrid } from "./helpers";
import { E2E_REVALIDATE_SECRET } from "./constants";
import type { SavedWeek } from "../lib/myWeeks";
import { missionDay, type MissionRow } from "../lib/missions";
import { nextDay } from "../lib/missionLog";

test("Recap and Play keep the current GW, compare all entered and best-plan lineups, and retain custom estimates", async ({ page, request, context }) => {
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
  const snapshots = new Map<string, SavedWeek>();
  await context.route("**/api/my-week", async route => {
    if (route.request().method() === "POST") {
      const body = route.request().postDataJSON();
      const week = data.timeline.find(w => w.slug === body.slug)!;
      snapshots.set(body.slug, { ...week, savedAt: new Date().toISOString(), lineups: body.lineups });
      return route.fulfill({ json: { ok: true, archived: false } });
    }
    return route.fulfill({ json: { weeks: [], pending: [], snapshots: [...snapshots.values()] } });
  });
  const lineup = best.lineups[0]!;
  await page.addInitScript(({ slug, lineup }) => {
    const root = globalThis as typeof globalThis & { chrome?: { runtime?: { sendMessage?: (id: string, message: Record<string, unknown>, reply: (value: unknown) => void) => void } } };
    root.chrome ??= {}; root.chrome.runtime ??= {};
    root.chrome.runtime.sendMessage = (_id, message, reply) => {
      if (message.type === "ping") return reply({ ok: true, version: "0.3.14", sorareUser: "e2e-manager", appReachable: true });
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
  await expect(page.getByRole("radio", { name: new RegExp(`Sorare GW${info.number},`), checked: true })).toBeVisible();
  const mine = page.getByRole("region", { name: "Your Sorare lineups", exact: true });
  await expect(mine.locator(".pl-entered-lineup")).toHaveCount(2);
  await expect(mine.locator(".rc-lu")).toHaveCount(2);
  await expect(mine.locator(".rc-team")).toHaveCount(2);
  await expect(mine.locator(".rc-score-pair")).toHaveCount(2);
  await expect(mine.locator(".pl-entered-expected b").first()).toHaveText(String(Math.round(lineup.x)));
  await expect(mine.locator(".pl-entered-expected").last()).toContainText("xScore estimate");
  await expect(mine.locator(".pl-entered-result b").first()).toHaveText("0");
  await expect(mine.locator(".pl-entered-result b").last()).toHaveText("313");
  await expect(mine).toContainText("Latest lineups saved in Sofix");
  // Sorare's 0 before the games is not a score: the hexagon says "-", and the card's xScore has its own hexagon beside it.
  const first = mine.locator(".pl-entered-lineup").first();
  await expect(first.locator(".rc-hex").first()).toHaveText("-");
  await expect(first.locator(".rc-xs").first()).toHaveText(String(Math.round(lineup.starters[0]!.x)));
  const plan = page.getByRole("region", { name: "Best Sofix plan" });
  await expect(plan.locator(".rc-lu").first().locator(".rc-xs").first()).toHaveText(String(Math.round(lineup.starters[0]!.x)));
  await expect(plan.locator(".rc-lu")).toHaveCount(best.lineups.length);
  await expect(plan).toContainText("500 expected essence");
  await expect(plan.locator(".rc-score-pair").first()).toContainText("Actual0");
  // A row is the cards, three scores and one reward chance; the rest opens from its info button and closes on Escape.
  await expect(plan.locator(".rc-score-pair .rc-xd").first()).toContainText("xD");
  await expect(plan.locator(".rc-any b").first()).toHaveText(/%$/);
  const panel = plan.locator(".rc-info").first();
  await expect(panel).toBeHidden();
  await plan.getByRole("button", { name: /^All reward chances/ }).first().click();
  await expect(panel).toBeVisible();
  await expect(panel).toContainText("Expected range");
  await expect(panel).toContainText("managers");
  await expect(panel.locator("tbody tr")).toHaveCount(best.lineups[0]!.tiers.length);
  await page.keyboard.press("Escape");
  await expect(panel).toBeHidden();
  await expect(plan.locator(".rc-rest")).toHaveCount(0);
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: 900 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
    await page.screenshot({ path: `../output/playwright/recap-comparison-${width}.png`, fullPage: true });
  }

  await page.goto("/play");
  await expect(page.getByRole("heading", { name: "Recommended plan", exact: true })).toBeVisible();
  await expect(page.locator(".pl-board-note")).toContainText("Highest expected essence");
  await expect(page.getByRole("navigation", { name: "Plan", exact: true })).toHaveCount(0);
  await expect(page.locator(".pl-board .pl-lu")).toHaveCount(best.lineups.length);
  await expect(mine.locator(".pl-entered-expected").last()).toContainText("xScore estimate");
  expect(await mine.evaluate(node => Boolean(document.querySelector(".pl-board")!.compareDocumentPosition(node) & Node.DOCUMENT_POSITION_FOLLOWING))).toBe(false);
  await page.reload();
  await expect(mine.locator(".pl-entered-lineup")).toHaveCount(2);
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: 900 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
    await mine.screenshot({ path: `../output/playwright/play-entered-${width}.png` });
  }
  await page.goto("/play?plan=1");
  await expect(page.locator(".pl-board-note")).toContainText("Plan 1");
  await page.getByRole("link", { name: "Recommended plan", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Recommended plan", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Next gameweek", exact: true }).click();
  await expect(mine.locator(".pl-entered-lineup")).toHaveCount(0);
  await expect(mine).not.toContainText("Custom captain");
  await page.goto("/difficulty");
  await expect(page.locator('.wk-chip[aria-checked="true"]')).toHaveAttribute("aria-label", new RegExp(`Sorare GW${info.number}\\b`));
  await expect(page.getByRole("heading", { name: "Your week", exact: true })).toBeVisible();

  // A cold device has no browser cache and no signed-in Sorare tab: server snapshots still render both teams.
  await page.evaluate(() => localStorage.clear());
  await page.close();
  const reopened = await context.newPage();
  await offline(reopened);
  const selected = seasonWeeks(await servedGrid(request), data, new Date()).find(w => w.gw === info.id)!;
  await reopened.goto(`/play?w=${selected.id}`);
  await expect(reopened.locator(".pl-entered-lineup")).toHaveCount(2);
  await expect(reopened.locator(".pl-entered")).toContainText("Latest lineups saved in Sofix");
  await expect(reopened.locator(".pl-entered")).toContainText("showing your last saved read");
  await reopened.goto(`/?w=${selected.id}`);
  await expect(reopened.locator(".rc-entered .pl-entered-lineup")).toHaveCount(2);
});

test("Recap keeps loaded mission picks and their chances after kickoff, reload and navigation", async ({ page, request }) => {
  await resetBackend(request);
  await offline(page);
  const now = new Date();
  const day = missionDay(now);
  const captured = new Date(`${day}T08:00:00Z`);
  const player: PlayingPlayer = { player: "saved-mission-player", name: "Saved mission player", pos: "MID", avatar: "", pic: "", crest: null, rarity: "limited", club: null, inSeason: true, cards: 1, p: 1, x: 50, average: 50,
    games: [{ id: "captured-mission-game", kickoff: new Date(captured.getTime() + 60_000).toISOString(), competition: "laliga-es", opponent: "Betis", opponentCrest: null, venue: "H" }] };
  const task: MissionRow = { id: "loaded-source-task", title: "Decisive Picker", description: "Positive decisive action", mode: "DECISIVE", picks: 1, made: 0, period: "DAILY", state: "READY" };
  const sheet = { pos: player.pos, team: "x", starts: 20, seasonStarts: 20, season: {}, l10: {}, last: [], decAll: 0.8, cs: 0, pens: 0 };
  const entry = nextDay(undefined, [task], [player], { [player.player!]: sheet }, "limited", captured);
  expect(entry.missions[0]!.sofix).toEqual([player.player]);
  await request.post(`${MOCK}/__test/my-weeks`, { data: {
    missionSource: { limited: { missions: [task], seen_at: captured.toISOString(), verified: true } },
    missionPool: { generatedAt: now.toISOString(), players: [], sheets: { asOf: now.toISOString(), players: {} }, complete: true },
    missionLog: [{ days: { [day]: { limited: entry } } }],
  } });
  await request.post(`${APP}/api/revalidate`, { headers: { authorization: `Bearer ${E2E_REVALIDATE_SECRET}` } });
  await page.goto("/");
  const missions = page.getByRole("region", { name: "Missions", exact: true });
  await expect(missions.getByRole("link", { name: player.name, exact: true })).toBeVisible();
  await expect(missions).toContainText("80%");
  await page.reload();
  await expect(missions.getByRole("link", { name: player.name, exact: true })).toBeVisible();
  await page.goto("/missions");
  await expect(page.locator(".mx-picks")).toContainText(player.name);
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: 900 });
    expect(await page.locator(".mx-picks .mx-cv").evaluateAll(nodes => nodes.every(node => node.scrollWidth <= node.clientWidth))).toBe(true);
  }
  await page.goto("/");
  await expect(missions).toContainText("80%");
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: 900 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
    await missions.screenshot({ path: `../output/playwright/recap-locked-missions-${width}.png` });
  }
});

test("a saved custom estimate survives closed Sorare tabs and follows the selected GW", async ({ page, request, context }) => {
  await resetBackend(request);
  await offline(page);
  const data = (await (await request.get(`${MOCK}/api/sorare`)).json()).data as Sorare;
  const info = data.timeline.find(w => Date.parse(w.end) < Date.now() - 86400_000 && !data.weeks.some(p => p.gameweek.id === w.id))!;
  const forecast = structuredClone(data.weeks.find(w => w.gameweek.id === data.nextId)!) as GameweekPlan;
  forecast.gameweek = { ...info, name: `Game Week ${info.number}` };
  const l = forecast.plans[0]!.lineups[0]!;
  // Production can retain the original forecast without bonus fields and a narrower finished replay.
  const replay = structuredClone(forecast);
  replay.plans = [replay.plans[0]!];
  replay.plans[0]!.lineups[0]!.clubBonus = null;
  replay.plans[0]!.lineups[0]!.averageBonus = null;
  data.weeks.push(replay);
  const saved = { slug: info.slug, number: info.number, start: info.start, end: info.end, savedAt: info.end,
    lineups: [{ id: "saved-custom", name: "Custom captain", board: l.board, competition: l.comp, draft: false, confirmable: false,
      scoring: { slots: [...l.starters, ...l.subs].map((c, i) => ({ positions: c.slot === "EXT" || c.slot === "OUT" ? ["DEF", "MID", "FWD"] : [c.pos], sub: i >= l.starters.length })), minInSeason: l.minInSeason, captain: l.captainBonus, season: 0.05, grade: 0.01, scarcity: {}, clubBonus: null, averageBonus: null },
      cards: [...l.starters, ...l.subs].map((c, index) => ({ slug: c.slug, player: c.player, name: c.name, picture: c.pic, rarity: c.rarity, captain: index === (l.starters.findIndex(c => c.captain) === 0 ? 1 : 0), index, score: 0 })),
      result: { score: 0, rank: 10, essence: 0, cash: 0, card: false } }] };
  // Real old snapshots have neither indices nor the new extension's scoring metadata.
  const legacySaved = JSON.parse(JSON.stringify(saved)) as typeof saved;
  legacySaved.lineups.forEach(lineup => {
    Reflect.deleteProperty(lineup, "scoring");
    lineup.cards.forEach(card => Reflect.deleteProperty(card, "index"));
  });
  await request.post(`${MOCK}/__test/my-weeks`, { data: { weeks: [legacySaved], frozenPlans: [], livePlan: forecast, sorareData: data } });
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
