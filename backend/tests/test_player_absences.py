# ruff: noqa: F811
from dataclasses import replace
from datetime import timedelta

from sqlalchemy import select

from app.models import PlayerAbsence
from app.sorare import ff_feed
from app.sources import futbolfantasy_matches as ffm
from tests.test_ff_feed import NOW, Site
from tests.test_ff_link import match, player, side
from tests.test_pipeline import db  # noqa: F401


def reading(kind="out", present=True):
    person = replace(player("123", "Someone"), slug="someone", lesion=-1)
    absence = ffm.Absence(kind, "Someone", "someone", "Hamstring", None, None)
    return match(
        side("Home", "1", xi=(person,) if present else (), absences=(absence,) if kind else ()),
        side("Away", "2"),
        NOW + timedelta(days=3),
    )


def test_fresh_absence_extends_a_spell_failure_does_not_and_return_closes_it(db):
    ff_feed.refresh(db, [], NOW, reader=Site([reading()]))
    spell = db.scalar(select(PlayerAbsence))
    assert spell is not None and spell.ff_id == "123" and spell.kind == "out" and spell.cause == "Hamstring"
    ff_feed.refresh(db, [], NOW + timedelta(hours=1), reader=Site([reading()]))
    db.refresh(spell)
    assert spell.last_seen.replace(tzinfo=NOW.tzinfo) == NOW + timedelta(hours=1)
    ff_feed.refresh(db, [], NOW + timedelta(hours=2), reader=Site([], failed=["page"]))
    db.refresh(spell)
    assert spell.back is None and spell.last_seen.replace(tzinfo=NOW.tzinfo) == NOW + timedelta(hours=1)
    ff_feed.refresh(db, [], NOW + timedelta(hours=3), reader=Site([reading(None, present=False)]))
    db.refresh(spell)
    assert spell.back is None, "vanishing from a page is not proof he returned"
    ff_feed.refresh(db, [], NOW + timedelta(hours=4), reader=Site([reading(None)]))
    db.refresh(spell)
    assert spell.back.replace(tzinfo=NOW.tzinfo) == NOW + timedelta(hours=4)
    ff_feed.refresh(db, [], NOW + timedelta(hours=5), reader=Site([reading()]))
    assert len(list(db.scalars(select(PlayerAbsence)))) == 2


def test_absent_only_profile_survives_until_linked_and_read_only_refresh_does_not_write(db):
    from app.services.publish import put
    from app.sorare import ff_link

    ff_feed.refresh(db, [], NOW, reader=Site([reading(present=False)]), write=False)
    assert db.scalar(select(PlayerAbsence)) is None
    ff_feed.refresh(db, [], NOW, reader=Site([reading(present=False)]))
    put(db, ff_link.KEPT_KEY, {"links": {"sorare-player": {"ffId": "123", "slug": "someone"}}}, NOW)
    ff_feed.refresh(db, [], NOW + timedelta(hours=1), reader=Site([reading()]))
    spells = list(db.scalars(select(PlayerAbsence)))
    assert len(spells) == 1 and spells[0].ff_id == "123" and spells[0].player == "sorare-player"


def test_out_becoming_doubtful_is_one_spell_until_a_report_of_availability(db):
    ff_feed.refresh(db, [], NOW, reader=Site([reading()]))
    ff_feed.refresh(db, [], NOW + timedelta(hours=1), reader=Site([reading("doubt")]))
    spells = list(db.scalars(select(PlayerAbsence)))
    assert len(spells) == 1 and spells[0].kind == "doubt" and spells[0].back is None


def test_a_profile_keeps_its_shirt_id_without_a_sorare_link_and_stale_reads_cannot_reopen_it(db):
    from app.sorare import player_absences

    ff_feed.refresh(db, [], NOW, reader=Site([reading()]))
    ff_feed.refresh(db, [], NOW + timedelta(hours=1), reader=Site([reading(present=False)]))
    spells = list(db.scalars(select(PlayerAbsence)))
    assert len(spells) == 1 and spells[0].ff_id == "123"
    ff_feed.refresh(db, [], NOW + timedelta(hours=3), reader=Site([reading(None)]))
    player_absences.observe(db, [reading()], NOW + timedelta(hours=2))
    db.commit()
    assert len(list(db.scalars(select(PlayerAbsence)))) == 1
    assert spells[0].back is not None
