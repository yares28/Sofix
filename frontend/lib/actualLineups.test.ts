import { expect, it } from "vitest";
import { actualSide, readActualGame, sameTeam } from "./actualLineups";
import type { LineupMatch, LineupSide } from "./lineups";
import recorded from "./fixtures/actual-lineup-response.json";
const player = (n: number) => ({ slug: `p-${n}`, displayName: `Player ${n}`, position: n === 0 ? "Goalkeeper" : "Defender" });
const formation = () => ({ startingLineupAvailable: true, startingLineup: [[player(0)], Array.from({length: 4}, (_,i)=>player(i+1)), Array.from({length: 4}, (_,i)=>player(i+5)), [player(9),player(10)]], bench: [player(11)] });
const match = { id: 1, kickoff: "2026-10-10T19:00:00Z", home: {name: "Real Madrid", club: "RMA"}, away: {name: "Villarreal", club: "VIL"} } as LineupMatch;
const game = () => { const away=formation(); for(const row of [...away.startingLineup,away.bench])for(const p of row)p.slug=`away-${p.slug}`; return { id: "Game:51889f90-24a2-44dd-8f6e-7933a36736e0", date: match.kickoff, homeTeam: {slug:"real-madrid-madrid",name:"Real Madrid CF"}, awayTeam:{slug:"villarreal-villarreal",name:"Villarreal CF"}, homeFormation:formation(),awayFormation:away }; };
it("accepts the credential-free real Sorare response and preserves its rows independently of fantasy positions",()=>{
  const actual=readActualGame(recorded,match,"2026-10-11T00:00:00Z")!;
  expect(actual.home.state).toBe("announced");expect(actual.away.state).toBe("announced");
  expect(actual.home.rows.flatMap(r=>r.players)).toHaveLength(11);
  expect(actual.away.rows.flatMap(r=>r.players)).toHaveLength(11);
  expect(actual.home.bench).toHaveLength(11);expect(actual.away.bench).toHaveLength(12);
  expect(actual.home.formation).toBe("4-2-3-1");
});
it("reads the exact game's announced XI and bench, preserving source identity and shape",()=>{
  const actual=readActualGame(game(),match,"2026-10-10T18:01:00Z");
  expect(actual?.home.state).toBe("announced");
  const side=actualSide(match.home, actual?.home, {});
  expect(side.rows.map(r=>r.players.length)).toEqual([2,4,4,1]);
  expect(side.formation).toBe("4-4-2");
  expect(side.rows.at(-1)?.players[0]).toMatchObject({id:"so:p-0",p:null,actual:"starter"});
  expect(side.alternatives[0]).toMatchObject({actual:"bench"});
});
it("never substitutes a predicted XI for an unannounced, partial or malformed official XI",()=>{
  const g=game(); g.homeFormation.startingLineupAvailable=false;
  expect(readActualGame(g,match,"")?.home.state).toBe("unannounced");
  g.homeFormation.startingLineupAvailable=true; g.homeFormation.startingLineup[1]!.pop();
  expect(readActualGame(g,match,"")?.home.state).toBe("incomplete");
  const predicted={...match.home,rows:[{line:"GK",players:[{id:"guess",name:"Guess",p:1}]}]} as LineupSide;
  expect(actualSide(predicted,undefined,{}).rows).toEqual([]);
});
it("rejects another kickoff, reversed teams, duplicate or cross-team players, and identifies source errors separately",()=>{
  expect(readActualGame({...game(),date:"2026-10-11T19:00:00Z"},match,"")).toBeNull();
  expect(readActualGame(game(),{...match,home:match.away,away:match.home},"")).toBeNull();
  const g=game(); g.homeFormation.startingLineup[1]![0]=player(0);
  expect(readActualGame(g,match,"")?.home.state).toBe("incomplete");
  expect(sameTeam({name:"Athletic Bilbao",slug:"athletic-club-bilbao"},{name:"Athletic Club",club:"ATH"} as LineupSide)).toBe(true);
});
