import { NextRequest, NextResponse } from "next/server";
import { loadKeptDays, loadLineups } from "../../../../lib/lineupsData";
import { loadActualLineup } from "../../../../lib/actualLineupsData";
import { sofixScores } from "../../../../lib/matchScores";
import { loadSofixRecord, loadSorare } from "../../../../lib/playData";

/** Public facts for a match already on Sofix; no caller-supplied source URL, query or game ID. */
export async function GET(request:NextRequest){
  const id=request.nextUrl.searchParams.get("match");
  if(!id||!/^\d{1,10}$/.test(id))return NextResponse.json({state:"unmatched"},{status:400});
  // A match the site no longer lists is found in the day kept for it (`day`, its kickoff's date: only ever a key of ours).
  const day=request.nextUrl.searchParams.get("day");
  const match=(await loadLineups())?.matches.find(m=>String(m.id)===id)??(day?(await loadKeptDays([day])).matches.find(m=>String(m.id)===id):undefined);
  if(!match)return NextResponse.json({state:"unmatched"},{status:404});
  const scores=request.nextUrl.searchParams.get("scores")==="1";
  const read=await loadActualLineup(match,scores);
  // The Scores page: Sofix's number for each player comes from what the job wrote down before the lock of the week the match is in.
  if(scores&&read.state==="ready"&&read.data.scores&&match.kickoff){
    const at=Date.parse(match.kickoff);
    const weeks=((await loadSorare())?.timeline??[]).filter(w=>at>=Date.parse(w.start)&&at<=Date.parse(w.end)).slice(-2);
    const records=(await Promise.all(weeks.map(w=>loadSofixRecord(w.slug)))).flatMap(r=>r?[r]:[]);
    for(const [slug,said] of Object.entries(sofixScores(records,read.data.game)))if(read.data.scores[slug])read.data.scores[slug].sofix=said;
  }
  return NextResponse.json(read,{headers:{"cache-control":"private, max-age=60"}});
}
