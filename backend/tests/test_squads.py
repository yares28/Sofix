"""Squads (plans/squad-prices.md): the club team with the best real score inside a budget that still fields five starters."""

from __future__ import annotations

import json
from datetime import UTC, datetime, timedelta

from app.sorare import squads

NOW = datetime(2026, 11, 24, tzinfo=UTC)
LEAGUE = "laliga-es"


def games_for(club: str, plays: list[str | None], *, start: datetime = datetime(2026, 9, 1, tzinfo=UTC)) -> list[dict]:
    """One player's league games: per game 'S<score>' started, 'B<score>:<mins>' came on, None did not play."""
    out = []
    for i, p in enumerate(plays):
        row = {
            "game_id": f"Game:{i}",
            "date": start + timedelta(days=7 * i),
            "competition": LEAGUE,
            "home": club if i % 2 == 0 else f"Rival {i}",
            "away": f"Rival {i}" if i % 2 == 0 else club,
            "status": "FINAL",
            "started": False,
            "played": False,
            "mins": 0,
            "score": 0.0,
            "sofix_x": None,
        }
        if p and p[0] == "S":
            row.update(started=True, played=True, mins=90, score=float(p[1:]))
        elif p and p[0] == "B":
            score, mins = p[1:].split(":")
            row.update(played=True, mins=int(mins), score=float(score))
        out.append(row)
    return out


def market(slug: str, pos: str, eur: float, club: str = "Club A") -> dict:
    return {
        "slug": slug,
        "name": slug.title(),
        "pos": pos,
        "eur": eur,
        "club": club,
        "crest": f"crest:{club}",
        "pic": None,
    }


def club_of(rows: list[tuple[dict, list[str | None]]], owned: frozenset[str] = frozenset(), club: str = "Club A"):
    games = {m["slug"]: games_for(club, plays) for m, plays in rows}
    return squads.club(club, [m for m, _ in rows], games, LEAGUE, NOW, owned=owned, art={})


ALL = ["S50"] * 6


def base_rows() -> list[tuple[dict, list[str | None]]]:
    return [
        (market("keeper", "GK", 5.0), ALL),
        (market("back", "DEF", 3.0), ALL),
        (market("mid", "MID", 3.0), ALL),
        (market("striker", "FWD", 3.0), ALL),
        (market("wide", "MID", 3.0), ALL),
    ]


def test_the_team_is_the_best_score_inside_the_budget_not_the_cheapest():
    # A star who starts as often as the cheap defender: inside €30 he replaces him, inside €17 he does not fit.
    rows = [*base_rows(), (market("star", "DEF", 12.0), ["S90"] * 6)]
    c = club_of(rows)
    rich = squads.pick(c.pro, budget=30, target=0.9, owned=False)
    poor = squads.pick(c.pro, budget=17, target=0.9, owned=False)
    assert "star" in rich.cards and rich.mean > poor.mean
    assert "star" not in poor.cards and poor.cost <= 17


def test_a_game_without_five_starters_scores_nothing_and_misses_the_coverage():
    rows = base_rows()
    rows[3] = (market("striker", "FWD", 3.0), ["S50", "S50", "S50", "S50", "S50", None])  # no forward in game 6
    c = club_of(rows)
    full = squads.pick(c.pro, budget=100, target=0.0, owned=False)
    assert full.cov == 5 / 6
    assert squads.series(c, full.cards)["best"][5] is None
    assert squads.pick(c.pro, budget=100, target=0.9, owned=False) is None  # no one else can play up front


def test_a_rotating_forward_pair_covers_what_neither_covers_alone():
    rows = base_rows()[:3] + [
        (market("wide", "MID", 3.0), ALL),
        (market("fwd1", "FWD", 3.0), ["S50", None, "S50", None, "S50", None]),
        (market("fwd2", "FWD", 3.0), [None, "S50", None, "S50", None, "S50"]),
    ]
    team = squads.pick(club_of(rows).pro, budget=100, target=1.0, owned=False)
    assert team is not None and {"fwd1", "fwd2"} <= set(team.cards)


