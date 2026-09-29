"""His expected goals if he starts: matching a Sorare player to Understat's, and the rate that comes out."""

from __future__ import annotations

from typing import Any

import pytest

from app.sorare import xg
from app.sources.understat import League, Player


def under(
    id: str,
    name: str,
    team: str,
    position: str = "M",
    minutes: float = 360.0,
    npxg: float = 1.0,
    xg_: float | None = None,
) -> Player:
    return Player(
        id=id,
        name=name,
        team=team,
        games=int(minutes // 80),
        minutes=minutes,
        xg=npxg if xg_ is None else xg_,
        npxg=npxg,
        position=position,
    )


def sorare(
    slug: str, name: str, position: str = "Midfielder", club: str = "Real Madrid", league: str = "laliga-es"
) -> dict[str, Any]:
    return {
        "player": {
            "slug": slug,
            "displayName": name,
            "position": position,
            "activeClub": {"name": club, "shortName": club, "domesticLeague": {"slug": league}},
        }
    }


def played(*minutes: int) -> list[dict[str, Any]]:
    """His history, newest first: a start of that many minutes each (0 means he was an unused substitute)."""
    return [
        {
            "date": f"2026-09-{20 - i:02d}T18:00:00Z",
            "played": m > 0,
            "started": m > 0,
            "mins": m or None,
            "status": "FINAL",
        }
        for i, m in enumerate(minutes)
    ]


LEAGUE = League(
    players=[
        under("1", "Arda Güler", "Real Madrid", "M S", 359, 1.9162545),
        under("2", "Vinicius Junior", "Real Madrid", "F", 430, 2.0),
        under("3", "Cristian Romero", "Tottenham", "D", 500, 0.6),
        under("4", "Pablo Torre", "Barcelona", "M", 300, 0.5),
        under("5", "Pablo Torre", "Racing Santander", "M", 320, 0.7),
        under("6", "Raphinha", "Barcelona", "F", 577, 6.827774986624718, 9.057607993483543),
        under("7", "Sub Player", "Real Madrid", "F S", 60, 0.3),
        under("8", "Ansu Fati", "Barcelona,Getafe", "F", 300, 1.0),
        under("9", "Alexander Sørloth", "Atletico Madrid", "F", 400, 2.0),
        under("10", "Fermín López", "Barcelona", "M", 454, 1.5),
        under("11", "Iñaki Williams", "Athletic Club", "F", 406, 1.4),
        under("12", "Nico Williams", "Athletic Club", "F", 368, 1.6),
        under("13", "Rodrigo Riquelme", "Real Betis", "M", 310, 0.9),
        under("14", "Jesús Areso", "Athletic Club", "D", 348, 0.2),
        under("15", "Aleix Febas", "Celta Vigo", "M S", 170, 0.4),
        under("16", "Mariano", "Alaves", "F S", 319, 1.1),
        under("17", "Javier Puado", "Espanyol", "F", 500, 2.5),
        under("18", "Antonio Martínez", "Alaves", "F S", 351, 1.2),
        under("19", "Martín Zubimendi", "Real Sociedad", "S", 400, 0.5),
        under("20", "Roberto Puado", "Getafe", "F", 300, 0.9),
    ],
    team_xg={"Real Madrid": 2.0, "Barcelona": 2.3, "Getafe": 0.9, "Racing Santander": 1.0},
)


# ---------------------------------------------------------------------------------------------------- matching
def test_a_name_matches_with_or_without_its_accents() -> None:
    assert xg.find(sorare("vinicius-junior", "Vinícius Júnior", "Forward"), LEAGUE).id == "2"
    assert xg.find(sorare("arda-guler", "Arda Güler"), LEAGUE).id == "1"


def test_a_longer_name_matches_the_shorter_one_it_contains() -> None:
    # Sorare writes "Cristian Gabriel Romero"; Understat "Cristian Romero".
    assert (
        xg.find(sorare("cristian-gabriel-romero", "Cristian Gabriel Romero", "Defender", "Tottenham"), LEAGUE).id == "3"
    )


def test_two_players_with_one_name_are_told_apart_by_their_club_or_not_matched_at_all() -> None:
    assert xg.find(sorare("pablo-torre", "Pablo Torre", club="Racing Santander"), LEAGUE).id == "5"
    assert xg.find(sorare("pablo-torre", "Pablo Torre", club="FC Barcelona"), LEAGUE).id == "4"
    # A club that is neither: better no number than the wrong player's.
    assert xg.find(sorare("pablo-torre", "Pablo Torre", club="Getafe"), LEAGUE) is None


def test_a_name_nobody_has_is_not_matched_and_a_short_shared_word_is_not_enough() -> None:
    assert xg.find(sorare("nobody", "Nobody Special"), LEAGUE) is None
    assert (
        xg.find(sorare("romero", "Junior", club="Getafe"), LEAGUE) is None
    )  # one shared word is not enough at another club


def test_letters_that_have_no_accent_form_are_written_the_way_sorare_writes_them() -> None:
    # Understat has "Sørloth"; Sorare writes "Sorloth". The letter is not an accent, so it has to be mapped by hand.
    assert xg.find(sorare("sorloth", "Alexander Sorloth", "Forward", "Atlético de Madrid"), LEAGUE).id == "9"
    assert xg.name_key("Sørloth") == xg.name_key("Sorloth") == "sorloth"
    assert xg.name_key("Weiß") == "weiss" and xg.name_key("Łukasz") == "lukasz"


def test_a_name_sorare_shortens_to_one_word_matches_only_a_teammate_it_is_unique_among() -> None:
    # "Fermín" and "Febas" are how Sorare names two players Understat calls "Fermín López" and "Aleix Febas".
    assert xg.find(sorare("fermin", "Fermín", club="FC Barcelona"), LEAGUE).id == "10"
    assert xg.find(sorare("febas", "Febas", club="RC Celta"), LEAGUE).id == "15"
    # Two teammates share the word: nobody is guessed. The same word at a club that has no such player: nobody either.
    assert xg.find(sorare("williams", "Williams", "Forward", "Athletic Club"), LEAGUE) is None
    assert xg.find(sorare("rodrigo", "Rodrigo", club="FC Barcelona"), LEAGUE) is None
    # A defender or a keeper is never taken for a midfielder or forward by a one-word name.
    assert xg.find(sorare("jesus", "Jesús", club="Athletic Club"), LEAGUE) is None


def test_a_name_understat_writes_as_one_word_matches_the_teammate_sorare_gives_two_to() -> None:
    assert xg.find(sorare("mariano-diaz", "Mariano Díaz", "Forward", "D. Alavés"), LEAGUE).id == "16"
    # Not at another club, where the same first name is someone else.
    assert xg.find(sorare("mariano-diaz", "Mariano Díaz", "Forward", "Getafe"), LEAGUE) is None


def test_a_nickname_matches_the_full_first_name_of_a_teammate_with_the_same_surname() -> None:
    assert xg.find(sorare("javi-puado", "Javi Puado", "Forward", "RCD Espanyol de Barcelona"), LEAGUE).id == "17"
    assert (
        xg.find(sorare("toni-martinez", "Toni Martínez", "Forward", "D. Alavés"), LEAGUE).id == "18"
    )  # Toni is Antonio
    # The same nickname and surname at a club that has no such player: nobody, even though another Puado exists.
    assert xg.find(sorare("javi-puado", "Javi Puado", "Forward", "Sevilla"), LEAGUE) is None


def test_a_player_understat_files_as_a_substitute_is_still_a_player_but_a_defender_is_not_taken_for_one() -> None:
    assert (
        xg.find(sorare("zubimendi", "Zubimendi", club="Real Sociedad"), LEAGUE).id == "19"
    )  # Understat's position is "S"
    assert xg.find(sorare("jesus", "Jesús", club="Athletic Club"), LEAGUE) is None  # a pure defender


def test_the_override_list_settles_a_name_that_differs() -> None:
    odd = sorare("fati-ansu", "Anssumane Fati")
    assert xg.find(odd, LEAGUE) is None
    assert xg.find(odd, LEAGUE, overrides={"fati-ansu": "8"}).id == "8"


# ---------------------------------------------------------------------------------------------------- the rate
def test_the_rate_is_his_own_pulled_towards_the_position_norm_and_scaled_by_his_minutes() -> None:
    rows = [sorare("arda-guler", "Arda Güler")]
    made = xg.build(rows, {"arda-guler": played(90, 90, 78, 90, 60)}, {"laliga-es": LEAGUE})["arda-guler"]

    # 359 minutes is 3.99 games; five games of the midfield norm (0.12 a game) are added to his 1.916 npxG.
    rate = (1.9162545 + 0.12 * 5) / (359 / 90 + 5)
    minutes = (90 + 90 + 78 + 90 + 60) / 5 / 90
    assert made["np"] == pytest.approx(rate * minutes, abs=1e-3)
    assert made["pen"] == 0.0  # he takes none: xG and npxG are the same
    assert made["team"] == 2.0  # his team's own average, for scaling the game


def test_a_penalty_taker_keeps_his_penalty_share_apart() -> None:
    rows = [sorare("raphinha", "Raphinha", "Forward", "Barcelona")]
    made = xg.build(rows, {"raphinha": played(90, 90, 80, 90, 90)}, {"laliga-es": LEAGUE})["raphinha"]

    games = 577 / 90
    minutes = (90 + 90 + 80 + 90 + 90) / 5 / 90
    assert made["np"] == pytest.approx((6.827774986624718 + 0.32 * 5) / (games + 5) * minutes, abs=1e-3)
    assert made["pen"] == pytest.approx((9.057607993483543 - 6.827774986624718) / (games + 10) * minutes, abs=1e-3)
    assert made["team"] == 2.3


def test_without_a_start_on_record_he_is_given_eighty_minutes_and_never_more_than_ninety() -> None:
    rows = [sorare("arda-guler", "Arda Güler")]
    none = xg.build(rows, {"arda-guler": played(0, 0)}, {"laliga-es": LEAGUE})["arda-guler"]
    empty = xg.build(rows, {}, {"laliga-es": LEAGUE})["arda-guler"]
    assert none == empty
    rate = (1.9162545 + 0.12 * 5) / (359 / 90 + 5)
    assert none["np"] == pytest.approx(rate * 80 / 90, abs=1e-3)

    over = xg.build(rows, {"arda-guler": played(120, 130)}, {"laliga-es": LEAGUE})["arda-guler"]
    assert over["np"] == pytest.approx(rate, abs=1e-3)  # a full ninety, not a hundred and twenty


def test_a_game_still_to_come_or_a_substitute_appearance_is_not_a_start() -> None:
    rows = [sorare("arda-guler", "Arda Güler")]
    history = [
        {"date": "2026-10-03T18:00:00Z", "played": False, "started": False, "mins": None, "status": "PENDING"},
        {"date": "2026-09-26T18:00:00Z", "played": True, "started": False, "mins": 15, "status": "FINAL"},
        *played(90),
    ]
    made = xg.build(rows, {"arda-guler": history}, {"laliga-es": LEAGUE})["arda-guler"]
    rate = (1.9162545 + 0.12 * 5) / (359 / 90 + 5)
    assert made["np"] == pytest.approx(rate, abs=1e-3)  # his one start, of ninety


def test_only_midfielders_and_forwards_matched_with_enough_minutes_get_a_number() -> None:
    rows = [
        sorare(
            "cristian-gabriel-romero", "Cristian Gabriel Romero", "Defender", "Tottenham"
        ),  # a defender: the tile shows FDR
        sorare("sub-player", "Sub Player", "Forward"),  # 60 minutes: less than a game
        sorare("mbappe", "Kylian Mbappé", "Forward", "Real Madrid", "premier-league-gb-eng"),  # a league nobody fetched
        sorare("nobody", "Nobody Special", "Forward"),
        sorare("keeper", "A Keeper", "Goalkeeper"),
    ]
    assert xg.build(rows, {}, {"laliga-es": LEAGUE}) == {}
    assert xg.build([sorare("arda-guler", "Arda Güler")], {}, {}) == {}  # nothing fetched at all


def test_a_player_who_moved_uses_the_team_that_is_his_club_now() -> None:
    rows = [sorare("ansu-fati", "Ansu Fati", "Forward", "Getafe")]
    assert xg.build(rows, {}, {"laliga-es": LEAGUE})["ansu-fati"]["team"] == 0.9
    rows = [sorare("ansu-fati", "Ansu Fati", "Forward", "FC Barcelona")]
    assert xg.build(rows, {}, {"laliga-es": LEAGUE})["ansu-fati"]["team"] == 2.3
    rows = [sorare("ansu-fati", "Ansu Fati", "Forward", "Sevilla")]  # neither: the last club listed
    assert xg.build(rows, {}, {"laliga-es": LEAGUE})["ansu-fati"]["team"] == 0.9
