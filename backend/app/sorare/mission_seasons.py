"""Club domestic-season cycles, keyed by Sorare competition, never inferred from nationality.

Sources and rollover policy: docs/how_it_works.md, Missions season calendars. New leagues stay unknown until verified.
The boundary includes the offseason before the competition's first fixture; it is not a guessed kickoff date.
"""

from datetime import UTC, datetime

SUMMER = frozenset(
    {"laliga-es", "segunda-division-es", "bundesliga-de", "2-bundesliga", "premier-league-gb-eng", "1-hnl"}
)
CALENDAR = frozenset({"superliga-argentina-de-futbol", "allsvenskan", "k-league-1", "k-league-2"})
JAPAN = frozenset({"j-league", "j1-league", "j2-league", "j3-league"})


def season(league: str | None, at: datetime) -> tuple[datetime, str] | None:
    if league in CALENDAR or (league in JAPAN and (at.year < 2026 or at.year == 2026 and at.month < 7)):
        label = "2026 transition" if league in JAPAN and at.year == 2026 else str(at.year)
        return datetime(at.year, 1, 1, tzinfo=UTC), label
    if league in SUMMER or league in JAPAN:
        year = at.year if at.month >= 7 else at.year - 1
        return datetime(year, 7, 1, tzinfo=UTC), f"{year}/{str(year + 1)[2:]}"
    return None
