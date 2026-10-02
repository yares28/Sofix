"""A real Sorare card for every LaLiga player, owned or not (owner's rule, 2 Oct 2026).

Sorare's public card listing (`allCards`) returns a minted Limited card of a player whoever owns it, with the same picture as
the owner's own cards. The job keeps one picture address per player, asks only for the ones it lacks, and links each page's
people to the roster by name so the Lineups page can draw every player as a card.
"""

from __future__ import annotations

import re
from datetime import UTC, datetime, timedelta
from typing import Any

import pytest
from sqlalchemy.orm import Session

from app.models import ReadModel
from app.sorare import card_art, ff_lineups, ff_use
from app.sorare.client import SorareError
from tests.test_ff_lineups import BEFORE, built, find, real, sides  # noqa: F401  (fixtures and helpers)
from tests.test_ff_use import NOW, feed_of  # noqa: F401
from tests.test_pipeline import db  # noqa: F401  (fixture)

DAY = datetime(2026, 10, 2, 9, tzinfo=UTC)


def node(
    slug: str, name: str, club: str = "Real Sociedad", born: str = "1996-04-01", position: str = "Midfielder"
) -> dict[str, Any]:
    return {
        "slug": slug,
        "displayName": name,
        "position": position,
        "birthDay": born,
        "activeClub": {"slug": club.lower().replace(" ", "-"), "name": club, "shortName": club},
    }


class FakeSorare:
    """Answers the three questions the module asks: the clubs, a club's players, and the cards of some players."""

    def __init__(self, squads: dict[str, list[dict[str, Any]]], cards: dict[str, str | None]) -> None:
        self.squads, self.cards, self.asked = squads, cards, []

    def query(self, text: str, variables: dict[str, Any] | None = None) -> dict[str, Any]:
        self.asked.append(text)
        if "clubs" in text and "nodes { slug }" in text:
            return {"football": {"competition": {"clubs": {"nodes": [{"slug": club} for club in self.squads]}}}}
        if "activePlayers" in text:
            club = (variables or {}).get("s")
            return {
                "football": {
                    "club": {
                        "activePlayers": {
                            "pageInfo": {"hasNextPage": False, "endCursor": None},
                            "nodes": self.squads[club],
                        }
                    }
                }
            }
        if "allCards" in text:
            wanted = re.findall(r'(p\d+): allCards\(playerSlugs: \["([a-z0-9-]+)"\]', text)
            out = {}
            for alias, slug in wanted:
                url = self.cards.get(slug)
                out[alias] = {"nodes": [{"pictureUrl": url}] if url else []}
            return {"football": out}
        raise AssertionError(text)


def squads() -> dict[str, list[dict[str, Any]]]:
    return {
        "real-sociedad": [
            node("mikel-oyarzabal-ugarte", "Oyarzabal"),
            node("igor-zubeldia", "Zubeldia", position="Defender"),
        ],
        "deportivo": [node("mikel-balenziaga", "Balenziaga", club="Deportivo", position="Defender")],
    }


CARDS = {
    "mikel-oyarzabal-ugarte": "https://assets.sorare.com/card/aaa/picture/oyarzabal.png",
    "igor-zubeldia": "https://assets.sorare.com/card/bbb/picture/zubeldia.png",
    "mikel-balenziaga": None,  # Sorare has no card of him this season
}


# ------------------------------------------------------------------------------------------------ the questions
def test_one_aliased_question_asks_for_one_limited_card_of_the_season_per_player() -> None:
    text = card_art.art_query(["a-b", "c-d"], 2026)

    assert text.count("allCards") == 2
    assert 'p0: allCards(playerSlugs: ["a-b"], rarities: [limited], seasonStartYears: [2026], first: 1)' in text
    assert 'p1: allCards(playerSlugs: ["c-d"]' in text


def test_a_slug_that_is_not_a_slug_is_never_put_in_a_question() -> None:
    with pytest.raises(ValueError):
        card_art.art_query(['x"] ) { evil } #'], 2026)


def test_the_answer_is_read_back_by_alias_and_a_player_with_no_card_is_none() -> None:
    answer = {"p0": {"nodes": [{"pictureUrl": "https://assets.sorare.com/card/x.png"}]}, "p1": {"nodes": []}}

    assert card_art.read_art(answer, ["a", "b"]) == {"a": "https://assets.sorare.com/card/x.png", "b": None}


def test_a_picture_that_is_not_sorares_is_not_kept() -> None:
    answer = {"p0": {"nodes": [{"pictureUrl": "https://evil.example/x.png"}]}}

    assert card_art.read_art(answer, ["a"]) == {"a": None}


def test_the_season_opens_in_july() -> None:
    assert card_art.season_of(datetime(2026, 10, 2, tzinfo=UTC)) == 2026
    assert card_art.season_of(datetime(2027, 3, 1, tzinfo=UTC)) == 2026
    assert card_art.season_of(datetime(2027, 7, 1, tzinfo=UTC)) == 2027


