import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import { APP, MOCK, offline, resetBackend, smallText, sorare } from "./helpers";
import { rewardSignature } from "../lib/playRewards";
import { bestPlan, nextWeek } from "../lib/play";

test("all eight entered forecasts survive a legacy snapshot, and projected rewards use attainable prizes without zero winnings",async({page,request,context})=>{
  await resetBackend(request);await offline(page);
  const data=structuredClone(sorare),week=nextWeek(data),base=week.plans[0]!.lineups[0]!;
  week.gameweek.lock=new Date(Date.now()-3600000).toISOString();
  for(const plan of week.plans)for(const l of plan.lineups){l.tiers=[{need:0,p:.75,essence:250},{need:10000,p:.25,cash:5}];l.kind="laliga";l.rarity="limited";}
  const pro={...structuredClone(base),x:200,board:"pro-step",pro:{level:1,target:360,boost:1,ladder:[]},need:360,tiers:[{need:0,p:.9,essence:250},{need:360,p:.1,cash:5}],subs:[],bonuses:{season:.05,grade:.01,scarcity:{}}};
  week.plans[0]!.lineups.push(pro);
  const frozen={...structuredClone(week),plans:[{...week.plans[0]!,lineups:[structuredClone(base)]}]};
  const lineups=Array.from({length:8},(_,i)=>{const l=i<6?base:pro;return{id:`entry-${i}`,name:`Entered ${i+1}`,board:l.board,competition:i<6?l.comp:"Pro",pro:i<6?undefined:{level:1,target:360},draft:false,confirmable:false,result:i<6?{score:300,rank:null,cash:0,essence:0,card:false}:null,cards:[...l.starters,...l.subs].map((c,index)=>({slug:c.slug,player:c.player,name:c.name,rarity:c.rarity,picture:c.pic,score:null,captain:!!c.captain,index}))};});
  await request.post(`${MOCK}/__test/my-weeks`,{data:{sorareData:data,livePlan:frozen,playRewards:{slug:week.gameweek.slug,state:"checked",you:lineups.map(l=>({id:l.id,rewards:{}})),sofix:[]}}});
  await context.route("**/api/my-week",route=>route.fulfill({status:200,contentType:"application/json",body:JSON.stringify({weeks:[],snapshots:[{slug:week.gameweek.slug,savedAt:new Date().toISOString(),lineups}],pending:[]})}));
  await page.goto(`/play?gw=${week.gameweek.id}`);
  const yours=page.locator('.pc-you');await expect(yours).toContainText("8 entered");
  await expect(yours.locator('.pc-potential strong')).not.toHaveText("—");await expect(yours.locator('.pc-potential strong small')).toHaveText('/8');
  await expect(yours.locator('.pc-risk strong')).toContainText('%');
  // locked: the points so far lead (six lineups scored 300), the projection stays beneath
  await expect(yours.locator('.pc-points strong')).toHaveText("300");await expect(yours.locator('.pc-points')).toContainText("pts / lineup so far");
  await expect(yours.locator('.pc-points')).toContainText("6/8 lineups");await expect(yours.locator('.pc-points small').last()).toHaveText(/^\d+ projected$/);
  const rewards=yours.locator('.pc-rewards');
  await expect(rewards).not.toContainText('≥');await expect(rewards.locator('[data-reward="cash:USD"]')).toHaveCount(0);
  await expect(rewards.locator('[data-reward="card"]')).toHaveCount(0);
  await expect(rewards.locator('[data-reward="essence:limited:laliga"] dd').first()).toContainText('2,000');
  await expect(rewards.locator('dd').filter({hasText:/^0$/})).toHaveCount(0);
  const options=page.getByRole('button',{name:'You other prize possibilities',exact:true});
  await options.focus();const tip=page.getByRole('dialog',{name:'You other prize possibilities',exact:true});
  await expect(tip).toContainText('$5.00');await expect(tip).toContainText('25%');
  await expect(tip).not.toContainText('$0.21');await page.keyboard.press('Escape');await expect(tip).toHaveCount(0);
  await page.setViewportSize({width:390,height:844});await options.click();await expect(tip).toBeVisible();
  await expect(tip.getByRole('combobox',{name:'Lineup',exact:true})).toBeFocused();
  const box=await tip.boundingBox();expect(box!.x).toBeGreaterThanOrEqual(0);expect(box!.x+box!.width).toBeLessThanOrEqual(await page.evaluate(()=>document.documentElement.clientWidth));
  await page.keyboard.press('Escape');await expect(options).toBeFocused();await page.reload();await expect(yours.locator('.pc-potential strong small')).toHaveText('/8');
});

