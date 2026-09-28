# Sofix — product and model reference

**Verified 2026-09-27.** This is the compact product contract. Use [the manual](docs/user_manual.md) for UI behavior,
[the research report](docs/research_report.md) for evidence/open issues and the two plan files for status.

## Product promise

Sofix answers two questions for one owner:

1. How difficult are LaLiga fixtures for a club, its attack and its defence?
2. Which owned Sorare cards should be entered, given eligibility, bonuses, expected score and reward thresholds?

It is not a multi-user fantasy platform, live-odds terminal or autonomous Sorare bot. Recommendations are cached,
transparent and reproducible. Nothing enters a lineup without explicit owner presses.

## Current scope

- Home, Fixtures, Difficulty, Table and Team pages for LaLiga.
- Six lenses: Overall, Attack, Defence, Record, Vs odds and Odds.
- Labels: Very favourite, Favourite, Even, Underdog, Big underdog.
- Play, Cards and Players for the owner's Sorare collection, rules, optimizer and replay.
- PWA, Control Center and a local Manifest V3 extension for `sorare.com`.
- GitHub Actions computation, Neon storage/read models and Vercel/Next.js presentation.

Out of scope: public accounts, trading execution, automatic lineup entry, real-time events, scraping prohibited sites,
and football-data.org Europa/Conference data.

## Football model

Dixon-Coles estimates decayed club attack/defence and league home advantage, applies a low-score correction and uses
a 0–10 score matrix. The fitting target is 70% goals / 30% scaled shots on target over 730 days.

| Setting | Value |
|---|---:|
| Decay `xi` | 0.001/day |
| Ridge | 1.0 |
| Promoted prior | 0.0 |
| Rating spread | 1.10 |
| Maximum goals | 10 |

For fixtures within seven days, W/D/L can blend 65% model / 35% de-margined market when prices are ≤48 hours old
and at least three bookmakers contributed. Clean-sheet output is calibrated (`a=-0.1542058812`, `b=0.9321588120`,
`n=22,334`, through 2026-09-07).

Current model version: `dixon-coles-v1+42f7fe83`. Accepted repository baseline on the 2023/24–2025/26 holdout
(8,339 forecasts): production 0.1953 RPS, closing odds 0.1886, Elo benchmark 0.2050, base rates 0.2255. The generated
report also contains a 0.1947 tuned/spread row; this documented inconsistency must be settled by a clean canonical
rerun before changing the accepted baseline.

Tune only on 2019/20–2022/23. Ship a change only if the matchday-bootstrap RPS interval excludes zero, or calibration
improves without worse RPS.

## Difficulty contract

```text
expected points = 3 × P(win) + P(draw)
difficulty = 100 × (1 − expected points / 3)
```

Lower is kinder. Cuts are 48.6, 61.1 and 71.3, with a venue-aware strongest cut of 36.0 at home and 23.4 away.
Backend owns `prediction.bucket` and `lens_scales`; frontend must not re-derive them.

- Overall/Attack/Defence sum future expected points/goals/clean sheets.
- Record describes five-season club results in the model-price band; Vs odds uses the bookmaker-price band.
- Odds uses fair market win chance and average market expected points per priced future game.
- Record lenses are descriptive only. Finished fixtures remain for review but leave future totals/cuts.

## Sorare contract

Current xScore is a transparent heuristic, not the planned fitted S4 model:

```text
xScore = P(plays at least once) × expected Sorare score if he plays
```

Sorare projection/play odds are preferred; last-five form with priors is fallback. Double gameweeks use chance of any
appearance and a best-of-two uplift. The optimizer uses seeded 3,000-draw simulation, score SD 17.6, beam width 120
and repeated randomized whole-week searches; it returns up to five materially different plans. It enforces synced
slots/caps/bonuses/uniqueness/substitution rules. Cash and essence stay separate, while candidate ranking normalizes
both objectives. Reward chances remain estimates with known spread/correlation assumptions.

## Operating contract

- Schedule: 07:17 and 22:43 UTC daily, Tuesday 13:23 and Friday 17:23 UTC.
- Order: schema check → sync → odds → predict → Sorare → publish → revalidate.
- Unattended jobs never migrate; one refresh at a time; button cooldown ten minutes.
- Page models cache for one hour and revalidate after publish; no browser DB polling.
- Jobs replace current rows/read models. Pre-lock Sorare forecasts are intentionally retained for replay.

## Stable decisions

- One date-selected week drives all pages; LaLiga and Sorare GW numbers can differ. A Sorare game week holding two
  LaLiga rounds is two weeks to pick on the board and one row on Play, never two addresses for the same page.
- National-team fixtures use the actual participating side, never the card's club; outside LaLiga show player
  availability/xScore rather than invented team odds. A Sorare-only Home week says LaLiga is away.
- Store UTC; display Madrid; unknown kickoff is “Date TBC”.
- Tiles show colour, opponent and venue, not bucket number.
- Odds-derived secondary goal markets are implied from 1X2 + totals, not direct quotes.
- Current table uses head-to-head only after both mutual games; projected simulations are seeded.
- Cards/Players are latest snapshots; market value is not a live listing.
- Apply remains Check → Draft → explicit Enter. Extension exposes no general GraphQL proxy.

## Remaining work

Settle the football baseline, fit/blind-test S4 only after enough recorded weeks, calibrate correlated rewards, and
complete extension/live Apply acceptance before retiring SorareExt.
See [docs/research_report.md](docs/research_report.md).

Done since the audit: a Sorare week spanning two LaLiga rounds is now one week per round — each with its own
address and days — sharing the one game week and its single plan, and each page only lists the weeks it can open
(`lib/weeks.ts`, `pageWeeks`).
