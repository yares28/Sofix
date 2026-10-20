"""The Pro rebuild on announced elevens: who plays, when a benched player may take a slot, and the swaps it names (owner, 20 Oct 2026)."""

from __future__ import annotations

from app.jobs.pro_rebuild import bench_allowed, on_elevens, rebuild
from app.sorare import pro
from app.sorare.model import Card
from tests.test_sorare_pro import step

KICKOFF = "2026-10-21T18:00:00Z"
POS = {"gk": "GK", "d1": "DEF", "d2": "DEF", "m1": "MID", "m2": "MID", "m3": "MID", "f1": "FWD", "f2": "FWD"}


def player(slug: str, start: float = 50.0, on: float = 40.0, benched_on: float = 0.3) -> dict:
    game = {"id": f"Game:{slug}", "venue": "H", "kickoff": KICKOFF, "competition": "laliga-es"}
    return {
        "player": slug,
        "p": 0.8,
        "x": start * 0.8,
        "start": start,
        "on": on,
        "benchedOn": benched_on,
        "games": [game],
    }


def comp():
    return pro.competitions(
        [{"title": "LALIGA EA SPORTS", "configSlug": "pro-es", "steps": [step(0, 250, "OPEN", essence=500)]}]
    )[0]


def cards(*slugs: str) -> list[Card]:
    return [Card(slug=f"{s}-card", player=s, name=s, positions=(POS[s],), rarity="limited", in_season=True, level=1, average=50.0,
                 plays_in=frozenset({"laliga-es"})) for s in slugs]  # fmt: skip


def test_elevens_decide_who_plays():
    f = on_elevens([player("gk", start=55), player("m1", on=38, benched_on=0.6), player("f1")], {"gk"}, {"m1"})
    assert (f["gk"].p_play, f["gk"].mu) == (1.0, 55)
    assert (f["m1"].p_play, f["m1"].mu) == (0.6, 38)
    assert f["f1"].p_play == 0.0  # neither in the eleven nor on the bench


def test_a_benched_player_only_where_no_starter_fits_or_he_is_worth_as_much():
    c = comp()
    pool = cards("gk", "d1", "m1", "m2", "f1", "f2")
    starters = {"d1", "m1", "f1"}
    players = [player("gk", on=40, benched_on=0.2), player("d1"), player("m1", start=45), player("m2", on=40, benched_on=0.5),
               player("f1", start=60), player("f2", on=50, benched_on=0.9)]  # fmt: skip
    kept = {card.player for card in bench_allowed(c, pool, on_elevens(players, starters, {"gk", "m2", "f2"}), starters)}
    assert "gk" in kept  # (a) no announced keeper of yours
    assert "m2" not in kept  # (b) 0.5 x 40 = 20 under the starter's 45, in his slot and the extra one
    assert "f2" not in kept  # 0.9 x 50 = 45 under the forward's 60
    worth = [*players[:5], player("f2", on=70, benched_on=0.9)]  # 63 against 60
    assert "f2" in {card.player for card in bench_allowed(c, pool, on_elevens(worth, starters, {"f2"}), starters)}


def test_rebuild_swaps_a_player_left_out_and_names_why():
    slugs = ["gk", "d1", "d2", "m1", "m2", "f1", "f2"]
    collection = [{"slug": f"{s}-card", "player": s, "name": s.upper(), "pos": POS[s], "rarity": "limited", "inSeason": True,
                   "level": 1, "average": 50.0} for s in slugs]  # fmt: skip
    players = [player(s) for s in slugs]
    sofix = {"key": "LALIGA EA SPORTS | Pro", "comp": "LaLiga Pro", "pro": {},
             "starters": [{"player": s, "name": s.upper()} for s in ("gk", "d1", "m1", "f1", "m2")]}  # fmt: skip
    arena = {"key": "Arena", "starters": [{"slug": "d2-card"}], "subs": []}
    # m1 is out of the eleven; d2 is in it but already in an Arena lineup
    starters = {"gk", "d1", "d2", "m2", "f1", "f2"}
    lineups, missing = rebuild([comp()], collection, players, [arena, sofix], starters, set())
    assert not missing
    picked = {c["player"] for c in lineups[0]["starters"]}
    assert picked == {"gk", "d1", "m2", "f1", "f2"}
    assert any(s["out"] == "M1" and s["why"] == "not in the eleven" for s in lineups[0]["swaps"])
