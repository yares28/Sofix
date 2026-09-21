# Data sources

## In use

| Data | Source | How | Limits / terms |
|---|---|---|---|
| Current fixtures, kickoff times, results | football-data.org (`PD`) | API, one call per refresh | Free token: 10 requests/min; LaLiga + Champions League, not Europa/Conference |
| Historical results, shots on target, odds | Football-Data.co.uk (`SP1`) | CSV download, cached in `backend/data/raw/`; five seasons feed each club's record at its price | Free; updated Tue/Fri |
| Team identities, colours, stadiums | `app/services/team_registry.py` | Maintained by hand | Add promoted clubs each June |

## Candidates (not in the pipeline)

| Family | Priority | Possible source | Notes |
|---|---|---|---|
| Segunda División history (promoted teams) | High | Football-Data.co.uk `SP2` | Planned (phase 6.4) |
| Pre-match odds for the next matchday | High | Football-Data.co.uk `fixtures.csv` | Bet365/average/max only; planned (phase 6.5) |
| Champions League fixtures (rest days) | Medium | football-data.org `CL` | Free tier; planned (phase 6.7) |
| xG / xGA | Medium | Understat (research only), paid API for production | Understat has no API or clear licence; FBref lost Opta advanced stats in Jan 2026 |
| Suspensions | Medium | RFEF disciplinary decisions | Human-reviewed; PDFs |
| Injuries, squads, market values | Medium | Authorised provider only | Transfermarkt Terms prohibit bots/scraping |
| Europa / Conference / Copa fixtures | Medium | Paid API | Not in football-data.org free tier |
| Events, lineups, pressures | Low | StatsBomb Open Data | LaLiga only to 2020/21 and Barcelona matches only: research use |
| Stadium coordinates for travel | Low | Registry already has them | Travel distance not modelled yet |
| Referee tendencies, head-to-head | Low | Historical CSVs | Low expected value |
