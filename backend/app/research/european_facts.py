"""Reviewed regulation targets, separate from native totals and model predictions."""

from __future__ import annotations

from typing import Any, cast

from app.research.league_xscore_data import when

RELOCATIONS = {
    "2042166": (
        "50157",
        "57477",
        "250001811",
        "2024-11-28T17:45:00Z",
        "https://bjk.com.tr/en/news/90227/club-announcement-for-uefa-europa-league-match-between-besiktas-and-maccabi-tel-aviv.html",
    ),
    "2039358": (
        "2609552",
        "64388",
        "250003909",
        "2023-11-30T17:45:00Z",
        "https://www.uefa.com/news-media/news/0287-198938a15904-88f019c91a64-1000--venue-changed-for-the-uefa-europa-conference-league-match-fe/",
    ),
    "2044403": (
        "52697",
        "50084",
        "76106",
        "2025-02-13T17:45:00Z",
        "https://vikingur.is/vikingur-panathinaikos-bolt-arena-helsinki/",
    ),
    "2050097": (
        "64125",
        "59340",
        "1100174",
        "2026-10-22T16:45:00Z",
        "https://es.uefa.com/uefaeuropaleague/match/2050097--union-sg-vs-h-beer-sheva/matchinfo/",
    ),
}
POLICIES = {
    "UKR": (
        "2022-02-25T00:00:00Z",
        "https://editorial.uefa.com/resources/028b-1a647f932798-d9a857a58f15-1000/8865_8866_8867_-_russian_clubs.pdf",
    ),
    "BLR": (
        "2022-03-03T00:00:00Z",
        "https://www.uefa.com/news-media/news/0273-1493944bb9c8-f5773a44dabd-1000--belarus-teams-to-play-on-neutral-ground/",
    ),
    "ISR": (
        "2023-10-31T00:00:00Z",
        "https://www.uefa.com/news-media/news/0286-1958f1edd07e-9e9dd75d183b-1000--venues-for-upcoming-israel-matches-announced/",
    ),
}


def pair(raw: Any) -> list[int] | None:
    if not isinstance(raw, dict):
        return None
    values = [raw.get("home"), raw.get("away")]
    return cast(list[int], values) if all(type(v) is int and v >= 0 for v in values) else None


def regulation(raw: dict[str, Any]) -> dict[str, Any]:
    result: dict[str, Any] = {"score90": None, "basis": "not a completed match", "evidence": None}
    if raw.get("status") != "FINISHED":
        return result
    score = raw.get("score") or {}
    regular, total = pair(score.get("regular")), pair(score.get("total"))
    if regular == total == [0, 0]:
        return {
            **result,
            "score90": [0, 0],
            "basis": "explicit completed scoreless result; not an inferred empty goal inventory",
        }
    events = (raw.get("playerEvents") or {}).get("scorers")
    if not isinstance(events, list) or not events or total is None:
        return {**result, "basis": "positive result lacks a complete goal inventory"}
    sides = [(raw.get(side) or {}).get("id") for side in ("homeTeam", "awayTeam")]
    if not all(sides) or sides[0] == sides[1]:
        return {**result, "basis": "unresolved actual sides"}
    seen = set()
    all_goals, before_extra = [0, 0], [0, 0]
    for event in events:
        ident, phase, kind = event.get("id"), event.get("phase"), event.get("goalType")
        if (
            not ident
            or ident in seen
            or phase not in {"FIRST_HALF", "SECOND_HALF", "EXTRA_TIME_FIRST_HALF", "EXTRA_TIME_SECOND_HALF"}
            or kind not in {"SCORED", "OWN", "PENALTY"}
            or event.get("teamId") not in sides
        ):
            return {**result, "basis": "unresolved or repeated goal event"}
        seen.add(ident)
        side = sides.index(event["teamId"])
        if kind == "OWN":
            side = 1 - side
        all_goals[side] += 1
        if phase in {"FIRST_HALF", "SECOND_HALF"}:
            before_extra[side] += 1
    if all_goals != total:
        return {**result, "basis": "goal inventory conflicts with listed total"}
    if regular == before_extra:
        return {
            **result,
            "score90": before_extra,
            "basis": "native regulation field and complete goal-phase inventory agree",
        }
    round_data = raw.get("round") or {}
    if (
        (raw.get("competitionPhase") or round_data.get("phase")) == "TOURNAMENT"
        and round_data.get("mode") == "GROUP"
        and before_extra == total
    ):
        return {
            **result,
            "score90": before_extra,
            "reportedRegularConflict": True,
            "basis": "main group/league phase cannot have extra time; complete regulation goal inventory equals full total",
        }
    # The exact existing primary receipt, not a global preference for native events.
    if (
        raw.get("id") == "2036625"
        and raw.get("seasonYear") == "2023"
        and sides == ["50074", "2603104"]
        and (raw.get("kickOffTime") or {}).get("dateTime") == "2023-02-23T17:45:00Z"
        and regular == [2, 2]
        and total == before_extra == [2, 1]
    ):
        return {
            **result,
            "score90": [2, 1],
            "basis": "exact reviewed participating-club regulation/extra-time/shootout narrative",
            "evidence": "https://www.rsca.be/fr/andlud",
        }
    return {**result, "basis": "regulation field conflicts with goal-phase inventory"}


def venue(raw: dict[str, Any]) -> dict[str, Any]:
    """Declared model home-exposure convention, with actual stadium evidence retained.

    Ordinary designated home matches within the association's territory retain the
    home effect, including local rentals. Foreign territory alone never proves a
    neutral ground: require a reviewed policy, exact relocation or local-base exception.
    """
    result: dict[str, Any] = {"neutral": None, "basis": "unreviewed venue context", "evidence": None}
    if (raw.get("round") or {}).get("mode") == "FINAL":
        return {
            **result,
            "neutral": True,
            "basis": "UEFA final at a predetermined neutral stadium",
            "evidence": "https://documents.uefa.com/r/Regulations-of-the-UEFA-Champions-League-2026/27/Article-22-Match-system-final-Online",
        }
    home, stadium = raw.get("homeTeam") or {}, raw.get("stadium") or {}
    country, actual = home.get("countryCode"), stadium.get("countryCode")
    if not country or not actual or not stadium.get("id"):
        return result
    if country == actual:
        return {
            **result,
            "neutral": False,
            "basis": "designated home in association territory; ordinary home-effect convention",
        }
    if (
        home.get("id") == "60457"
        and str(raw.get("seasonYear")) == "2025"
        and stadium.get("id") == "1100109"
        and actual == "ENG"
    ):
        return {
            **result,
            "neutral": False,
            "basis": "TNS local English base and approved New Meadow home groundshare",
            "evidence": "https://tnsfc.co.uk/2024/09/23/saints-to-host-uefa-conference-league-matches-at-shrewsbury-town/",
        }
    kickoff = (raw.get("kickOffTime") or {}).get("dateTime")
    policy = POLICIES.get(country)
    if policy and kickoff and when(kickoff) >= when(policy[0]):
        return {
            **result,
            "neutral": True,
            "basis": "documented neutral-home policy and actual foreign stadium",
            "evidence": policy[1],
        }
    relocation = RELOCATIONS.get(raw.get("id", ""))
    if (
        relocation
        and (home.get("id"), (raw.get("awayTeam") or {}).get("id"), stadium.get("id"), kickoff) == relocation[:4]
    ):
        return {
            **result,
            "neutral": True,
            "basis": "reviewed exact foreign relocation; zero home-exposure convention",
            "evidence": relocation[4],
        }
    return result
