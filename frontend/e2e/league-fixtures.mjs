// Complete deterministic seasons for navigation/coverage tests, never a production source.
export function leagueFixture(competition, meta) {
  const size = competition === "PL" ? 20 : 18;
  const completed = competition === "PL" ? 6 : 5;
  const start = Date.now() - completed * 7 * 86400000;
  const teams = Array.from({ length: size }, (_, i) => ({ code: `${competition === "PL" ? "P" : "G"}${String(i).padStart(2, "0")}`, source_id: (competition === "PL" ? 1000 : 2000) + i, name: `${competition === "PL" ? "English" : "German"} Club ${String(i + 1).padStart(2, "0")}`, color: "#344567", crest_url: null, opening: null, decisives: null, cells: Array.from({ length: 2 * (size - 1) }, () => []) }));
  const matchdays = [];
  const rotation = Array.from({ length: size }, (_, i) => i);
  let id = competition === "PL" ? 10000 : 20000;
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
