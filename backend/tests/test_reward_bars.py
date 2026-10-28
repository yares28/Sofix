"""The score each competition took to be paid anything, averaged over the season's finished gameweeks (`reward_bars`)."""

from __future__ import annotations

from app.sorare import reward_bars

LALIGA = "LALIGA EA SPORTS | Limited"
ROOM = "LALIGA EA SPORTS | Cap 260"


def ranking(*rows: tuple[int, int, dict]) -> dict:
    return {"ranking": [{"fromRank": lo, "toRank": hi, "rewardConfigs": [cfg]} for lo, hi, cfg in rows]}


CASH = {"__typename": "MonetaryRewardConfig", "amount": {"usdCents": 1000}}
ESSENCE = {"__typename": "CardShardRewardConfig", "quantity": 50, "rarity": "limited"}
XP = {"__typename": "InGameCurrencyRewardConfig", "currency": "LIMITED_XP", "amount": 500}


def raw(league: str, track: str, rewards: dict, **extra) -> dict:
    return {
        "league": league,
        "track": track,
        "slug": f"{league}-{track}",
        "rarity": "limited",
        "rewardsConfig": rewards,
        **extra,
    }


IN_SEASON = raw(
    "LALIGA EA SPORTS",
    "Limited",
    ranking((1, 10, CASH), (11, 1500, ESSENCE), (1501, 3500, XP)),
    displayedTypedRules=[{"key": "SeasonBonus"}],
)
ROOM_RAW = raw(
    "LALIGA EA SPORTS",
    "Cap 260",
    ranking((1, 1, ESSENCE), (2, 2, ESSENCE), (3, 3, ESSENCE), (4, 5, XP)),
    roomsConfig={"roomsSize": 10},
)


SLUGS = {
    1: "football-11-15-sep-2026",
    2: "football-28-sep-2-oct-2026",
    3: "football-9-13-oct-2026",
    4: "football-23-27-oct-2026",
}


def week(gw: int, cuts: dict[str, float], entries: int) -> dict:
    return {LALIGA: {"from": SLUGS[gw], "gameweek": gw, "entries": entries, "cuts": cuts}}


def one(payload: dict, key: str) -> dict:
    return next(c for c in payload["competitions"] if c["key"] == key)


def test_the_bar_is_the_mean_score_at_the_last_paid_rank_never_an_xp_rank():
    """Ranks 1,501-3,500 give XP only, which never counts as paid: the bar is rank 1,500's score."""
    references = {  # kept newest first, as a dict may hold them: the weeks are ordered by their dates
        SLUGS[2]: week(2, {"10": 500.0, "1500": 310.0, "3500": 240.0, "4800": 0.0}, 4800),
        SLUGS[1]: week(1, {"10": 480.0, "1500": 330.0, "3500": 250.0, "4700": 0.0}, 4700),
    }
    comp = one(reward_bars.build(references, {"w3": [IN_SEASON]}, None, None), LALIGA)
    assert comp["kind"] == "rank" and comp["paidTo"] == 1500
    assert comp["bar"] == 320.0 and comp["low"] == 310.0 and comp["high"] == 330.0
    assert comp["latest"] == 310.0 and comp["byWeek"] == [
        {"week": "11–15 Sep", "score": 330.0},
        {"week": "28 Sep–2 Oct", "score": 310.0},
    ]
    assert [t["hi"] for t in comp["ladder"]] == [10, 1500]  # paying levels only, best first
    assert comp["ladder"][0]["bar"] == 490.0


def test_a_week_the_whole_field_was_paid_or_a_rank_it_never_read_says_nothing():
    references = {
        SLUGS[1]: week(1, {"10": 480.0, "1500": 330.0, "1400": 0.0}, 1400),  # everyone who entered was paid
        SLUGS[2]: week(
            2, {"10": 500.0, "900": 350.0, "4800": 0.0}, 4800
        ),  # rank 1,500 was never read: no guess past 900
        SLUGS[3]: week(
            3, {"10": 490.0, "1000": 340.0, "2000": 300.0, "4800": 0.0}, 4800
        ),  # 1,500 sits between two read ranks
    }
    comp = one(reward_bars.build(references, {"w4": [IN_SEASON]}, None, None), LALIGA)
    assert [w["week"] for w in comp["byWeek"]] == ["9–13 Oct"]
    assert 300.0 < comp["bar"] < 340.0