def test_the_captain_adds_half_of_the_best_score():
    rows = [*base_rows()[:4], (market("wide", "MID", 3.0), ["S80"] * 6)]
    c = club_of(rows)
    team = squads.pick(c.pro, budget=100, target=1.0, owned=False)
    assert squads.series(c, team.cards)["best"][0] == 50 * 4 + 80 + 0.5 * 80


def test_cards_you_own_cost_nothing_when_they_count():
    rows = [*base_rows(), (market("star", "DEF", 12.0), ["S90"] * 6)]
    c = club_of(rows, owned=frozenset({"star"}))
    team = squads.pick(c.pro, budget=17, target=0.9, owned=True)
    assert "star" in team.cards and team.cost <= 17
    assert team.full > team.cost  # the price of all its cards is still shown


def test_a_player_counts_only_his_games_for_this_club():
    rows = base_rows()
    games = {m["slug"]: games_for("Club A", plays) for m, plays in rows}
    games["mover"] = games_for("Club B", ["S90"] * 3) + games_for(
        "Club A", ["S40"] * 3, start=datetime(2026, 9, 1, tzinfo=UTC) + timedelta(days=21)
    )
    c = squads.club(
        "Club A", [m for m, _ in rows] + [market("mover", "FWD", 3.0)], games, LEAGUE, NOW, owned=frozenset(), art={}
    )
    assert len(c.games) == 6
    assert c.players["mover"].starts.sum() == 3 and max(c.players["mover"].scores) == 40


def test_an_arena_sub_comes_in_only_for_a_player_who_did_not_play():
    rows = base_rows()[:4] + [
        (market("wide", "MID", 3.0), ["S50", "B10:20", None, "S50", "S50", "S50"]),
        (market("bench", "MID", 3.0), ["S60"] * 6),
    ]
    c = club_of(rows)
    seven = squads.Seven(gk="keeper", outs=("back", "mid", "striker", "wide"), gsub=None, osub="bench")
    s = squads.arena_series(c, seven)
    assert s["subIn"] == [False, False, True, False, False, False]
    # game 2: the one who came on keeps his 10; game 3: the sub's 60 replaces the one who did not play
    assert s["best"][1] == 50 * 3 + 50 + 10 + 0.5 * 50
    assert s["best"][2] == 50 * 4 + 60 + 0.5 * 60


def test_the_pro_ladder_climbs_on_a_clear_and_goes_back_to_the_first_step_on_a_miss():
    board = [(320, 0.0, 500), (360, 5.0, 0), (380, 10.0, 0)]
    out = squads.ladder([330, 370, 300, 330, None, 370], board)
    assert [step["res"] for step in out["path"]] == ["clear", "clear", "miss", "clear", "skip", "clear"]
    assert [step["target"] for step in out["path"]] == [320, 360, 380, 320, 360, 360]
    assert out["clears"] == 4 and out["cash"] == 10.0 and out["essence"] == 1000


def test_the_league_block_is_json_and_lists_each_target_and_both_prices():
    rows = [*base_rows(), (market("star", "DEF", 12.0), ["S90"] * 6)]
    games = {m["slug"]: games_for("Club A", plays) for m, plays in rows}
    block = squads.league_block(
        LEAGUE, [m for m, _ in rows], games, NOW, owned=frozenset({"star"}), art={}, board=[(320, 0.0, 500)], lines=[]
    )
    json.dumps(block)
    entry = block["clubs"][0]
    assert entry["club"] == "Club A" and len(entry["games"]) == 6
    for target in squads.TARGETS:
        assert set(entry["pro"][str(target)]) == {"full", "owned"}
    ids = {t["id"] for t in entry["teams"]}
    assert all(e["id"] in ids for lane in entry["pro"]["0.9"].values() for e in lane)
    # cheapest first; with the star owned, the team with him costs no more than without
    lane = entry["pro"]["0.9"]["owned"]
    assert [e["from"] for e in lane] == sorted(e["from"] for e in lane)
    first = next(t for t in entry["teams"] if t["id"] == lane[-1]["id"])
    assert "star" in first["cards"] and set(first["cards"]) <= set(entry["players"])
    assert set(first) >= {
        "cards",
        "full",
        "toBuy",
        "mean",
        "cov",
        "best",
        "median",
        "average",
        "xsReal",
        "xsExp",
        "ladder",
    }
