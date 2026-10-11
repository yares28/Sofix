import { NextRequest, NextResponse } from "next/server";
import { loadLineups } from "../../../../lib/lineupsData";
import { loadActualLineup } from "../../../../lib/actualLineupsData";

/** Public facts for a match already on Sofix; no caller-supplied source URL, query or game ID. */
export async function GET(request:NextRequest){
  const id=request.nextUrl.searchParams.get("match");
  if(!id||!/^\d{1,10}$/.test(id))return NextResponse.json({state:"unmatched"},{status:400});
  const data=await loadLineups(),match=data?.matches.find(m=>String(m.id)===id);
  if(!match)return NextResponse.json({state:"unmatched"},{status:404});
  return NextResponse.json(await loadActualLineup(match),{headers:{"cache-control":"private, max-age=60"}});
}