def test_a_room_bar_is_the_score_that_finished_last_paid_place_in_each_real_room():
    room_a = [300.0, 280.0, 260.0, 250.0, 240.0, 230.0, 220.0, 210.0, 200.0, 190.0]
    room_b = [350.0, 340.0, 300.0, 200.0, 190.0, 180.0, 170.0, 160.0, 150.0, 140.0]
    references = {SLUGS[1]: {ROOM: {"from": SLUGS[1], "gameweek": 1, "rooms": list(reversed(room_a)) + room_b}}}
    comp = one(reward_bars.build(references, {"w2": [ROOM_RAW]}, None, None), ROOM)
    assert comp["kind"] == "room" and comp["paidTo"] == 3
    assert comp["bar"] == 280.0  # third place: 260 and 300
    assert comp["samples"] == 2


def test_a_pro_step_needs_its_own_target():
    boards = [
        {
            "title": "LALIGA EA SPORTS",
            "configSlug": "laliga-pro",
            "steps": [
                {"level": 1, "target": 300, "state": "CLAIMED", "rewardConfigs": [CASH]},
                {
                    "level": 2,
                    "target": 340,
                    "state": "OPEN",
                    "rewardConfigs": [CASH],
                    "displayedTypedRules": [
                        {"key": "Scarcity", "rarities": ["limited"]},
                        {"key": "Competitions", "competitions": [{"slug": "laliga-es"}]},
                        {"key": "Appearances", "appearances": [{"name": "goalkeeper", "sub": False}]},
                    ],
                },
            ],
        }
    ]
    comp = one(reward_bars.build({}, {}, boards, None), "LALIGA EA SPORTS | Pro")
    assert comp["kind"] == "target" and comp["bar"] == 340.0 and comp["group"] == "Pro"


def test_a_league_without_your_cards_is_listed_unread_and_a_finished_week_moves_the_bar():
    skipped = {
        "league": "Serie A",
        "track": "Limited",
        "slug": "sa",
        "rarity": "limited",
        "skipped": "no cards in this league",
    }
    before = reward_bars.build(
        {SLUGS[1]: week(1, {"1500": 330.0, "4700": 0.0}, 4700)}, {"w9": [IN_SEASON, skipped]}, None, None
    )
    assert before["unread"] == [
        {"key": "Serie A | Limited", "name": "Serie A", "rarity": "limited", "why": "no cards in this league"}
    ]
    # The next gameweek finishes: the refresh adds its cut-offs, and the bar moves with it.
    references = {
        SLUGS[1]: week(1, {"1500": 330.0, "4700": 0.0}, 4700),
        SLUGS[2]: week(2, {"1500": 290.0, "4700": 0.0}, 4700),
    }
    after = reward_bars.build(references, {}, None, before)  # the table is remembered from the last run
    assert one(before, LALIGA)["bar"] == 330.0 and one(after, LALIGA)["bar"] == 310.0
    assert before["latest"] == "11–15 Sep" and after["latest"] == "28 Sep–2 Oct"
    assert after["unread"] == before["unread"]


def test_a_competition_whose_reward_table_was_never_read_shows_no_bar():
    references = {
        SLUGS[1]: {"Clue Hunt | Limited": {"from": SLUGS[1], "gameweek": 1, "entries": 900, "cuts": {"100": 300.0}}}
    }
    comp = one(reward_bars.build(references, {}, None, None), "Clue Hunt | Limited")
    assert comp["bar"] is None and comp["paidTo"] is None and comp["rarity"] == "limited"


def test_week_labels_come_from_the_slug():
    assert reward_bars.week_of("football-31-jul-4-aug-2026")[1] == "31 Jul–4 Aug"
    assert reward_bars.week_of("football-11-15-sep-2026")[1] == "11–15 Sep"
    assert reward_bars.week_of("not-a-week") is None


def test_a_rare_room_never_lends_its_table_to_the_limited_rooms_kept_under_the_same_key():
    rare_room = {**ROOM_RAW, "rarity": "rare", "rewardsConfig": ranking((1, 1, CASH))}
    references = {
        SLUGS[1]: {ROOM: {"from": SLUGS[1], "gameweek": 1, "rooms": [float(v) for v in range(300, 200, -10)]}}
    }
    comp = one(reward_bars.build(references, {"a": [ROOM_RAW], "b": [rare_room]}, None, None), ROOM)
    assert comp["rarity"] == "limited" and comp["paidTo"] == 3 and comp["bar"] == 280.0
