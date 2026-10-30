from unittest.mock import Mock

import pytest

from app.config import Settings, settings
from app.jobs import sorare
from app.sorare import play_rewards


def test_a_new_installation_has_no_original_owner(monkeypatch):
    monkeypatch.delenv("SORARE_USER", raising=False)
    assert Settings(_env_file=None).sorare_user == ""


def test_one_explicit_username_configures_this_installation(monkeypatch):
    monkeypatch.setenv("SORARE_USER", "second-manager")
    assert Settings(_env_file=None).sorare_user == "second-manager"


def test_missing_username_stops_collection_before_any_source_or_database_read(monkeypatch):
    monkeypatch.setattr(settings, "sorare_user", "")
    monkeypatch.setattr(settings, "sorare_api_key", "fixture-key")
    db = Mock()
    with pytest.raises(ValueError, match="SORARE_USER"):
        sorare.run(db)
    assert db.mock_calls == []


def test_missing_username_stops_rewards_before_reading_another_manager(monkeypatch):
    from datetime import UTC, datetime

    monkeypatch.setattr(settings, "sorare_user", "")
    db, client = Mock(), Mock()
    with pytest.raises(ValueError, match="SORARE_USER"):
        play_rewards.run(db, client, datetime.now(UTC))
    assert db.mock_calls == []
    assert client.mock_calls == []
