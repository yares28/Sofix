# Sofix v1 release

The 12 November owner request authorizes a versioned live xScore and asks for a complete handover before further research. The [handover](../docs/xscore-research-handover.md) preserves the research target and results. The app release covers LaLiga; other competition models have separate evidence and version names. Since 13 Nov 2026 those are `Sofix v1 PL`, `BL1`, `FL1`, `CL`, `EL` and `CONF`: [their evidence](competitions-xscore-evidence.md).

Evaluate one live-compatible candidate on the fixed native v7 rows before replacing the live formula. Inputs are the home/away flag, the live fixture model's goals and clean-sheet outlook, and up to 70 days of prior LaLiga appearances. History is released 48 hours after kickoff, strictly before the target lock. Fit earlier than each assessment period. Include every scored starter and played substitute. Report the within-seven rate, average absolute error, saved hits and spoiled hits. Distinguish the replay and the actual forecasts saved before lock. Earlier replay sets have already been examined during research.

The candidate estimates the distribution of scores using randomized shallow trees. For a conditional point prediction it selects the centre with the most historical outcomes within seven points. The gameweek xScore and lineup simulations use expected points and appearance chances. Store the candidate version and conditional points at the game level in the pre-lock record. On Audit, show the release replay and the settled starter/substitute counts by version. Historical entries keep their original data. The stronger research candidates remain separately identified in the handover.

## Release evidence

[All four replay periods and exact counts](../frontend/lib/data/sofix_v1_replay.json). The January–October 2026 results use models fitted on earlier cases only. A strict 48-hour result buffer applies to both training and player history. Training is chronological. The released artifact uses matches through 25 October 2026, with their settlement buffer, and only answers later locks.

| Role | Previous formula replay | Sofix v1 | Hits gained | Hits spoiled | Mean absolute miss |
| --- | ---: | ---: | ---: | ---: | --- |
| Starters | 2,027 / 6,754 (30.01%) | 2,596 / 6,754 (38.44%) | 1,506 | 937 | 13.84 → 14.50 |
| Played substitutes | 1,729 / 2,925 (59.11%) | 2,176 / 2,925 (74.39%) | 595 | 148 | 8.16 → 6.94 |

The earlier formula is replayed using earlier refits, archived LaLiga appearances and the same archived fixture inputs. The replay's player history includes played games only. Production can also have DNPs, more recent results, histories from other competitions and a timestamped goals market. The replay does not establish the rate on the original live forecasts. The existing data have been examined during research, so compare both versions on newly settled pre-lock records before drawing a live conclusion. The average points from the new model have their own metrics in the replay file. The seven-point gain above applies to its conditional point predictions.

The only artifact used in the live job is `backend/artifacts/sofix_v1.json.gz`. The runtime needs no training package or extra provider reads. Rebuild with `python -m app.research.sofix_v1_release --help` from `backend`. Pin scikit-learn 1.7.2 in the separate local training environment, use the native source digest from the replay JSON, and use the matching `football.json` in the worktree's research cache. The closest-score calculation uses whole-point score bins. Replay results are checked against original decimal scores.
