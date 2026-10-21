# Premier League and Bundesliga xScore

Owner request, 21 October 2026: after the shipped FDR boards, work on xScore for these two leagues. Existing direct-to-main shipping authorization applies. This extends the FDR release; cups and European FDR remain outside scope.

## Requested workflow and acceptance

- Automatically cover Sorare players of all 20 Premier League and 18 Bundesliga clubs, including players the owner does not hold. Retain LaLiga coverage and owned players in other competitions.
- Player search, player detail, owned cards and plans use consistent player identities and the selected Sorare GW. Club fixture rounds and Sorare GWs remain distinct. Show the side actually playing, including national teams.
- Collect squad/index data and authentic player history through the existing unattended jobs. No extra source tabs, manual token entry or computer left running. Missing and zero remain distinct; source failures must not silently erase a whole league.
- Preserve the shipped LaLiga model. Never apply its learned goalkeeper/outfield/substitute coefficients or calibration to another league without evidence. History/projection-based xScore and separately validated opponent-aware models are different deliveries and must be labeled honestly.
- Keep source identity and sample/forecast timing. No hindsight forecasts, synthetic Sorare outcomes, invented live odds or claims that retrospective checks are blind evidence.
- Reuse bounded R2/Neon blocks and the game-history mirror; avoid repeatedly downloading growing all-player histories or a huge market block. No production schema change, paid upgrade or extra Odds calls.
- Test first: all clubs, duplicate/transfer identity, partial source failure, cold start, history expiry, missing versus zero, per-league form, selected GW, reload/navigation, and LaLiga regressions. Verify representative real source data, publication and desktop/mobile UI before declaring acceptance met.

## Execution

- Production startup check passed: Vercel and all 15 routes healthy; prior FDR browser CI passed.
- Existing xScore callback only applies the learned LaLiga models to LaLiga games. Owned foreign players already receive the generic history/Sorare fallback; the unowned-player index currently reads LaLiga only. Its daily history job follows that index.
- Asked an optional release-preference question while implementing coverage: ship history/Sorare xScore first, or wait for independently validated opponent models. Automatic player coverage is required for either choice. The question does not block that work.
- Owner chose **wait for validated Sofix FDR-based xScore models** after the alternatives were explained. The release gate is now explicit: no generic-fallback release. First collect authentic, null-preserving outcomes and score versions, freeze the candidate/evaluation protocol, fit the two leagues separately, and validate before enabling any new player-facing model. Source collection and validation may be shipped independently; a failed accuracy gate must remain a failure.
- Frozen evaluation design before outcome collection: fit 2023/24–2024/25 independently per league, test 2025/26 once on the common authentic version-7 starter cohort. No retrospective Sorare projection is a model input without its pre-lock publication evidence. Reconstruct fixed-reference FDR using results strictly before actual Sorare cutoffs. Require an RMSE advantage with a whole-week 95% bootstrap interval below zero against both recent form and a no-FDR ablation, no position loss, and no loss in within-7 or pair ordering. At least 100 test starts per position. This is retrospective held-out evidence, not a newly blind experiment.
- One local batched representative request was rejected because Sorare prohibits playerGameScores nested inside pastGames. This is a query-shape restriction, not unavailable data. The collector uses a paged competition list plus batched specific-game reads, the documented pattern already used by the LaLiga export. The official schema scan passes (0 deprecated fields). No further manual Sorare data calls; authenticated unattended collection uses the existing workflow secret.
- Source outcomes stay in private Actions artifacts/cache for seven days and ignored local data; none are inserted into production Neon. No model is enabled by collection. Read-only access to the account's billing allowance was unavailable (token lacks that scope); no billing setting, paid plan, budget or cap is changed. Batching ten games per request bounds the one-time job to roughly 220 requests plus paging for all three completed seasons, rather than a per-player loop.

## Delivery checklist

- [ ] Source/coverage and payload contract inspected; relevant real read verified.
- [ ] Regression tests fail first, then pass.
- [ ] Automatic collection and consistent player surfaces implemented.
- [ ] Required local checks, browser proof and model-specific evidence complete.
- [ ] Ship, verify publication and record exact remaining limits.
