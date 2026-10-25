"use client";

import { useState } from "react";
import type { Portfolio } from "../../lib/playPortfolio";
import { rewardName, rewardNumber } from "../../lib/playRewards";


export default function PrizeDetails({portfolio:p,reward}:{portfolio:Portfolio;reward?:string}) {
  const [page,setPage]=useState(0),[selected,setSelected]=useState(0);
  const lines=p.prizeLines.filter(l=>l.options.some(o=>!reward||(o.values[reward]??0)>0)),line=lines[Math.min(selected,lines.length-1)];
  const rows=(line?.options??[]).filter(o=>!reward||(o.values[reward]??0)>0).sort((a,b)=>b.p-a.p);
  const pages=Math.max(1,Math.ceil(rows.length/6)),current=Math.min(page,pages-1);
  return <div className="pc-prize-details"><strong>Prize possibilities</strong><p>Per lineup, from this GW’s prize tiers. Projected totals use the tier each projected score reaches.</p>
    {lines.length>1?<label className="pc-prize-line">Lineup<select name="prize-lineup" autoComplete="off" value={Math.min(selected,lines.length-1)} onChange={e=>{setSelected(Number(e.target.value));setPage(0);}}>{lines.map((l,i)=><option key={i} value={i}>{l.name}</option>)}</select></label>:null}
    {line?<p><b>{line.score===null?"Score unavailable":`${Math.round(line.score)} projected pts`}</b></p>:null}
    {rows.length?<ol>{rows.slice(current*6,(current+1)*6).map((r,i)=><li key={i}><b>{Object.entries(r.values).filter(([,n])=>n!=null&&n>0).map(([k,n])=><span key={k}>{rewardNumber(k,n!)} {rewardName(k)}</span>)}<small>{r.need!==null?`${r.need} pts needed`:r.label??""}</small></b><em>{r.p>0&&r.p<.005?"<1":Math.round(r.p*100)}%</em></li>)}</ol>:<p>Prize thresholds are not recorded for these lineups.</p>}
    {pages>1?<nav aria-label="Prize possibility pages"><button type="button" disabled={!current} onClick={()=>setPage(current-1)}>Previous</button><span>{current+1}/{pages}</span><button type="button" disabled={current+1===pages} onClick={()=>setPage(current+1)}>Next</button></nav>:null}
  </div>;
}
