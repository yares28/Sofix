# Premier League and Bundesliga FDR verification

21 October 2026. Regular-league FDR delivery; xScore is deferred. The reference architecture is fitted independently per league. This is not a claim that a new algorithm outperforms the historical reference.

## Real data checked locally

- Public football-data.co.uk CSVs: 1,590 Premier League and 1,278 Bundesliga matches across the five loaded seasons through 21 October. All 20 / 18 current clubs are present, including the promoted clubs.
- The Premier League's official full-season article has 380 unique ordered fixture pairs covering every club. The extracted list contains 381 appearances because Liverpool-Brighton appears twice under different labels; the comparison preserves this duplicate rather than inventing a new fixture or choosing its date from the outcome.
- The Bundesliga's official upcoming-round page has nine fixtures covering all 18 clubs. This is a representative round check, not proof of the complete provider season.
- Fit both reference models on results strictly before 21 October; all public-pair predictions have finite positive goals, normalized W/D/L probabilities and clean-sheet probabilities in [0,1]. Promoted clubs: Coventry/Hull/Ipswich; Elversberg/Paderborn/Schalke.
- Cached public pages, their URL/SHA-256 receipts, CSVs and aggregate verification are under the ignored backend/data/raw/league-fdr/ folder. Nothing from these verification pages is substituted into the production feed.

## Serving and operations

- Production collection uses the existing authenticated football-data.org feed: one full-season call per new league on the existing scheduled refresh. Both leagues are included in that provider's published free coverage. No new Odds API or Sorare calls are introduced.
- Only grid:PL and grid:BL1 are published, using the existing put/R2/Neon path. Histories stay in Actions' existing raw-data cache. No production schema migration or foreign rows in LaLiga's normalized tables.
- On a push inside the full refresh's three-hour cooldown, an automatic bootstrap initializes only missing league blocks under the existing refresh lock. Once both exist it skips without source calls; LaLiga, Sorare and paid odds are not rerun.
- Club abbreviations remain the source's three-character display codes. Separate stable source IDs identify saved forecasts, so a changed abbreviation cannot attach one club's prediction to another.
- A board is replaced only after its complete season passes 20/18-club, 380/306-fixture, full ordered-pair, round, identity and schema guards. A failed source keeps the previous block. Missing goals are not zeros. Finished matches receive no hindsight forecast; saved per-cell pre-kickoff timestamps survive later refreshes.
- LaLiga's clean-sheet correction, live-market blend, decisive-action rates and xScore are not copied to the new leagues. New-league clean sheets remain raw model probabilities. Model/Attack/Defence and historical Record are supported; live Odds/Vs odds remain empty until there is a separately budgeted source for them.
- New-league preseason projections are absent rather than reconstructed after the season began. Top-four/fifth/sixth projection columns describe positions, not guaranteed European qualification. Bundesliga has two direct relegation places and a separate play-off place; this release does not predict the play-off tie.

## Limits and remaining live proof

Local checks passed: Ruff formatting/lint, mypy, the full backend test suite, OpenAPI export, generated API types, ESLint, TypeScript and Vitest. The first full browser run passed 248/252 cases. Two date-link regressions were fixed and passed on rerun; cold development compilation caused the team-navigation/search timeouts, and both flows passed against the production build. The stricter new phone test exposed an existing toolbar accessibility-label overflow, fixed by containing the labels in their scrolling row. Both new leagues then passed the 390 px width assertion. Final browser verification and publication are recorded in the task plan.

The local football-data.org token is not configured. The exact authenticated current-season responses and first published blocks must therefore be checked after the existing GitHub refresh runs; public-source model checks do not prove that account's entitlement or its exact response. No credential search or new paid service is needed. Production live proof remains pending until those blocks exist.

Official references: [Premier League fixtures](https://www.premierleague.com/en/news/4675097/all-380-fixtures-for-season-2026-27), [Bundesliga fixtures](https://products.bundesliga.com/fixtures), [DFL rules 11 June 2026](https://media.dfl.de/sites/2/2026/06/Spielordnung-SpOL-2026-06-11-Stand.pdf), [Premier League table rules](https://www.premierleague.com/en/news/58905), [provider coverage](https://www.football-data.org/coverage), [provider request policy](https://docs.football-data.org/general/v4/policies.html).
