# ruff: noqa: F811
from datetime import UTC, datetime, timedelta

from app.models import ReadModel
from app.services.publish import put
from app.sorare import play_rewards
from app.sorare.client import SorareClient
from tests.test_frozen_scores import keep
from tests.test_pipeline import db  # noqa: F401

NOW = datetime(2026, 10, 25, 18, tzinfo=UTC)


def test_reward_receipts_keep_every_type_and_separate_units():
    configs = [
        {"__typename": "MonetaryRewardConfig", "amount": {"usdCents": 250}},
        {"__typename": "CardShardRewardConfig", "rarity": "limited", "quantity": 100},
        {"__typename": "CardShardRewardConfig", "rarity": "rare", "quantity": 20},
        {"__typename": "InGameCurrencyRewardConfig", "currency": "FOOTBALL_XP", "amount": 500},
        {"__typename": "CardRewardConfig", "rarity": "rare"},
    ]
    assert play_rewards.reward_amounts(configs, "laliga") == {
        "cash:USD": 2.5,
        "essence:limited:laliga": 100,
        "essence:rare:laliga": 20,
        "xp:FOOTBALL_XP": 500,
        "card:rare": 1,
    }


def test_clock_waits_for_all_games_then_an_hour_and_handles_rescheduling():
    games = [
        {"id": "a", "date": (NOW - timedelta(hours=2)).isoformat(), "statusTyped": "played"},
        {"id": "b", "date": (NOW - timedelta(hours=2)).isoformat(), "statusTyped": "playing"},
    ]
    assert not play_rewards.finished_clock(games, {}, NOW)[0]
    games[1]["statusTyped"] = "played"
    ready, state = play_rewards.finished_clock(games, {}, NOW)
    assert not ready
    assert state["finishedObservedAt"] == NOW.isoformat()
    assert play_rewards.finished_clock(games, state, NOW + timedelta(minutes=59))[0] is False
    assert play_rewards.finished_clock(games, state, NOW + timedelta(hours=1))[0] is True
    games[1]["statusTyped"] = "scheduled"
    assert "finishedObservedAt" not in play_rewards.finished_clock(games, state, NOW + timedelta(hours=1))[1]
    assert not play_rewards.finished_clock([], {}, NOW)[0]


def test_the_clock_covers_both_sides_and_the_bench_without_waiting_for_unrelated_games():
    plan = {
        "playing": {
            "players": [
                {"player": p, "games": [{"id": g}]} for p, g in (("mine", "g1"), ("starter", "g2"), ("bench", "g3"))
            ]
        }
    }
    best = {"lineups": [{"starters": [{"player": "starter"}], "subs": [{"player": "bench"}]}]}
    saved = {"lineups": [{"draft": False, "cards": [{"player": "mine"}]}]}
    games = [{"id": f"g{i}"} for i in range(1, 5)]
    assert play_rewards.watched_games(plan, best, saved, games) == games[:3]
    saved["lineups"][0]["cards"].append({"player": "unknown"})
    assert play_rewards.watched_games(plan, best, saved, games) == games


def test_received_zero_requires_closed_fixture_and_matching_ranking():
    raw = {
        "id": "a",
        "draft": False,
        "so5Fixture": {"slug": "gw"},
        "so5Leaderboard": {"slug": "board"},
        "so5Rankings": [{"ranking": 20, "score": 100, "so5Leaderboard": {"slug": "board"}, "so5Rewards": []}],
    }
    assert play_rewards.receipt(raw, "gw", False, "laliga") is None
    assert play_rewards.receipt(raw, "gw", True, "laliga") == {}
    assert play_rewards.receipt(raw, "other-gw", True, "laliga") is None
    raw["so5Rankings"][0]["ranking"] = None
    assert play_rewards.receipt(raw, "gw", True, "laliga") is None


def test_pro_uses_its_success_state_reward_multiplier_and_selected_game_dates():
    raw = {
        "id": "task",
        "draft": False,
        "aasmState": "SUCCESSFUL",
        "rewardMultiplier": 1.02,
        "user": {"slug": "owner"},
        "taskAppearances": [{"game": {"date": NOW.isoformat()}}],
        "step": {"rewardConfigs": [{"__typename": "CardShardRewardConfig", "rarity": "limited", "quantity": 100}]},
    }
    info = {"start": (NOW - timedelta(days=1)).isoformat(), "end": (NOW + timedelta(days=1)).isoformat()}
    assert play_rewards.task_receipt(raw, info, "owner", "champion") == {"essence:limited:champion": 102}
    assert play_rewards.task_receipt(raw, info, "someone-else", "champion") is None
    assert (
        play_rewards.task_receipt(raw, {**info, "start": (NOW + timedelta(hours=1)).isoformat()}, "owner", "champion")
        is None
    )
    raw["aasmState"] = "FAILED"
    assert play_rewards.task_receipt(raw, info, "owner", "champion") == {}
    raw["aasmState"] = "IN_PROGRESS"
    assert play_rewards.task_receipt(raw, info, "owner", "champion") is None


