"""How often a club has actually won when it was priced the way it is now.

The board can say what it expects; until now it could not say what usually happens to *this club* when it
is this favoured. Sevilla priced 35-50% has won 24 of 63 such games (38%) while the league wins 43.8% at
that price - a club that quietly falls short of its billing, which no lens showed.

The record comes from bookmaker closing odds in the cached football-data.co.uk CSVs, for one reason: they
are the only record of what a club *was* priced at. The app replaces its own predictions every refresh and
keeps no history of them, so there is nothing else to count.

Two numbers come out of it per fixture:

- `rate`, the club's raw win rate in that price band, with the counts behind it. The tooltip shows this
  because "24 of 63" is honest about its own sample in a way a percentage is not.
- `edge`, that rate minus what the whole league gets at the same price, shrunk toward zero by sample size.
  This is what a lens can colour: it is what the club adds to its price, not the price itself.

Bands are wide on purpose. A club plays about 38 games a season and concentrates in two or three of these,
so narrower bands would trade a little precision for samples too thin to mean anything.
"""

from __future__ import annotations

from dataclasses import asdict, dataclass

import numpy as np
import pandas as pd

BANDS: tuple[tuple[float, float, str], ...] = (
    (0.00, 0.20, "under 20%"),
    (0.20, 0.35, "20-35%"),
    (0.35, 0.50, "35-50%"),
    (0.50, 0.65, "50-65%"),
    (0.65, 1.01, "65% or more"),
)
SEASONS = 5  # of history; the model looks back two years, this is description rather than forecasting
PRIOR_GAMES = 8.0  # how many games of "no edge" the shrinkage is worth
MIN_GAMES = 5  # below this a club has no record to show at that price


def band_of(win_probability: float) -> str | None:
    """The price band a win chance falls into, or None if it isn't a probability."""
    if not np.isfinite(win_probability):
        return None
    return next((name for low, high, name in BANDS if low <= win_probability < high), BANDS[-1][2])


@dataclass(frozen=True)
class Record:
    """One club's history at one price."""

    band: str
    games: int
    wins: int
    rate: float  # the club's own win rate in this band
    league: float  # what every club together gets at this price
    edge: float  # rate - league, shrunk toward 0 by sample size

    def as_dict(self) -> dict:
        return {
            **asdict(self),
            "rate": round(self.rate, 4),
            "league": round(self.league, 4),
            "edge": round(self.edge, 4),
        }


def _sides(matches: pd.DataFrame) -> pd.DataFrame:
    """Both clubs of every priced match, with the fair win chance the bookmakers gave them."""
    priced = matches.dropna(subset=["odds_h", "odds_d", "odds_a"])
    implied = 1 / priced[["odds_h", "odds_d", "odds_a"]].to_numpy(dtype=float)
    fair = implied / implied.sum(axis=1, keepdims=True)
    home_goals, away_goals = priced["hg"].to_numpy(), priced["ag"].to_numpy()
    home = pd.DataFrame({"team": priced["home"].to_numpy(), "p": fair[:, 0], "won": home_goals > away_goals})
    away = pd.DataFrame({"team": priced["away"].to_numpy(), "p": fair[:, 2], "won": away_goals > home_goals})
    both = pd.concat([home, away], ignore_index=True)
    return both.assign(band=[band_of(p) for p in both["p"]])


class OddsRecord:
    """Every club's win rate by price band, plus the league's, from `matches`."""

    def __init__(self, matches: pd.DataFrame) -> None:
        sides = _sides(matches)
        self.league: dict[str, float] = {}
        self._clubs: dict[tuple[str, str], tuple[int, int]] = {}
        if sides.empty:
            return
        for band, rows in sides.groupby("band", observed=True):
            self.league[str(band)] = float(rows["won"].mean())
            for team, club_rows in rows.groupby("team"):
                self._clubs[(str(team), str(band))] = (len(club_rows), int(club_rows["won"].sum()))

    def for_club(self, team: str, win_probability: float) -> Record | None:
        """The club's record at the price this fixture gives it, or None when there isn't enough of one."""
        band = band_of(win_probability)
        if band is None or band not in self.league:
            return None
        games, wins = self._clubs.get((team, band), (0, 0))
        if games < MIN_GAMES:
            return None
        league = self.league[band]
        rate = wins / games
        # Shrink toward the league: a club with 6 games barely moves off its price, one with 90 mostly doesn't.
        shrunk = (wins + PRIOR_GAMES * league) / (games + PRIOR_GAMES)
        return Record(band=band, games=games, wins=wins, rate=rate, league=league, edge=shrunk - league)


def build_record(matches: pd.DataFrame, season_start: int, seasons: int = SEASONS) -> OddsRecord:
    """The record over the last `seasons` seasons of the history frame, current season included."""
    window = matches[matches["season_start"] > season_start - seasons]
    return OddsRecord(window)