# ---------------------------------------------------------------------------------------------------- the refresh
def test_the_first_run_reads_every_squad_then_every_card_and_keeps_them(db: Session) -> None:  # noqa: F811
    client = FakeSorare(squads(), CARDS)
    art = card_art.refresh(db, client, DAY)

    assert art.urls == {
        "mikel-oyarzabal-ugarte": CARDS["mikel-oyarzabal-ugarte"],
        "igor-zubeldia": CARDS["igor-zubeldia"],
    }
    assert {w.slug for w in art.wanted} == set(art.urls), "only a player with a picture is worth linking"
    stored = db.get(ReadModel, card_art.ART_KEY)
    assert stored is not None and stored.payload["season"] == 2026
    assert stored.payload["players"]["mikel-balenziaga"]["url"] is None


def test_a_second_run_the_same_day_asks_nothing(db: Session) -> None:  # noqa: F811
    card_art.refresh(db, FakeSorare(squads(), CARDS), DAY)
    again = FakeSorare(squads(), CARDS)
    art = card_art.refresh(db, again, DAY + timedelta(hours=3))

    assert again.asked == []
    assert set(art.urls) == {"mikel-oyarzabal-ugarte", "igor-zubeldia"}


def test_a_new_player_in_a_squad_is_asked_for_alone_after_the_roster_is_read_again(db: Session) -> None:  # noqa: F811
    card_art.refresh(db, FakeSorare(squads(), CARDS), DAY)
    bigger = squads()
    bigger["real-sociedad"].append(node("new-signing-slug", "New Signing"))
    client = FakeSorare(bigger, {**CARDS, "new-signing-slug": "https://assets.sorare.com/card/ccc/picture/new.png"})
    art = card_art.refresh(db, client, DAY + timedelta(days=1))

    asked = [text for text in client.asked if "allCards" in text]
    assert len(asked) == 1 and "new-signing-slug" in asked[0] and "oyarzabal" not in asked[0]
    assert art.urls["new-signing-slug"].endswith("new.png")


def test_a_player_with_no_card_is_asked_again_after_two_days_and_not_before(db: Session) -> None:  # noqa: F811
    card_art.refresh(db, FakeSorare(squads(), CARDS), DAY)
    soon = FakeSorare(squads(), CARDS)
    card_art.refresh(db, soon, DAY + timedelta(days=1))
    assert not [text for text in soon.asked if "allCards" in text], "one day later he is not asked for again"

    later = FakeSorare(
        squads(), {**CARDS, "mikel-balenziaga": "https://assets.sorare.com/card/ddd/picture/balenziaga.png"}
    )
    art = card_art.refresh(db, later, DAY + timedelta(days=3))
    assert art.urls["mikel-balenziaga"].endswith("balenziaga.png")


def test_a_new_season_forgets_the_old_pictures(db: Session) -> None:  # noqa: F811
    card_art.refresh(db, FakeSorare(squads(), CARDS), DAY)
    fresh = FakeSorare(
        squads(), {"mikel-oyarzabal-ugarte": "https://assets.sorare.com/card/eee/picture/new-season.png"}
    )
    art = card_art.refresh(db, fresh, datetime(2027, 8, 1, tzinfo=UTC))

    assert art.urls == {"mikel-oyarzabal-ugarte": "https://assets.sorare.com/card/eee/picture/new-season.png"}


def test_a_squad_that_cannot_be_read_keeps_the_roster_of_before(db: Session) -> None:  # noqa: F811
    card_art.refresh(db, FakeSorare(squads(), CARDS), DAY)

    class Broken(FakeSorare):
        def query(self, text: str, variables: dict[str, Any] | None = None) -> dict[str, Any]:
            raise SorareError("down")

    art = card_art.refresh(db, Broken({}, {}), DAY + timedelta(days=1))
    assert set(art.urls) == {"mikel-oyarzabal-ugarte", "igor-zubeldia"}, "what was kept still draws"


def test_nothing_is_known_when_nothing_was_ever_read(db: Session) -> None:  # noqa: F811
    class Broken(FakeSorare):
        def query(self, text: str, variables: dict[str, Any] | None = None) -> dict[str, Any]:
            raise SorareError("down")

    art = card_art.refresh(db, Broken({}, {}), DAY)
    assert art.urls == {} and art.wanted == []


# --------------------------------------------------------------------------------------------- on the Lineups page
def test_a_player_the_owner_does_not_have_is_linked_to_his_card_by_name(real: list) -> None:  # noqa: F811
    art = card_art.Art(
        wanted=[card_art.wanted_of("igor-zubeldia", "Zubeldia", "1997-04-12", "Defender", ["Real Sociedad"])],
        urls={"igor-zubeldia": "https://assets.sorare.com/card/bbb/picture/zubeldia.png"},
    )
    out = built_with(real, art)
    zubeldia = next(p for r in find(out, 22502)["home"]["rows"] for p in r["players"] if p["name"] == "Igor Zubeldia")

    assert out["art"][zubeldia["id"]] == "https://assets.sorare.com/card/bbb/picture/zubeldia.png"


def test_a_player_with_no_picture_has_no_entry_and_the_payload_without_art_has_none(real: list) -> None:  # noqa: F811
    assert "art" not in built(real) or built(real)["art"] == {}
    art = card_art.Art(
        wanted=[card_art.wanted_of("someone-else", "Someone Else", None, "Forward", ["Elsewhere"])], urls={}
    )
    assert built_with(real, art)["art"] == {}


def built_with(real: list, art: card_art.Art) -> dict[str, Any]:  # noqa: F811
    feed = feed_of(real)
    lineups = ff_use.Lineups(feed, [], NOW)
    return ff_lineups.payload(feed, lineups, [], {}, BEFORE, art)
