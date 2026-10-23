# Mission picker — phase 1

Owner contract, 23 October 2026: decisive odds are conditional on starting; start percentage is displayed separately and must never change these odds or historical ranking. Arcade and Missions use the matching fixture model when available, otherwise dated starter history. Your pick stays separately on the left with five alternatives. One L5/L10/L20/L40 switch controls every Arcade mission; alternatives rank by historical target hit rate. Missing stats stay unknown; only games before the mission boundary count. No manual visits or reduced candidate coverage substitute for automatic reads.

Visual: preserve the existing white Arcade tickets and real card art, with compact start badges and Missions-style evidence circles. Selection changes are immediate, with no decorative animation.

Acceptance: cold start, six cards with a selection, shared windows, all eligible candidates, missing versus zero, locked picks, history expiry and no start weighting. Test calculations in TypeScript and Python, browser specs for Arcade/Missions/mobile, then real Chrome at 1440 and 390. Preserve frozen historical forecasts.

Status: implemented and checked locally; deployment confirmation follows the shipping commit.


## Source evidence and remaining verification

- The original `playerGameScores(last:40)` returned 15 dated stat rows for David Soria. Sorare's official schema exposes the paginated `allPlayerGameScores` connection. Its real response rejects this within `players(slugs:)` and rejects repeated aliased `anyPlayer` roots with `Duplicated root field: anyPlayer`. Reproduction: ask `players(slugs:["david-soria-solis"]){... on Player{allPlayerGameScores(first:40){nodes{score}}}}`, or two aliased `anyPlayer` roots each selecting that connection. No credentials are needed to reproduce validation.
- The supported request selects one `anyPlayer(slug:...)`, with `allPlayerGameScores(first:40,to:<mission boundary>,after:<cursor>)`, final status, date, minutes, starter flag and detailed actions. Requests queue automatically with spacing; completed and partial player history is cached for six hours. No manual player-page visits or reduced candidate coverage.
- Real Chrome loaded 1,357 common cards and identified 124 eligible mission candidates. The queue completed for all 124 candidates. Deniz Undav displayed 0% start independently from 22% L10 / 47% L40 starter odds. Desktop 1440 and mobile 390 real-card captures passed with no horizontal overflow.

- New saved decisive forecasts carry a conditional-start marker. Their probability comparison includes confirmed starts only; mission hit/miss results still count normally. Older frozen forecasts keep their original availability-weighted basis.

- Final checks: backend formatter/linter/types/tests/OpenAPI, frontend generated types/lint/types/unit suite; Arcade, Missions, Audit and mobile browser specs. Real Chrome at 1440/390, all 124 candidates settled in the history reader, and Gallery → Arcade navigation on `next build` + `next start` restored the cached L10 picks. Forecast-accuracy improvement itself is not claimed: this restores the existing conditional model, without fitting or retuning it. The first full history read takes minutes; partial results appear as they arrive and subsequent navigation reuses the six-hour cache.
