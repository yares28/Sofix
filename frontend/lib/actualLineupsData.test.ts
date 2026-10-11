import { beforeEach,expect,it,vi } from "vitest";
vi.mock("./cache",()=>({cache:(fn:unknown)=>fn}));
import {loadActualLineup,FORMATION_QUERY,INDEX_QUERY} from "./actualLineupsData";
import type {LineupMatch} from "./lineups";
const match={competition:"laliga",kickoff:"2026-10-10T19:00:00Z",home:{name:"Real Madrid",club:"RMA"},away:{name:"Villarreal",club:"VIL"}} as LineupMatch;
const game={id:"Game:51889f90-24a2-44dd-8f6e-7933a36736e0",date:match.kickoff,homeTeam:{name:"Real Madrid",slug:"real-madrid-madrid"},awayTeam:{name:"Villarreal CF",slug:"villarreal-villarreal"}};
const formation={startingLineupAvailable:false,startingLineup:[],bench:[]};
const fetchMock=vi.fn<typeof fetch>(); beforeEach(()=>{fetchMock.mockReset();vi.stubGlobal("fetch",fetchMock);});
it("automatically resolves a match with no owned players, and never requires a Sorare tab or authentication",async()=>{
  fetchMock.mockResolvedValueOnce(Response.json({data:{football:{competition:{futureGames:{nodes:[{id:"TBC",homeTeam:null,awayTeam:null}]},pastGames:{nodes:[game]}}}}}));
  fetchMock.mockResolvedValueOnce(Response.json({data:{anyGame:{...game,homeFormation:formation,awayFormation:formation}}}));
  expect(await loadActualLineup(match)).toMatchObject({state:"ready",data:{home:{state:"unannounced"},away:{state:"unannounced"}}});
  const calls=fetchMock.mock.calls;
  expect(calls).toHaveLength(2);expect(JSON.parse(String(calls[0]![1]!.body))).toEqual({query:INDEX_QUERY,variables:{slug:"laliga-es"}});
  expect(JSON.parse(String(calls[1]![1]!.body))).toEqual({query:FORMATION_QUERY,variables:{id:game.id}});
  expect(calls[1]![1]!.next?.revalidate).toBe(60);
  expect(calls[1]![1]!.headers).toEqual({"content-type":"application/json"});
});
it("keeps source rejection and rate limits separate from not-announced and never retries automatically",async()=>{
  fetchMock.mockResolvedValueOnce(Response.json({errors:[{message:"rejected"}]}));
  expect(await loadActualLineup(match)).toEqual({state:"unavailable"});expect(fetchMock).toHaveBeenCalledTimes(1);
  fetchMock.mockReset().mockResolvedValueOnce(new Response("",{status:429}));
  expect(await loadActualLineup(match)).toEqual({state:"rate-limited"});expect(fetchMock).toHaveBeenCalledTimes(1);
});
it("does not query formations for ambiguous, reversed or moved fixtures",async()=>{
  fetchMock.mockResolvedValueOnce(Response.json({data:{football:{competition:{futureGames:{nodes:[{...game,homeTeam:game.awayTeam,awayTeam:game.homeTeam}]},pastGames:{nodes:[]}}}}}));
  expect(await loadActualLineup(match)).toEqual({state:"unmatched"});expect(fetchMock).toHaveBeenCalledTimes(1);
});
