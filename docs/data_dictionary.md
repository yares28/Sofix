# Data/source dictionary

| Family | Priority | Free source / derivation | Default ingestion |
|---|---|---|---|
| Current fixtures/results/standings | Core | football-data.org | API |
| Official calendar verification | Core QA | LaLiga official | manual/QA |
| Historical results | Core | Football-Data.co.uk | CSV |
| Shots/SOT/corners/cards/referee | Strong | Football-Data.co.uk | CSV |
| Historical odds | Strong | Football-Data.co.uk | CSV |
| Elo | Core | internal | derived |
| Rolling form/home-away | Core | internal | derived |
| xG/xGA/npxG/xPts | Strong | StatsBomb Open historical; authorized current import | open JSON/manual |
| Events/lineups/pressures | Advanced | StatsBomb Open historical | open JSON |
| Suspensions | Strong | RFEF disciplinary decisions | reviewed PDF import |
| Injuries | Strong | authorized provider/manual point-in-time import | import adapter |
| Player value/minutes/expected XI | Strong | own history + authorized squad source | derived/import |
| Market value proxy | Medium | authorized import | import adapter |
| Transfers/squad continuity | Strong | authorized import + minutes retained | derived/import |
| Managers | Medium | official/manual structured data | import |
| Europe/cup congestion | Strong | UEFA/RFEF/fixture feeds | adapter |
| Travel | Medium | stadium coords + Haversine | derived |
| Stadium coords | Medium | OSM/Nominatim (cache) | one-time seed |
| Weather | Optional | Open-Meteo | API |
| Referee tendencies | Low | Football-Data.co.uk history | derived |
| H2H | Low | historical match DB | derived |
| Motivation flags | Optional | standings + rules | derived |

Important: Transfermarkt's current Terms prohibit bots/screen-scraping. The app schema supports
injury and market-value data, but the default repo intentionally does not scrape Transfermarkt.

Understat is treated as replaceable optional xG enrichment rather than a guaranteed official API.