def test_pro_counterfactual_uses_the_saved_step_and_boost_not_arena_rank_cutoffs():
    raw = {
        "pro": {"target": 300, "boost": 1.02},
        "rarity": "limited",
        "kind": "champion",
        "tiers": [{"cash": 0, "essence": 100}],
    }
    assert play_rewards.pro_replayed_reward(raw, 301) == {"cash:USD": 0, "essence:limited:champion": 102}
    assert play_rewards.pro_replayed_reward(raw, 299) == {}
    assert play_rewards.pro_replayed_reward(raw, None) is None


def test_replay_requires_every_actual_cutoff_and_never_uses_projected_thresholds():
    tiers = [
        {"toRank": 1, "rewardConfigs": [{"__typename": "MonetaryRewardConfig", "amount": {"usdCents": 500}}]},
        {
            "toRank": 5,
            "rewardConfigs": [{"__typename": "InGameCurrencyRewardConfig", "currency": "FOOTBALL_XP", "amount": 100}],
        },
    ]
    assert play_rewards.replayed_reward(450, tiers, {"1": 500}, "laliga") is None
    assert play_rewards.replayed_reward(450, tiers, {"1": 500, "5": 400}, "laliga") == {"xp:FOOTBALL_XP": 100}
    assert play_rewards.replayed_reward(0, tiers, {"1": 500, "5": 400}, "laliga") == {}
    assert play_rewards.replayed_reward(None, tiers, {"1": 500, "5": 400}, "laliga") is None


def test_an_unentered_room_has_no_assigned_opponents_and_never_borrows_global_cutoffs(db):
    keep(db)
    plan = db.get(ReadModel, "sorare_plan:gw").payload
    plan["plans"][0]["lineups"][0]["group"] = "Room"
    put(db, "sorare_plan:gw", plan, NOW)
    source = Source()
    play_rewards.run(db, source, NOW)
    play_rewards.run(db, source, NOW + timedelta(hours=1))
    line = db.get(ReadModel, "play_rewards:gw").payload["sofix"][0]
    assert line["rewards"] is None and line["unavailable"] is True
    assert not any("PlayRewardCutoffs" in query for query, _ in source.questions)


class Source(SorareClient):
    def __init__(self):
        self.questions = []
        self.cents = 250

    def query(self, query, variables=None):
        self.questions.append((query, variables))
        if "PlayRewardGames" in query:
            return {
                "so5": {
                    "so5Fixture": {
                        "slug": "gw",
                        "aasmState": "closed",
                        "games": [{"id": "g", "date": (NOW - timedelta(hours=2)).isoformat(), "statusTyped": "played"}],
                    }
                }
            }
        if "PlayRewardEntries" in query:
            nodes = [{"id": "So5Lineup:team"}] if not variables["a"] else []
            return {
                "so5": {
                    "so5Fixture": {
                        "slug": "gw",
                        "so5LineupsPaginated": {
                            "nodes": nodes,
                            "pageInfo": {"hasNextPage": not variables["a"], "endCursor": "next"},
                        },
                    }
                }
            }
        if "PlayRewardReceipt" in query:
            return {
                "so5": {
                    "so5Lineup": {
                        "id": "So5Lineup:team",
                        "draft": False,
                        "so5Fixture": {"slug": "gw"},
                        "so5Leaderboard": {"slug": "b"},
                        "so5Rankings": [
                            {
                                "ranking": 2,
                                "so5Leaderboard": {"slug": "b"},
                                "so5Rewards": [
                                    {
                                        "rewardConfigs": [
                                            {"__typename": "MonetaryRewardConfig", "amount": {"usdCents": self.cents}},
                                            {
                                                "__typename": "InGameCurrencyRewardConfig",
                                                "amount": 500,
                                                "currency": "LIMITED_XP",
                                            },
                                        ]
                                    }
                                ],
                            }
                        ],
                    }
                }
            }
        if "PlayRewardCutoffs" in query:
            return {
                "so5": {
                    "so5Leaderboard": {
                        "slug": "b",
                        "so5Fixture": {"slug": "gw"},
                        "so5LineupsCount": 50,
                        "rewardsConfig": {
                            "ranking": [
                                {
                                    "toRank": 1,
                                    "rewardConfigs": [
                                        {"__typename": "MonetaryRewardConfig", "amount": {"usdCents": 500}}
                                    ],
                                }
                            ]
                        },
                    }
                }
            }
        return {"so5": {"so5Leaderboard": {"so5RankingsPaginated": {"so5Rankings": [{"ranking": 1, "score": 180}]}}}}


