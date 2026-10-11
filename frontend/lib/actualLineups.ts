import { z } from "zod";
import type { Line, LineupMatch, LineupPlayer, LineupSide, OwnedCard } from "./lineups";

const Player = z.object({slug:z.string().regex(/^[a-z0-9-]{1,160}$/),displayName:z.string().min(1),position:z.enum(["Goalkeeper","Defender","Midfielder","Forward"])});
const Formation = z.object({startingLineupAvailable:z.boolean(),startingLineup:z.array(z.array(Player)),bench:z.array(Player)});
const Team = z.object({slug:z.string(),name:z.string()});
export const GameIdentity = z.object({id:z.string().regex(/^Game:[0-9a-f-]{36}$/i),date:z.string(),homeTeam:Team,awayTeam:Team});
const Game = GameIdentity.extend({homeFormation:Formation,awayFormation:Formation});
export type ActualSide = {state:"announced"|"unannounced"|"incomplete";rows:LineupSide["rows"];bench:LineupPlayer[];formation:string};
export type ActualLineup = {game:string;readAt:string;home:ActualSide;away:ActualSide};
export type ActualRead = {state:"ready";data:ActualLineup}|{state:"unavailable"|"unmatched"|"rate-limited"};
const position:Record<string,Line>={Goalkeeper:"GK",Defender:"DEF",Midfielder:"MID",Forward:"FWD"};
const names:Record<string,string[]>={ATH:["Athletic Club","Athletic Bilbao"],ATL:["Atletico Madrid","Atletico de Madrid"],CEL:["Celta","Celta Vigo","RC Celta de Vigo"],DEP:["Deportivo","Deportivo La Coruna","RC Deportivo de La Coruna"],RMA:["Real Madrid"],RSO:["Real Sociedad"],OVI:["Real Oviedo","Oviedo"],SAN:["Racing Santander","Racing","Real Racing Club de Santander"],ALA:["Alaves","Deportivo Alaves"],ESP:["Espanyol","RCD Espanyol de Barcelona"],MLL:["Mallorca","RCD Mallorca"],RAY:["Rayo Vallecano"],BET:["Betis","Real Betis Balompie","Real Betis"],OSA:["Osasuna","CA Osasuna"]};
const key=(s:string)=>s.normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase().replace(/\b(fc|cf|rc|cd|ud|rcd|ca)\b/g,"").replace(/[^a-z0-9]/g,"");
/** Exact normalized name or a known club alias; no surname/substring or opponent-only join. */
export function sameTeam(team:z.infer<typeof Team>,side:LineupSide){return [side.name,...(names[side.club??""]??[])].some(n=>key(n)===key(team.name));}
export function sameGame(game:z.infer<typeof GameIdentity>,match:LineupMatch){return Boolean(match.kickoff&&Date.parse(game.date)===Date.parse(match.kickoff)&&sameTeam(game.homeTeam,match.home)&&sameTeam(game.awayTeam,match.away));}
const empty=(state:ActualSide["state"]):ActualSide=>({state,rows:[],bench:[],formation:""});
function sideOf(node:z.infer<typeof Formation>):ActualSide{
  if(!node.startingLineupAvailable)return empty("unannounced");
  const starters=node.startingLineup.flat(),slugs=[...starters,...node.bench].map(p=>p.slug);
  if(starters.length!==11||new Set(slugs).size!==slugs.length||!node.startingLineup.length||
    node.startingLineup.some(r=>!r.length)||starters.filter(p=>p.position==="Goalkeeper").length!==1||node.startingLineup[0]?.length!==1||node.startingLineup[0][0]?.position!=="Goalkeeper")return empty("incomplete");
  const make=(p:z.infer<typeof Player>,actual:"starter"|"bench"):LineupPlayer=>({id:`so:${p.slug}`,slug:p.slug,name:p.displayName,pos:position[p.position],p:null,actual});
  return {state:"announced",formation:node.startingLineup.slice(1).map(r=>r.length).join("-"),
    rows:node.startingLineup.map((row,i)=>({line:(i===0?"GK":i===1?"DEF":i===node.startingLineup.length-1?"FWD":"MID") as Line,players:row.map(p=>make(p,"starter"))})).reverse(),bench:node.bench.map(p=>make(p,"bench"))};
}
export function readActualGame(value:unknown,match:LineupMatch,readAt:string):ActualLineup|null{
  const parsed=Game.safeParse(value); if(!parsed.success||!sameGame(parsed.data,match))return null;
  const g=parsed.data,home=sideOf(g.homeFormation),away=sideOf(g.awayFormation);
  // A person cannot belong to both match sheets, even if both individual elevens have eleven names.
  const h=new Set([...home.rows.flatMap(r=>r.players),...home.bench].map(p=>p.id));
  if([...away.rows.flatMap(r=>r.players),...away.bench].some(p=>h.has(p.id)))return null;
  return {game:g.id,readAt,home,away};
}
export function actualSide(base:LineupSide,actual:ActualSide|undefined,cards:Record<string,OwnedCard>):LineupSide{
  const mine=(p:LineupPlayer)=>({...p,yours:p.slug&&cards[p.slug]?p.slug:undefined});
  return {...base,coach:null,rotations:null,predictability:null,season:null,squad:null,absent:[],unlinked:[],
    published:actual?.state==="announced",formation:actual?.formation??"",rows:actual?.rows.map(r=>({...r,players:r.players.map(mine)}))??[],alternatives:actual?.bench.map(mine)??[]};
}
