"""Who the dock may offer in place of a starter at risk: only players who can play in that lineup on Sorare (owner, 20 Oct 2026)."""

from __future__ import annotations

from app.sorare import pro
from app.sorare.model import Card, Competition, Forecast
from app.sorare.planner import Lineup
from app.sorare.publish import swap_options

UEL = "europa-league"


def card(player: str, pos: str, league: str, *, in_season: bool = True) -> Card:
    return Card(slug=f"{player}-card", player=player, name=player, positions=(pos,), rarity="limited", in_season=in_season, level=1,
                average=50.0, plays_in=frozenset({league}))  # fmt: skip


def games(*rows: tuple[str, str, str]) -> dict:
    return {player: [{"kickoff": at, "competition": league}] for player, league, at in rows}


CONTENDERS = Competition(
    key="Europa Contenders Pro", slug="ecp", name="Europa Contenders Pro", group="In-season", rarity="limited",
    starters=[("GK",), ("DEF",), ("MID",), ("FWD",), ("DEF", "MID", "FWD")], subs=[], leagues=frozenset({UEL}), min_in_season=4,
    pro_steps=((0, 350, 0.0, 500),),
)  # fmt: skip
STARTERS = [card("radu", "GK", UEL), card("alonso", "DEF", UEL), card("fernandez", "MID", UEL), card("jutgla", "FWD", UEL),
            card("drioueche", "MID", UEL)]  # fmt: skip
SEEN = {c.player: Forecast(p_play=0.8, mu=45.0) for c in STARTERS}


def test_only_players_of_that_competition_are_offered():
    villarreal = card(
        "pau-navarro", "DEF", "laliga-es"
    )  # high start chance, but no Europa League game: not in this competition
    celta = card("mingueza", "DEF", UEL)
    lineup = Lineup(comp=CONTENDERS, starters=list(STARTERS), subs=[], captain=0)
    f = {**SEEN, "pau-navarro": Forecast(0.9, 60.0), "mingueza": Forecast(0.8, 40.0)}
    alts = swap_options(lineup, [lineup], [*STARTERS, villarreal, celta], f)
    assert alts[1] == ["mingueza"]
    assert alts[0] == []  # no other keeper of yours in the Europa League


def test_a_card_used_elsewhere_or_breaking_a_rule_is_not_offered():
    used = card("aspas", "FWD", UEL)
    classic = card("swedberg", "FWD", UEL, in_season=False)  # would leave three in-season cards, the board wants four
    late = card("douvikas", "FWD", UEL)  # his game is the next day: a Pro lineup's games start within the hour
    other = Lineup(comp=CONTENDERS, starters=[used], subs=[], captain=0)
    lineup = Lineup(comp=CONTENDERS, starters=list(STARTERS), subs=[], captain=0)
    one_hour = pro.rules_for(games(*[(c.player, UEL, "2026-10-23T16:45:00+00:00") for c in [*STARTERS, used, classic]],
                                   ("douvikas", UEL, "2026-10-24T19:00:00+00:00")))(CONTENDERS)  # fmt: skip
    f = {**SEEN, **{p: Forecast(0.9, 50.0) for p in ("aspas", "swedberg", "douvikas")}}
    starters = [
        *STARTERS[:4],
        card("x", "MID", UEL, in_season=False),
    ]  # one classic already: the last in-season slot is taken
    tight = Lineup(comp=CONTENDERS, starters=starters, subs=[], captain=0)
    assert swap_options(lineup, [lineup, other], [*STARTERS, used, late], f, one_hour)[3] == []
    assert "swedberg" not in swap_options(tight, [tight], [*starters, classic], {**f, "x": Forecast(0.8, 40.0)})[3]