test("Play shows every projected and actual reward type and removes the two unwanted explanations",async({page,request,context})=>{
  await resetBackend(request);await offline(page);
  const week=nextWeek(sorare),plan=bestPlan(week.plans)!,line=plan.lineups[0]!;
  const unit=`essence:${line.rarity}:${line.kind??"unknown"}`;
  await request.post(`${MOCK}/__test/my-weeks`,{data:{playRewards:{slug:week.gameweek.slug,state:"checked",checkedAt:new Date().toISOString(),you:[{id:"actual",rewards:{"cash:USD":2.5,[unit]:100,"card:rare":1,"xp:LIMITED_XP":500}}],sofix:plan.lineups.map((l,i)=>({signature:rewardSignature(l),rewards:i?{}:{"cash:USD":5,[unit]:50,"card:rare":1,"xp:LIMITED_XP":200}}))}}});
  const saved={slug:week.gameweek.slug,number:week.gameweek.number,start:week.gameweek.start,end:week.gameweek.end,savedAt:new Date().toISOString(),lineups:[{id:"actual",name:"Actual",board:line.board,competition:line.comp,draft:false,confirmable:false,result:null,cards:[...line.starters,...line.subs].map((c,index)=>({slug:c.slug,player:c.player,name:c.name,rarity:c.rarity,picture:c.pic,score:null,captain:!!c.captain,index}))}]};
  await context.route("**/api/my-week",route=>route.fulfill({status:200,contentType:"application/json",body:JSON.stringify({weeks:[],snapshots:[saved],pending:[]})}));
  await page.goto(`/play?gw=${week.gameweek.id}`);
  const yours=page.getByRole("region",{name:"You projected and actual rewards",exact:true}),sofix=page.getByRole("region",{name:"Sofix projected and actual rewards",exact:true});
  await expect(yours.locator('[data-reward="cash:USD"] dd').last()).toHaveText("$2.50");
  await expect(yours.locator('[data-reward="card"] dd').last()).toHaveText("1");
  await expect(yours.locator('[data-reward="xp:FOOTBALL_XP"] dd').last()).toHaveText("500");
  await expect(yours.locator(`[data-reward="${unit}"] dd`).last()).toHaveText("100");
  await expect(sofix.locator('[data-reward="cash:USD"] dd').last()).toHaveText("$5.00");
  await expect(sofix.locator('[data-reward="xp:FOOTBALL_XP"] dd').last()).toHaveText("200");
  await expect(sofix).toContainText("Would have won");
  await expect(page.locator(".pc-verdict")).toHaveCount(0);
  await expect(page.getByText("How subs and plans work",{exact:true})).toHaveCount(0);
  for(const width of [1440,390]) {await page.setViewportSize({width,height:900});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=document.documentElement.clientWidth)).toBe(true);expect(await smallText(page,width===390?10:11)).toEqual([]);}
  expect((await new AxeBuilder({page}).include(".pc-hero").analyze()).violations).toEqual([]);
  await page.reload();await expect(yours.locator('[data-reward="cash:USD"] dd').last()).toHaveText("$2.50");
  const other=sorare.timeline.find(w=>w.id!==week.gameweek.id)!;await page.goto(`/play?gw=${other.id}`);
  await expect(page.locator(".pc-you .pc-rewards")).not.toContainText("$2.50");
});

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
    const yourRewards=await page.locator(".pc-you .pc-rewards").boundingBox(),sofixRewards=await page.locator(".pc-sofix .pc-rewards").boundingBox();
    expect(Math.abs(yourRewards!.y-sofixRewards!.y)).toBeLessThanOrEqual(1);
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