def test_automatic_cold_start_pagination_no_browser_idle_and_correction(db, monkeypatch):
    keep(db)
    source = Source()
    assert play_rewards.run(db, source, NOW) == 1
    assert len(source.questions) == 1  # observes the finish; no reward reads before the hour
    assert play_rewards.run(db, source, NOW + timedelta(minutes=59)) == 0
    assert len(source.questions) == 1
    assert play_rewards.run(db, source, NOW + timedelta(hours=1)) == 1
    page = db.get(ReadModel, "play_rewards:gw").payload
    assert page["you"] == [{"id": "So5Lineup:team", "rewards": {"cash:USD": 2.5, "xp:LIMITED_XP": 500}}]
    assert page["sofix"][0]["rewards"] == {"cash:USD": 5}
    assert page["state"] == "checked"
    assert sum("PlayRewardEntries" in q for q, _ in source.questions) == 2  # every page is included
    questions = len(source.questions)
    with monkeypatch.context() as guard:
        guard.setattr(play_rewards, "_catalog", lambda *_: (_ for _ in ()).throw(AssertionError("idle catalog read")))
        assert play_rewards.run(db, source, NOW + timedelta(hours=2)) == 0
    assert len(source.questions) == questions
    source.cents = 400
    assert play_rewards.run(db, source, NOW + timedelta(hours=25)) == 1
    assert db.get(ReadModel, "play_rewards:gw").payload["you"][0]["rewards"]["cash:USD"] == 4
    assert db.get(ReadModel, play_rewards.CLOCK).payload["weeks"]["gw"]["final"] is True


def test_failed_source_retries_without_replacing_known_rewards(db):
    keep(db)
    put(db, "play_rewards:gw", {"slug": "gw", "you": [{"id": "kept", "rewards": {"cash:USD": 5}}]}, NOW)

    class Missing(Source):
        def query(self, query, variables=None):
            from app.sorare.client import SorareError

            raise SorareError("Unavailable")

    assert play_rewards.run(db, Missing(), NOW) == 1
    assert db.get(ReadModel, "play_rewards:gw").payload["you"][0]["rewards"] == {"cash:USD": 5}
    assert (
        db.get(ReadModel, play_rewards.CLOCK).payload["weeks"]["gw"]["at"] == (NOW + timedelta(minutes=30)).isoformat()
    )


def test_legacy_unfinished_clock_is_rechecked_without_waiting_for_an_unrelated_game(db):
    keep(db)
    put(
        db,
        play_rewards.CLOCK,
        {
            "version": 1,
            "inputs": play_rewards._inputs(db),
            "at": (NOW + timedelta(days=2)).isoformat(),
            "weeks": {
                "gw": {
                    "at": (NOW + timedelta(days=2)).isoformat(),
                    "inputVersion": play_rewards._catalog(db)["gw"]["inputVersion"],
                    "games": "older-fixture-wide-clock",
                }
            },
        },
        NOW,
    )
    source = Source()
    assert play_rewards.run(db, source, NOW) == 1
    clock = db.get(ReadModel, play_rewards.CLOCK).payload["weeks"]["gw"]
    assert clock["at"] == (NOW + timedelta(hours=1)).isoformat()
    assert clock["finishedObservedAt"] == NOW.isoformat()
    assert len(source.questions) == 1


def test_legacy_upgrade_preserves_observed_finish_and_correction_deadlines(db):
    keep(db)
    due = (NOW + timedelta(hours=12)).isoformat()
    state = {
        "at": due,
        "inputVersion": play_rewards._catalog(db)["gw"]["inputVersion"],
        "finishedObservedAt": NOW.isoformat(),
        "correcting": True,
    }
    put(
        db,
        play_rewards.CLOCK,
        {"version": 1, "inputs": play_rewards._inputs(db), "at": due, "weeks": {"gw": state}},
        NOW,
    )
    source = Source()
    assert play_rewards.run(db, source, NOW) == 0
    assert db.get(ReadModel, play_rewards.CLOCK).payload["weeks"]["gw"] == state
    assert not source.questions
