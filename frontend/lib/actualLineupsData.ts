import { z } from "zod";
import { cache } from "./cache";
import { GameIdentity, readActualGame, sameGame, type ActualRead } from "./actualLineups";
import type { LineupMatch } from "./lineups";

const API="https://api.sorare.com/graphql";
const COMPETITIONS:Record<string,string>={laliga:"laliga-es",champions:"uefa-champions-league", "europa-league":"uefa-europa-league", "copa-del-rey":"copa-del-rey",supercopa:"supercopa-de-espana"};
export const INDEX_QUERY=`query ActualGames($slug:String!){football{competition(slug:$slug){
  futureGames(first:20){nodes{id date homeTeam{slug name} awayTeam{slug name}}}
  pastGames(first:20){nodes{id date homeTeam{slug name} awayTeam{slug name}}}
}}}`;
export const FORMATION_QUERY=`query ActualLineup($id:ID!){anyGame(id:$id){... on Game{
  id date homeTeam{slug name} awayTeam{slug name}
  homeFormation{startingLineupAvailable startingLineup{slug displayName position} bench{slug displayName position}}
  awayFormation{startingLineupAvailable startingLineup{slug displayName position} bench{slug displayName position}}
}}}`;
class Limited extends Error {}
async function query(query:string,variables:Record<string,string>,seconds:number):Promise<unknown>{
  const response=await fetch(API,{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({query,variables}),
    next:{revalidate:seconds},cache:"force-cache",signal:AbortSignal.timeout(8000)});
  if(response.status===429)throw new Limited();
  if(!response.ok)throw new Error("Source unavailable");
  const body=await response.json() as {errors?:unknown;data?:unknown};
  if(body.errors)throw new Error("Source query failed");
  return body.data;
}
const Index=z.object({football:z.object({competition:z.object({futureGames:z.object({nodes:z.array(z.unknown())}),pastGames:z.object({nodes:z.array(z.unknown())})})})});
const readIndex=cache(async(slug:string)=>Index.parse(await query(INDEX_QUERY,{slug},3600)),["actual-games-v1"],{revalidate:3600});
// One minute around announcement: an hour-long negative cache would hide a newly announced XI.
// No polling, auth, extension or extra page visits. Reads happen on selection/navigation or return to the page.
export async function loadActualLineup(match:LineupMatch):Promise<ActualRead>{
  const slug=COMPETITIONS[match.competition]; if(!slug||!match.kickoff)return {state:"unmatched"};
  try{
    const c=(await readIndex(slug)).football.competition;
    const identities=[...c.futureGames.nodes,...c.pastGames.nodes].flatMap(value=>{const parsed=GameIdentity.safeParse(value);return parsed.success?[parsed.data]:[];});
    const games=[...new Map(identities.map(g=>[g.id,g])).values()].filter(g=>sameGame(g,match));
    if(games.length!==1)return {state:"unmatched"};
    const body=await query(FORMATION_QUERY,{id:games[0]!.id},60) as {anyGame?:unknown};
    const data=readActualGame(body.anyGame,match,new Date().toISOString());
    return data?{state:"ready",data}:{state:"unavailable"};
  }catch(error){return {state:error instanceof Limited?"rate-limited":"unavailable"};}
}
