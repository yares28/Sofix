// Published combined-board shape. Cross-source merging itself is tested in Python.
export function allFixture(meta) {
  const leagues = ["PD", "PL", "BL1", "FL1", "CL", "EL", "CONF"];
  const today = new Date();
  const monday = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate() - (today.getUTCDay() + 6) % 7));
  const matchdays = Array.from({ length: 16 }, (_, i) => ({ number: i + 1,
    date_from: new Date(+monday + (i - 3) * 7 * 86400000).toISOString(),
    date_to: new Date(+monday + ((i - 2) * 7 - 1) * 86400000 + 86399000).toISOString(), finished: i < 3 }));
  const teams = Array.from({ length: 56 }, (_, i) => ({ code: `T${i}`, source_code: `T${i}`,
    source_competition: leagues[i % 7], name: `Mixed Club ${String(i + 1).padStart(2, "0")}`, color: "#344567", crest_url: null,
    cells: matchdays.map((md, round) => [0, ...(i < 14 ? [1] : [])].map(extra => ({ fixture_id: round * 1000 + Math.floor(i / 2) * 10 + extra,
      competition: extra ? "CL" : leagues[i % 7], opponent_code: `T${i % 2 ? i - 1 : i + 1}`, venue: i % 2 ? "A" : "H",
      kickoff_utc: new Date(Date.parse(md.date_from) + (2 + extra * 2) * 86400000).toISOString(),
      date_confirmed: true, rescheduled: false, status: md.finished ? "finished" : "scheduled",
      result: md.finished ? { goals_for: 0, goals_against: 0, outcome: "D" } : null,
      prediction: { difficulty: 20 + i, label: "Favourite", bucket: 2, expected_points: 2.5 - i / 40,
        probabilities: { win: .6, draw: .2, loss: .2 }, clean_sheet: .4, xg_for: 2.5 - i / 40, xg_against: 1 },
    }))) }));
  const scale = { cuts: [20, 40, 60, 80], higher_is_easier: false };
  return { success: true, meta, data: { competition: "ALL", season: "2026/27", current_matchday: 4,
    missing_competitions: [], model_version: "combined", matchdays, teams,
    lens_scales: Object.fromEntries(["overall", "attack", "defence", "record", "market_record", "odds"].map(l => [l, scale])) } };
}
