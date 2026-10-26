# Plan · the difficulty board, tuned with the engine's data (26 Oct 2026)

**What you asked (26 Oct).** Use the same data as the new score engine ([score-engine.md](score-engine.md)) to make the Difficulty
page's Overall, Attack, Defence and Record lenses correct and precise, for every league. LaLiga's xScore comes first; this plan is
built after it, league by league.

## 1 · What each lens is today, and where it is known to be off

| Lens | Tile value | Known to be off (source) |
|---|---|---|
| Overall | difficulty from the win/draw/loss chances (`100 × (1 − expected points ÷ 3)`) | favourites at 60–70% are under-confident (AGENTS.md "Model rules"); promoted clubs lag the market after week 8, RPS gap +0.0088 against +0.0057 for the rest ([fixture_difficulty.md](../docs/fixture_difficulty.md) 2.9) |
| Attack | expected goals for (λ) | above 3.0 it runs high: 3.26 said, 2.68 scored, 257 forecasts, nearly all Barcelona or Real Madrid at home (2.7) |
| Defence | clean-sheet chance, corrected after the fit | still 1.1–3.7 points high by colour band over nine seasons, about 4 in the last three (2.7) |
| Record | the club's win rate at this price minus the league's, shrunk by 8 games (`services/odds_record.py`) | never tested as a predictor (2.13); counts wins only, so a club that draws its hard games looks the same as one that loses them; five seasons weigh the same |

What the board does not know today (1.11): team news beyond the bookmakers' 35% tint inside seven days, chance quality beyond shots on
target, home advantage per club, rest and European games.

## 2 · What the engine's data adds

*Example for each:* the lens it moves and how.

1. **Team news.** Each missing starter weighs his share of his side's goals, shots, chances and defensive actions (Sorare's stats
   per player) and moves his side's attack and defence before the scoreline chances.
   *Example:* without its striker, a club's Attack value drops by his share of its goals. Its opponents' Defence (clean sheets) goes up.
2. **Chance quality.** Sorare's team totals of shots on target, big chances and penalty-area entries, and Understat's expected goals,
   tried against shots on target alone in the rating fit (today 70% goals, 30% shots on target).
   *Example:* a club winning 1–0 from one shot is rated as lucky, not strong.
3. **The bookmakers' goals line** (over/under, already read each refresh) moves Attack and Defence for priced games, as it already
   moves the players' numbers.
   *Example:* the board says 1.4 goals, but the bookmakers' line implies 1.9: Attack shows the blend, with a weight fitted on history.
4. **Calibration.** Favourites' chances spread so 60–70% means 60–70%. Very large λ is pulled in. The clean-sheet correction is refitted
   with recent seasons weighing more.
   *Example:* Barcelona at home said 3.26 goals but scored 2.68 on average: their Attack tile shows the corrected value.
5. **Promoted clubs, home advantage per club, rest.** Promoted clubs learned faster after week 8. Each club's own home advantage, shrunk
   to the league's. Days since the last game and a European game three days before. Each one tried, each kept only if it helps.
6. **Record, correct and precise.**
   - check the bands against the price the board shows, the counts, the seasons, and promoted clubs with fewer seasons;
   - recent seasons weigh more;
   - the shrinkage (8 games) is fitted on later seasons, not chosen;
   - points at this price tried against wins at this price;
   - the Record is tested as a predictor of the club's next games at that price. If it predicts nothing, the tooltip keeps saying it
     describes the past.

## 3 · Rules

- **New files only.** `modeling/dixon_coles.py` is frozen by hash for the validated European, Conference and league models. The tuned
  board model is a new module, used by LaLiga's board first; the frozen ones keep theirs.
- **The bar** (AGENTS.md "Model rules"): tune on 2019/20–2022/23, test on 2023/24–2025/26. Ship only if the matchday-bootstrap RPS
  interval excludes zero, or calibration improves with no loss. Per lens:
  - Overall: RPS and calibration by band;
  - Attack: goals scored against λ, by band;
  - Defence: clean sheets against the chance, by band;
  - Record: whether it predicts the next games at that price.
  The artifact, refresh, report and baseline text change together.
- **The contradiction to settle first.** Sorare's per-player stats start in 2023/24 (checked 26 Oct, read only), and Futbol Fantasy's
  lineups are only kept from this season. So the tuning seasons 2019/20–2022/23 have no player data, and team news (§2.1) cannot be tuned
  there. Football-data.co.uk (scores, shots, prices) and Understat (expected goals for LaLiga and the big five; its seasons are said to start in
  2014/15, to confirm with one read) do cover them.

## 4 · Phases (after LaLiga's xScore engine; LaLiga first, then each league)

1. **F0 · The ruler.** One command scores each lens on the test seasons: Overall RPS and calibration, Attack by band, Defence by band,
   Record as a predictor. Today's board is the "before" table.
2. **F1 · Calibration** (§2.4): no new data. Favourites, large λ, the clean-sheet correction.
3. **F2 · The bookmakers' goals line** into Attack and Defence (§2.3). The history is in football-data.co.uk's closing prices.
4. **F3 · Promoted clubs, home advantage per club, rest** (§2.5).
5. **F4 · Chance quality** (§2.2): Understat's expected goals on the tuning seasons; Sorare's team totals from 2023/24.
6. **F5 · Team news** (§2.1): only with your call on its tuning seasons (§5).
7. **F6 · Record** (§2.6).
8. **F7 · Other leagues.**
   - Premier League, Bundesliga and Ligue 1 take F0–F6 with their own football-data.co.uk files and their own test seasons.
   - Champions League and Europa League were validated on frozen held-out seasons, so a change there means a new frozen validation, as
     it did on 23 Oct.
   - Conference stays the provisional model of its release contract ([conference-release.md](conference-release.md)).

Each phase ships on its own, with the board's 1440 and 390 px look and the Difficulty page's spec.

## 5 · Your calls

1. **Team news's tuning seasons.** Tune it on 2023/24–2024/25 and test on 2025/26–2026/27 (the seasons with player data), which bends
   the 2019/20–2022/23 rule for this one part. Or leave team news out of the board.
2. **Understat for past seasons.** A one-off read of about seven seasons per league (one page per season and league, a few seconds
   apart) for F4. Today's limit is one request per league per refresh.
