"""Finite current mission inventory/evidence from existing collection and history reads."""

from __future__ import annotations

from datetime import UTC, datetime, timedelta
from typing import Any

from app.sorare import mission_form
from app.sorare.forecast import forecasts
from app.sorare.model import Forecast
from app.sorare.publish import _split_out, _with_chances, card_games, player_weeks, read_cards

KEY = "missions_pool"
DECISIVE = ("goals", "goal_assist", "assist_penalty_won", "clearance_off_line", "last_man_tackle", "penalty_save")


def rolling_sheets(
    history: dict[str, Any], positions: dict[str, str], now: datetime, *, leagues: dict[str, str] | None = None
) -> dict[str, Any]:
    # Match the ledger's existing fallback reset. No game from this mission day enters its historical form.
    day = (now - timedelta(hours=8)).date()
    before = datetime(day.year, day.month, day.day, 8, tzinfo=UTC)
    players = {}
    for slug, games in history.items():
        starts = sorted(
            [
                g
                for g in games
                if g.get("started")
                and g.get("played")
                and g.get("stats") is not None
                and g.get("status") != "PENDING"
                and datetime.fromisoformat(g["date"].replace("Z", "+00:00")) < before
            ],
            key=lambda g: g["date"],
        )
        # Permanent game rows keep the source's detailed counts and points, plus sheet context.
        starts = [
            {**g, "stats": {s["stat"]: s["statValue"] for s in g["stats"] if s.get("statValue") is not None}}
            if isinstance(g["stats"], list)
            else g
            for g in starts
        ]

        def decisive(g: dict[str, Any], player_slug: str = slug) -> int:
            stats = g["stats"]
            return int(
                any(float(stats.get(s) or 0) > 0 for s in DECISIVE)
                or (positions.get(player_slug) == "GK" and float(stats.get("clean_sheet_60") or 0) > 0)
            )

        keys = {k for g in starts for k in g["stats"]}
        means = {k: [sum(float(g["stats"].get(k) or 0) for g in starts) / len(starts), 0] for k in keys}
        players[slug] = {
            "pos": positions.get(slug, "MID"),
            "team": "",
            "starts": len(starts),
            "seasonStarts": len(starts),
            "season": means,
            "l10": {},
            "decAll": sum(decisive(g) for g in starts) / len(starts) if starts else 0,
            "form": mission_form.build(games, positions.get(slug, "MID"), before, league=(leagues or {}).get(slug)),
            "cs": 0,
            "pens": 0,
            "last": [
                [
                    float(g.get("score") or 0),
                    "",
                    decisive(g),
                    "H",
                    *[
                        float(g["stats"].get(k) or 0)
                        for k in (
                            "interception_won",
                            "goal_assist",
                            "goals",
                            "ontarget_scoring_att",
                            "won_tackle",
                            "accurate_pass",
                        )
                    ],
                ]
                for g in starts[-10:]
            ],
        }
    return {"asOf": now.isoformat(), "before": before.isoformat(), "players": players}


def build(
    snapshot: dict[str, Any], now: datetime, *, ff: Any = None, scores: Any = None, history: Any = None
) -> dict[str, Any]:
    raw = snapshot["cards"]
    games: dict[str, list[dict[str, Any]]] = {}
    for alias in snapshot.get(
        "missionAliases", ["plan", "past", *[f"a{i}" for i in range(len(snapshot.get("aheadGameweeks", [])))]]
    ):
        for slug, listed in card_games(raw, alias).items():
            games[slug] = sorted(
                {g["id"]: g for g in games.get(slug, []) + listed}.values(), key=lambda g: g["kickoff"]
            )
    cards, _ = read_cards([{**r, "sealed": False, "liveSingleSaleOffer": None, "sentInLiveOffers": []} for r in raw])
    upcoming = {
        s: [g for g in gs if datetime.fromisoformat(g["kickoff"].replace("Z", "+00:00")) > now]
        for s, gs in games.items()
    }
    fs = forecasts(
        player_weeks(
            raw,
            upcoming,
            snapshot["history"],
            now,
            None,
            use_sorare=True,
            ff=ff,
            scores=scores,
            projections=snapshot.get("projections"),
        )
    )
    by_card = {r["slug"]: r for r in raw}
    players = []
    for c in cards:
        f = fs.get(c.player, Forecast(0, 0))
        row = by_card[c.slug]
        reason = (
            "sealed"
            if row.get("sealed")
            else "for sale"
            if row.get("liveSingleSaleOffer")
            else "in an offer"
            if row.get("sentInLiveOffers")
            else None
        )
        players.append(
            {
                "card": c.slug,
                "player": c.player,
                "name": c.name,
                "pos": c.positions[0],
                "rarity": c.rarity,
                "pic": c.picture,
                "avatar": c.avatar,
                "crest": c.club_crest,
                "club": c.club_name,
                "inSeason": c.in_season,
                "cards": 1,
                "p": round(f.p_play, 3),
                "x": 0,
                "average": c.average,
                "eligibility": reason,
                "games": _with_chances(games.get(c.player, []), f),
                **_split_out(f),
            }
        )
    return {
        "generatedAt": now.isoformat(),
        "user": snapshot["user"],
        "players": players,
        "sheets": rolling_sheets(
            history if history is not None else snapshot["history"],
            {c.player: c.positions[0] for c in cards},
            now,
            leagues={
                r["player"]["slug"]: league
                for r in raw
                if (league := (((r["player"].get("activeClub") or {}).get("domesticLeague") or {}).get("slug")))
            },
        ),
        "statsWindow": "Last 5 / 10 appearances and season, before the mission day; starts and substitutes separate",
        "complete": snapshot.get("missionComplete", False),
    }
