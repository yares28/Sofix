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
            "game_id": f"Game:{club}:{i}",
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


def club_of(
    rows: list[tuple[dict, list[str | None]]],
    owned: frozenset[str] = frozenset(),
    club: str = "Club A",
    *,
    prices: dict | None = None,
    owned_classic: frozenset[str] = frozenset(),
):
    games = {m["slug"]: games_for(club, plays) for m, plays in rows}
    return squads.club(
        club,
        [m for m, _ in rows],
        games,
        LEAGUE,
        NOW,
        owned=owned,
        art={},
        prices=prices or {},
        owned_classic=owned_classic,
    )


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


# ---- Q3: buy-now prices, one classic card, the price record


def offer(eur_cents: int | None = None, usd_cents: int | None = None) -> dict:
    return {
        "liveSingleSaleOffer": {"receiverSide": {"amounts": {"eurCents": eur_cents, "usdCents": usd_cents}}},
        "livePrimaryOffer": None,
    }


def test_buy_now_prices_are_the_cheapest_listings_in_euros_and_the_market_value_when_none_is_listed():
    answer = {
        "players": [
            {
                "slug": "aspas",
                "ins": offer(54),
                "cla": offer(44),
                "commonPlayer": {"a": {"eurCents": 395}, "b": {"eurCents": 14}},
            },
            {"slug": "alonso", "ins": offer(usd_cents=220), "cla": None, "commonPlayer": {"a": {"eurCents": 409}}},
        ],
        "config": {"exchangeRate": {"ethRates": {"eurCents": 150000, "usdCents": 165000}}},
    }
    out = squads.read_prices(answer)
    assert out["aspas"] == {"in": 0.54, "inEst": 3.95, "cl": 0.44}
    assert out["alonso"] == {"in": 2.0, "inEst": 4.09, "cl": None}  # $2.20 at Sorare's rates; no classic listed


def test_the_team_costs_what_its_cards_are_listed_at_and_falls_back_to_the_market_value():
    rows = base_rows()
    prices = {"keeper": {"in": 1.0, "inEst": 5.0, "cl": None}, "back": {"in": None, "inEst": 3.0, "cl": None}}
    c = club_of(rows, prices=prices)
    assert c.players["keeper"].eur == 1.0 and c.players["keeper"].listed
    assert c.players["back"].eur == 3.0 and not c.players["back"].listed
    team = squads.pick(c.pro, budget=100, target=1.0, owned=False)
    assert team.full == 1.0 + 3.0 * 4


def test_one_classic_card_at_most_the_one_that_saves_most():
    # Sorare: an in-season lineup takes at most one classic card. Two cheap classics: only the bigger saving counts.
    rows = base_rows()
    prices = {"back": {"in": 3.0, "inEst": 3.0, "cl": 0.5}, "mid": {"in": 3.0, "inEst": 3.0, "cl": 1.0}}
    c = club_of(rows, prices=prices)
    team = squads.pick(c.pro, budget=100, target=1.0, owned=False)
    assert team.full == 5.0 + 3.0 * 4 - 2.5
    assert squads.classic_of(c, team.cards, owned=False) == "back"


def test_a_classic_card_you_own_fills_the_classic_place_for_nothing():
    rows = base_rows()
    c = club_of(rows, prices={"back": {"in": 3.0, "inEst": 3.0, "cl": 0.5}}, owned_classic=frozenset({"striker"}))
    team = squads.pick(c.pro, budget=100, target=1.0, owned=True)
    assert team.cost == 5.0 + 3.0 * 3  # the striker's classic is yours: one classic place, used by him
    assert squads.classic_of(c, team.cards, owned=True) == "striker"


def test_the_price_record_keeps_one_price_a_player_a_day():
    day1 = squads.record(None, {"aspas": {"in": 0.54, "inEst": 3.95, "cl": 0.44}}, NOW)
    day1 = squads.record(day1, {"aspas": {"in": 0.6, "inEst": 3.95, "cl": 0.44}}, NOW + timedelta(hours=3))  # same day
    day2 = squads.record(day1, {"saka": {"in": None, "inEst": 9.0, "cl": None}}, NOW + timedelta(days=1))
    assert day2["days"] == ["2026-11-24", "2026-11-25"]
    assert day2["in"] == {"aspas": [60, None], "saka": [None, 900]}  # cents; an estimate when nothing is listed
    assert day2["listed"] == {"aspas": [True, None], "saka": [None, False]}
    assert day2["cl"] == {"aspas": [44, None], "saka": [None, None]}


# ---- Q5: the start-of-season pick, from every player's own record last season


LAST = datetime(2025, 9, 6, 16, tzinfo=UTC)  # a Saturday of 2025/26


