import { expect, test } from "@playwright/test";
import { MOCK, resetBackend, servedGrid } from "./helpers";
import { seasonWeeks } from "../lib/weeks";
import type { Sorare } from "../lib/play";

test("European boards retain all 36 clubs, league-phase places and cold team links", async ({page,context}) => {
  await page.goto("/difficulty?league=CL");
  await expect(page.locator("#grid table tbody tr")).toHaveCount(36);
  await page.getByLabel("Competition",{exact:true}).selectOption("EL");
  await expect(page).toHaveURL(/league=EL/);
  await expect(page.locator("#grid table tbody tr")).toHaveCount(36);
  const date=new URL(page.url()).searchParams.get("w");
  await page.reload();
  await page.getByRole("link",{name:"Table",exact:true}).first().click();
  await expect(page.locator(".lt-table tbody tr")).toHaveCount(36);
  await expect(page.locator("#table-title")).toContainText("Europa League league phase");
  await expect(page.locator(".st-hero")).toContainText("league phase");
  await expect(page.locator(".st-races")).toContainText("Top eight");
  await expect(page.locator(".st-races")).not.toContainText("Going down");
  await expect(page.getByRole("button",{name:"Predicted",exact:true})).toHaveCount(0);
  await page.getByRole("button",{name:"Expected",exact:true}).click();
  await expect(page.locator(".lt-table thead")).toContainText("Top 8");
  await expect(page.locator(".zone-key")).toContainText("Knockout play-off");
  const href=await page.locator(".club-link").first().getAttribute("href");
  const detail=await context.newPage(); await detail.goto(href!); await page.close();
  await expect(detail.locator(".team-hero")).toContainText("Europa League");
  expect(new URL(detail.url()).searchParams.get("w")).toBe(date);
  await detail.reload(); await expect(detail.locator(".team-hero")).toContainText("Europa League");
});

test("all European squads survive cold player bookmarks and unknown positions have no xScore",async({page,request,context})=>{
  await resetBackend(request);
  const data=(await(await request.get(`${MOCK}/api/sorare`)).json()).data as Sorare;
  const week=data.timeline.find(w=>w.id===data.nextId)!;
  const selected=seasonWeeks(await servedGrid(request),data,new Date()).find(w=>w.gw===week.id)!;
  const blocks=Object.fromEntries(["CL","EL"].map(code=>[code,{competition:code,weekId:week.id,week:week.slug,generatedAt:new Date().toISOString(),complete:true,modelVersion:`${code}:xscore-v3`,market:Array.from({length:36},(_,i)=>({slug:`${code.toLowerCase()}-player-${i}`,name:`${code} Player ${i}`,pos:i===0?"UNK":"DEF",club:`${code} Club ${i}`,crest:null,average:i===0?null:0,projection:null,eur:null,pic:"",...(i===0?{}:{by:"sofix",p:0,pStart:0,x:0,start:0,mu:0,fixture:{team:`${code} Club ${i}`,opponent:`${code} Opponent`,opponentCrest:null,venue:"H",kickoff:week.start}})}))}]));
  await request.post(`${MOCK}/__test/my-weeks`,{data:{foreignBlocks:blocks}});
  await page.goto(`/players?league=CL&w=${selected.id}`);
  await expect(page.locator(".s5-bars")).toContainText("36 Champions League players");
  await page.getByLabel("Competition",{exact:true}).selectOption("EL");
  await expect(page.locator(".s5-bars")).toContainText("36 Europa League players");
  await page.getByRole("searchbox",{name:"Search a player or a club"}).fill("EL Player 0");
  const unknown=page.locator("article").filter({has:page.getByRole("link",{name:"EL Player 0",exact:true})});
  await expect(unknown).toContainText("Position TBC");
  await expect(unknown.locator(".s5-stat").filter({hasText:"xScore"}).locator("b")).toHaveText(/^[\u2014-]$/);
  const detail=await context.newPage();await detail.goto(`/players/el-player-1?w=${selected.id}`);await page.close();
  await expect(detail.getByRole("heading",{name:"EL Player 1",exact:true})).toBeVisible();
  await expect(detail.locator(".pd-x")).toHaveText("0");
  await detail.reload();await expect(detail.locator(".pd-x")).toHaveText("0");
  await detail.getByRole("button",{name:"Search players"}).click();
  await detail.getByRole("combobox",{name:"Player name"}).fill("CL Player 0");
  await expect(detail.getByRole("option",{name:/CL Player 0/})).toBeVisible();
});


test("Conference is available provisionally with six rounds and cold player links", async ({page,request,context}) => {
 await resetBackend(request);
 await page.goto("/difficulty?league=CONF");
 await expect(page.getByRole("note")).toContainText("provisional");
 await expect(page.locator(".footnote:not(.attribution)")).not.toContainText("Validated European model");
 await expect(page.locator("#grid table tbody tr")).toHaveCount(36);
 await page.getByRole("link", {name:"Table",exact:true}).first().click();
 await expect(page.locator(".lt-table tbody tr")).toHaveCount(36);
 await expect(page.locator("#table-title")).toContainText("Conference League league phase");
 const data=(await(await request.get(`${MOCK}/api/sorare`)).json()).data as Sorare;
 const week=data.timeline.find(w=>w.id===data.nextId)!;
 const selected=seasonWeeks(await servedGrid(request),data,new Date()).find(w=>w.gw===week.id)!;
 await request.post(`${MOCK}/__test/my-weeks`,{data:{foreignBlocks:{CONF:{competition:"CONF",weekId:week.id,week:week.slug,generatedAt:new Date().toISOString(),complete:true,modelVersion:"CONF:xscore-v3",market:[{slug:"conference-player",name:"Conference Player",pos:"DEF",club:"Conference Club",pic:"",crest:null,average:null,projection:null,eur:null,by:"sofix",p:0,pStart:0,x:0,start:0,mu:0,fixture:{team:"Conference Club",opponent:"Other Club",venue:"H",kickoff:week.start}}]}}}});
 await page.goto(`/players?league=CONF&w=${selected.id}`);
 await expect(page.getByRole("note")).toContainText("provisional");
 await expect(page.getByRole("link",{name:"Conference Player",exact:true})).toBeVisible();
 const detail=await context.newPage();await detail.goto(`/players/conference-player?w=${selected.id}`);await page.close();
 await expect(detail.getByRole("heading",{name:"Conference Player",exact:true})).toBeVisible();
 await expect(detail.locator(".pd-x")).toHaveText("0");
 await detail.reload();await expect(detail.locator(".pd-x")).toHaveText("0");
 await expect(detail.getByRole("note")).toContainText("provisional");
});
