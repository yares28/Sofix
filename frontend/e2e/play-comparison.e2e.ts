import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import { APP, offline, resetBackend, smallText, sorare } from "./helpers";
import { bestPlan, nextWeek } from "../lib/play";

test("the comparison reserves its cold-start geometry until the selected GW's saved entries arrive", async ({ page, request }) => {
  await resetBackend(request); await offline(page);
  await page.setViewportSize({ width: 390, height: 844 });
  const week=nextWeek(sorare), lineup=bestPlan(week.plans)!.lineups[0]!;
  let release!: () => void;
  const held=new Promise<void>(resolve=>{release=resolve;});
  await page.route("**/api/my-week",async route=>{
    await held;
    await route.fulfill({status:200,contentType:"application/json",body:JSON.stringify({weeks:[],snapshots:[{slug:week.gameweek.slug,number:week.gameweek.number,start:week.gameweek.start,end:week.gameweek.end,savedAt:new Date().toISOString(),lineups:[{id:"saved",name:"Saved team",board:lineup.board,competition:lineup.comp,draft:false,confirmable:false,result:null,cards:[...lineup.starters,...lineup.subs].map((c,index)=>({slug:c.slug,player:c.player,name:c.name,rarity:c.rarity,picture:c.pic,score:null,captain:!!c.captain,index}))}]}],pending:[]})});
  });
  await page.goto(`/play?gw=${week.gameweek.id}`);
  await expect(page.locator(".pc-you")).toHaveAttribute("aria-busy","true");
  const loading=await page.locator(".pc-hero").boundingBox();
  release();
  await expect(page.locator(".pc-you")).toContainText("1 entered");
  const ready=await page.locator(".pc-hero").boundingBox();
  expect(Math.abs(loading!.height-ready!.height)).toBeLessThanOrEqual(1);
  expect(Math.abs(loading!.y-ready!.y)).toBeLessThanOrEqual(1);
});

test("Play compares the same entered forecasts with Sofix without a second lineup read, retaining drafts and the exact GW", async ({ page, request, context }) => {
  await resetBackend(request); await offline(page);
  const week=nextWeek(sorare), plan=bestPlan(week.plans)!, lineup=plan.lineups[0]!;
  const entry={ id:"actual", name:"Entered team", board:lineup.board, competition:lineup.comp, draft:false, confirmable:false, result:null,
    cards:[...lineup.starters,...lineup.subs].map((c,index)=>({slug:c.slug,player:c.player,name:c.name,rarity:c.rarity,picture:c.pic,score:null,captain:!!c.captain,index})) };
  const saved={slug:week.gameweek.slug,number:week.gameweek.number,start:week.gameweek.start,end:week.gameweek.end,savedAt:new Date().toISOString(),lineups:[entry,{...entry,id:"draft",draft:true}]};
  await context.route("**/api/my-week",route=>route.fulfill({status:200,contentType:"application/json",body:JSON.stringify({weeks:[],snapshots:[saved],pending:[]})}));
  let reads=0; page.on("request",r=>{if(new URL(r.url()).pathname==="/api/my-week"&&r.method()==="GET")reads++;});
  await page.goto(`/play?gw=${week.gameweek.id}`);
  const hero=page.getByRole("region",{name:"Your lineups compared with Sofix",exact:true});
  await expect(hero).toBeVisible();
  const yours=hero.getByRole("region",{name:"You lineup forecast",exact:true});
  await expect(yours).toContainText("1 entered");
  await expect(yours.locator(".pc-points strong")).toHaveText(String(Math.round(lineup.x)));
  await expect(yours.locator(".pc-risk strong")).toHaveText(`${Math.round((1-lineup.pReturn)*100)}%`);
  await expect(page.locator(".pl-entered-lineup")).toHaveCount(2);
  expect(reads).toBe(1);
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: 900 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
    expect(await smallText(page, width === 390 ? 10 : 11)).toEqual([]);
  }
  expect((await new AxeBuilder({ page }).include(".pc-hero").withTags(["wcag2a", "wcag2aa", "wcag21aa"]).analyze()).violations).toEqual([]);

  const selected=await page.locator('.wk-strip [aria-checked="true"]').getAttribute("aria-label");
  await page.close();
  const reopened=await context.newPage(); await offline(reopened);
  await reopened.goto(`${APP}/play?gw=${week.gameweek.id}`);
  await expect(reopened.locator(".pc-you")).toContainText("1 entered");
  await expect(reopened.locator('.wk-strip [aria-checked="true"]')).toHaveAttribute("aria-label",selected!);
  await reopened.getByRole("link",{name:"Other plans & strategies",exact:true}).click();
  await expect(reopened).toHaveURL(/view=plans/);
  await reopened.getByRole("link",{name:"Recommended plan",exact:true}).click();
  await expect(reopened.locator(".pc-you")).toContainText("1 entered");
  expect(new URL(reopened.url()).searchParams.get("gw")).toBe(week.gameweek.id);
  // A different selected GW cannot retain the previous owner's figures or entries.
  const other=sorare.timeline.find(w=>w.id!==week.gameweek.id)!;
  await reopened.goto(`${APP}/play?gw=${other.id}`);
  await expect(reopened.locator(".pl-entered-lineup")).toHaveCount(0);
  await expect(reopened.locator(".pc-you")).not.toContainText("1 entered");
});