def test_last_seasons_rounds_are_the_weekends_and_midweeks_most_clubs_played_in():
    games = {f"p{c}": games_for(f"Club {c}", ["S50"] * 3, start=LAST) for c in "ABCD"}
    games["pA"] += games_for("Club A", ["S50"], start=LAST + timedelta(days=25))  # a lone rearranged game, a Wednesday
    rounds = squads.rounds_of(games, LEAGUE, datetime(2025, 7, 1, tzinfo=UTC), datetime(2026, 7, 1, tzinfo=UTC))
    assert len(rounds) == 3


def test_the_start_of_season_team_counts_each_players_own_record_at_any_club_last_season():
    stayed = {s: games_for("Club A", ["S50"] * 6, start=LAST) for s in ("keeper", "back", "mid", "striker")}
    signing = games_for("Club B", ["S70"] * 6, start=LAST)  # started every round for another club
    others = {f"x{c}": games_for(f"Club {c}", ["S40"] * 6, start=LAST) for c in "CD"}
    rows = [m for m, _ in base_rows()[:4]] + [market("signing", "MID", 3.0), market("newboy", "FWD", 1.0)]
    games = {**stayed, "signing": signing, **others}
    block = squads.next_block(LEAGUE, rows, games, NOW, owned=frozenset(), art={}, board=[(320, 0.0, 500)], lines=[])
    assert block is not None and block["record"] == "2025/26" and block["rounds"] == 6
    c = block["clubs"][0]
    assert c["players"]["signing"]["from"] == "Club B"
    assert c["players"]["signing"]["played"] == "S" * 6
    assert [p["slug"] for p in c["newcomers"]] == ["newboy"]  # no LaLiga record: listed, never guessed
    team = next(t for t in c["teams"] if t["id"] == c["pro"]["0.9"]["full"][-1]["id"])
    assert "signing" in team["cards"] and team["cov"] == 1.0
    assert team["proof"] == {"games": 0, "five": 0, "mean": None, "clears": 0}  # nothing of 2026/27 in these rows


def test_the_proof_is_how_last_augusts_pick_did_this_season():
    last = {s: games_for("Club A", ["S50"] * 4, start=LAST) for s in ("keeper", "back", "mid", "striker", "wide")}
    now = {s: games_for("Club A", ["S60", "S60", None]) for s in ("keeper", "back", "mid", "striker", "wide")}
    games = {s: last[s] + now[s] for s in last}
    games |= {f"x{c}": games_for(f"Club {c}", ["S40"] * 4, start=LAST) for c in "BCD"}  # the rest of the league
    block = squads.next_block(
        LEAGUE, [m for m, _ in base_rows()], games, NOW, owned=frozenset(), art={}, board=[(320, 0.0, 500)], lines=[]
    )
    team = next(t for t in block["clubs"][0]["teams"] if t["id"] == block["clubs"][0]["pro"]["0.9"]["full"][-1]["id"])
    assert team["proof"] == {"games": 3, "five": 2, "mean": round(330 * 2 / 3, 1), "clears": 2}  # 5 x 60 + captain


# ---- Q4: two clubs, one team from both, each club's game a try of its round


def five_of(club: str, plays: list[str | None]) -> list[tuple[dict, list[str | None]]]:
    return [
        (market(f"{club[-1].lower()}-{pos.lower()}{i}", pos, 2.0, club=club), plays)
        for i, pos in enumerate(("GK", "DEF", "MID", "FWD", "MID"))
    ]


def clubs_of(*squads_: list[tuple[dict, list[str | None]]]):
    out = []
    for rows in squads_:
        name = rows[0][0]["club"]
        games = {m["slug"]: games_for(name, plays) for m, plays in rows}
        out.append(squads.club(name, [m for m, _ in rows], games, LEAGUE, NOW, owned=frozenset(), art={}))
    return out


def test_two_tries_in_a_round_a_miss_is_forgiven_when_the_next_try_clears():
    board = [(320, 0.0, 500), (360, 5.0, 0)]
    out = squads.ladder([300, 330, 300, 300], board, rounds=[0, 0, 1, 1])
    assert [s["res"] for s in out["path"]] == ["miss", "clear", "miss", "miss"]
    assert out["clears"] == 1 and out["path"][-1]["back"] is True


def test_a_pair_does_not_double_the_team_when_the_second_club_adds_nothing():
    a, b = clubs_of(five_of("Club A", ["S60"] * 6), five_of("Club B", ["S30"] * 6))
    pair = squads.pair_club(a, b)
    team = squads.pick(pair.pro, budget=100, target=1.0, owned=False)
    assert {pair.players[s].mine is not None for s in team.cards} == {True}
    assert all(s.startswith("a-") for s in team.cards) and len(team.cards) == 5


def test_a_pair_covers_the_rounds_each_club_alone_misses():
    a, b = clubs_of(five_of("Club A", ["S60", None] * 3), five_of("Club B", [None, "S50"] * 3))
    assert squads.pick(a.pro, budget=100, target=0.9, owned=False) is None  # alone: five in half the rounds
    pair = squads.pair_club(a, b)
    team = squads.pick(pair.pro, budget=100, target=0.9, owned=False)
    assert team is not None and team.cov == 1.0 and len(team.cards) == 10


