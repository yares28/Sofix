// Complete deterministic seasons for navigation/coverage tests, never a production source.
export function leagueFixture(competition, meta) {
  if (competition === "CL" || competition === "EL") return europeanFixture(competition, meta);
  const profile = { PL: { size: 20, completed: 6, prefix: "P", base: 1000, label: "English" }, BL1: { size: 18, completed: 5, prefix: "G", base: 2000, label: "German" }, FL1: { size: 18, completed: 4, prefix: "F", base: 3000, label: "French" } }[competition];
  const size = profile.size;
  const completed = profile.completed;
  const start = Date.now() - completed * 7 * 86400000;
  const teams = Array.from({ length: size }, (_, i) => ({ code: `${profile.prefix}${String(i).padStart(2, "0")}`, source_id: profile.base + i, name: `${profile.label} Club ${String(i + 1).padStart(2, "0")}`, color: "#344567", crest_url: null, opening: null, decisives: null, cells: Array.from({ length: 2 * (size - 1) }, () => []) }));
  const matchdays = [];
  const rotation = Array.from({ length: size }, (_, i) => i);
  let id = profile.base * 10;
  for (let round = 0; round < 2 * (size - 1); round++) {
    const kickoff = new Date(start + round * 7 * 86400000).toISOString();
    const finished = round < completed;
    matchdays.push({ number: round + 1, date_from: kickoff, date_to: kickoff, finished });
    for (let j = 0; j < size / 2; j++) {
      const pair = [rotation[j], rotation[size - 1 - j]];
      if (round >= size - 1) pair.reverse();
      id++;
      pair.forEach((index, side) => {
        teams[index].cells[round].push({ fixture_id: id, opponent_code: teams[pair[1 - side]].code, venue: side === 0 ? "H" : "A", kickoff_utc: kickoff, date_confirmed: true, rescheduled: false, status: finished ? "finished" : "scheduled", result: finished ? { goals_for: 0, goals_against: 0, outcome: "D" } : null, prediction: finished ? null : { difficulty: 60, label: "Even", bucket: 3, expected_points: 1.5, probabilities: { win: .4, draw: .3, loss: .3 }, clean_sheet: .3, xg_for: 1.5, xg_against: 1.2, xd_for: null }, market: null, record: null });
      });
    }
    rotation.splice(1, 0, rotation.pop());
  }
  const scale = { cuts: [1, .75, .5, .25], higher_is_easier: true };
  return { success: true, meta, data: { competition, season: "2026/27", current_matchday: completed + 1, model_version: `test-${competition}`, lens_scales: { overall: { cuts: [20, 40, 60, 80], higher_is_easier: false }, attack: scale, defence: scale, odds: scale, record: scale, market_record: scale }, matchdays, teams } };
}

function europeanFixture(competition, meta) {
  const prefix = competition === "CL" ? "C" : "E";
  const scale = { cuts:[20,40,60,80], higher_is_easier:false };
  const start = Date.now()-3*7*86400000;
  const matchdays=Array.from({length:8},(_,i)=>({number:i+1,date_from:new Date(start+i*7*86400000).toISOString(),date_to:new Date(start+i*7*86400000).toISOString(),finished:i<3}));
  const teams=Array.from({length:36},(_,i)=>({code:`${prefix}${String(i).padStart(2,"0")}`,name:`${competition === "EL" ? "Bournemouth" : "CL Club"} ${String(i+1).padStart(2,"0")}`,color:"#344567",crest_url:`https://img.uefa.com/imgml/TP/teams/logos/70x70/${50000+i}.png`,cells:Array.from({length:8},()=>[])}));
  for(let i=0;i<36;i++) for(const [k,d] of [1,3,5,7].entries()) {
    const j=(i+d)%36,r=2*k+i%2;
    for(const [me,them,venue] of [[i,j,"H"],[j,i,"A"]]) teams[me].cells[r].push({fixture_id:50000+i*4+k,opponent_code:teams[them].code,venue,phase:"league",neutral:false,kickoff_utc:matchdays[r].date_from,date_confirmed:true,rescheduled:false,status:r<3?"finished":"scheduled",result:r<3?{goals_for:0,goals_against:0,outcome:"D"}:null,prediction:r<3?null:{difficulty:55,label:"Even",bucket:3,expected_points:1.35,probabilities:{win:.35,draw:.3,loss:.35},clean_sheet:.3,xg_for:1.5,xg_against:1.5}});
  }
  // A leading long name and a three-character percentage reproduce the real mobile hero case.
  if (competition === "EL") for (const team of teams) for (const cell of team.cells.flat()) {
    if (!cell.prediction || (team.code !== "E00" && cell.opponent_code !== "E00")) continue;
    const favoured = team.code === "E00";
    cell.prediction = {...cell.prediction, expected_points:favoured?2.75:.2,
      probabilities:{win:favoured?.9:.05,draw:.05,loss:favoured?.05:.9},xg_for:favoured?3:.4,xg_against:favoured?.4:3};
  }
  return {success:true,meta,data:{competition,season:"2026/27",current_matchday:4,model_version:`test-${competition}`,lens_scales:Object.fromEntries(["overall","attack","defence","odds","record","market_record"].map(k=>[k,scale])),matchdays,teams}};
}