def test_the_pairs_blocks_list_every_pair_and_mark_the_other_clubs_games():
    rows = [
        m for m, _ in five_of("Club A", ["S60"] * 4) + five_of("Club B", ["S50"] * 4) + five_of("Club C", ["S40"] * 4)
    ]
    games: dict = {}
    for club_name, plays in (("Club A", ["S60"] * 4), ("Club B", ["S50"] * 4), ("Club C", ["S40"] * 4)):
        games |= {m["slug"]: games_for(club_name, plays) for m, _ in five_of(club_name, plays)}
    picker, details = squads.pairs_blocks(
        LEAGUE, rows, games, NOW, owned=frozenset(), art={}, board=[(320, 0.0, 500)], lines=[]
    )
    json.dumps(picker), json.dumps(details)
    assert len(picker["pairs"]) == 3 and set(details) == {p["id"] for p in picker["pairs"]}
    one = details[squads.pair_id("Club A", "Club B")]["clubs"][0]
    assert one["rounds"] == [0, 0, 1, 1, 2, 2, 3, 3]
    assert one["players"]["a-gk0"]["played"] == "SxSxSxSx"


def test_the_nightly_pairs_take_the_records_last_day_as_prices():
    from app.jobs.squads_pairs import prices_of

    day1 = squads.record(
        None, {"aspas": {"in": 0.54, "inEst": 3.95, "cl": 0.44}, "saka": {"in": None, "inEst": 9.0, "cl": None}}, NOW
    )
    assert prices_of(day1) == {
        "aspas": {"in": 0.54, "inEst": None, "cl": 0.44},
        "saka": {"in": None, "inEst": 9.0, "cl": None},  # nothing listed: the estimate, as the day's search had it
    }
    assert prices_of(None) == {}


def test_the_pairs_game_against_each_other_is_one_try_whose_five_mixes_both_clubs():
    rows_a, rows_b = five_of("Club A", ["S60"] * 2), five_of("Club B", ["S50"] * 2)
    a, b = clubs_of(rows_a, rows_b)
    for x in (a, b):  # game 0: the two clubs meet
        x.games[0]["id"] = "Game:derby"
    pair = squads.pair_club(a, b)
    assert len(pair.games) == 3 and pair.games[0]["club"] == "both"
    assert pair.players["a-gk0"].mine.tolist() == [True, True, False]
    assert pair.players["b-gk0"].mine.tolist() == [True, False, True]


def test_an_in_season_card_scores_its_season_bonus_the_classic_card_does_not_and_the_captain_counts_raw():
    rows = [*base_rows()[:4], (market("wide", "MID", 3.0), ["S80"] * 6)]
    games = {m["slug"]: games_for("Club A", plays) for m, plays in rows}
    c = squads.club("Club A", [m for m, _ in rows], games, LEAGUE, NOW, owned=frozenset(), art={}, season=0.05)
    cards = ("keeper", "back", "mid", "striker", "wide")
    assert squads.series(c, cards)["best"][0] == round(1.05 * (50 * 4 + 80) + 0.5 * 80, 1)
    assert squads.series(c, cards, classic="keeper")["best"][0] == round(1.05 * (50 * 3 + 80) + 50 + 0.5 * 80, 1)
    team = squads.pick(c.pro, budget=100, target=1.0, owned=False)
    assert round(team.mean, 1) == round(1.05 * (50 * 4 + 80) + 0.5 * 80, 1)  # the search counts it the same way


def test_the_step_clock_a_step_started_right_after_a_clear_has_until_the_end_of_the_next_matchday():
    # Sorare's "What is Pro?" (20 Nov 2026): a step must be cleared by the end of the matchday it was started in, with 4
    # lives; one started later in the matchday of a clear has until the end of the following matchday.
    board = [(320, 0.0, 500), (360, 5.0, 0), (380, 10.0, 0)]
    out = squads.ladder([330, 300, 370], board, rounds=[0, 0, 1])
    assert [s["target"] for s in out["path"]] == [320, 360, 360]  # the 360 step lives on into the next matchday
    assert [s["res"] for s in out["path"]] == ["clear", "miss", "clear"] and out["path"][1]["back"] is False
    one = squads.ladder([330, 300, 370], board)  # one club: a try a matchday, a miss fails the step
    assert [s["target"] for s in one["path"]] == [320, 360, 320] and one["path"][1]["back"] is True


def test_four_lives_a_step():
    board = [(320, 0.0, 500), (360, 5.0, 0)]
    out = squads.ladder([330, 300, 300, 300, 300, 330], board, rounds=[0, 0, 0, 0, 0, 0])
    # the 360 step, started after the clear, has four lives: the fourth miss fails it, and the board starts again
    assert [s["target"] for s in out["path"]] == [320, 360, 360, 360, 360, 320]
    assert out["path"][4]["back"] is True and out["clears"] == 2
