"""Browser-independent reward receipts and frozen-plan returns for one exact GW.

The source has no final-whistle timestamp. Observe all games finished, wait an hour,
retry unpublished rewards, and check for corrections again a day later.
"""

from __future__ import annotations

import hashlib
import json
import math
import time
from datetime import datetime, timedelta
from typing import Any

from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session

from app.config import settings
from app.models import ReadModel
from app.services import kept_blocks
from app.services.publish import put
from app.sorare.client import SorareClient, SorareError
from app.sorare.frozen_scores import _score, games_of, results
from app.sorare.score_checks import moment
from app.sorare.sync import REWARD_FRAGMENT, cut_offs

PREFIX = "play_rewards:"
STATE_PREFIX = "play_reward_state:"
CLOCK = "play_reward_clock"
VERSION = 1
HOUR = timedelta(hours=1)
RETRY = timedelta(minutes=30)
CORRECTION = timedelta(hours=24)
FIXTURE = """query PlayRewardGames($s:String!){ so5 { so5Fixture(slug:$s) {
slug aasmState games { id date statusTyped } } } }"""
ENTRIES = """query PlayRewardEntries($s:String!,$u:String!,$a:String){ so5 { so5Fixture(slug:$s) {
slug so5LineupsPaginated(first:50,after:$a,userSlug:$u,withTraining:false,draft:false) {
pageInfo { hasNextPage endCursor } nodes { id } } } } }"""
LINEUP = (
    REWARD_FRAGMENT
    + """query PlayRewardReceipt($id:ID!){ so5 { so5Lineup(id:$id) {
id draft so5Fixture { slug } so5Leaderboard { slug }
so5Rankings { ranking score so5Leaderboard { slug } so5Rewards { rewardConfigs { ...R } } } } } }"""
)
BOARD = (
    REWARD_FRAGMENT
    + """query PlayRewardCutoffs($s:String!){ so5 { so5Leaderboard(slug:$s) {
slug so5Fixture { slug } so5LineupsCount rewardsConfig { ranking { fromRank toRank rewardConfigs { ...R } } } } } }"""
)


TASK = (
    REWARD_FRAGMENT
    + """query PlayTaskReward($id:ID!){ so5 { taskLineup(id:$id) {
id draft aasmState rewardMultiplier user { slug } taskAppearances { game { date } }
step { ... on CareerProStep { rewardConfigs { ...R } } } } } }"""
)


class _Budget(SorareClient):
    def __init__(self, source: SorareClient) -> None:
        self.source, self.calls = source, 0
        self.deadline = time.monotonic() + 90

    def query(self, query: str, variables: dict[str, Any] | None = None) -> dict[str, Any]:
        if self.calls >= 80 or time.monotonic() >= self.deadline:
            raise SorareError("Reward check budget reached")
        self.calls += 1
        return self.source.query(query, variables)


def reward_amounts(configs: list[dict[str, Any]], kind: str) -> dict[str, float] | None:
    values: dict[str, float] = {}
    for c in configs:
        what = c.get("__typename")
        if what == "MonetaryRewardConfig":
            key, amount = "cash:USD", (c.get("amount") or {}).get("usdCents")
            amount = amount / 100 if isinstance(amount, (int, float)) else None
        elif what == "CardShardRewardConfig":
            key, amount = f"essence:{c.get('rarity') or 'unknown'}:{kind or 'unknown'}", c.get("quantity")
        elif what == "CardRewardConfig":
            key, amount = f"card:{c.get('rarity') or 'unknown'}", 1
        elif what in ("InGameCurrencyRewardConfig", "CoinRewardConfig"):
            currency = c.get("currency") or "unknown"
            key, amount = f"{'xp' if str(currency).endswith('_XP') else 'coin'}:{currency}", c.get("amount")
        else:
            return None
        if not isinstance(amount, (int, float)) or not math.isfinite(amount) or amount < 0:
            return None
        values[key] = values.get(key, 0) + amount
    return values


def receipt(raw: dict[str, Any], slug: str, closed: bool, kind: str) -> dict[str, float] | None:
    if raw.get("draft") or (raw.get("so5Fixture") or {}).get("slug") != slug:
        return None
    board = (raw.get("so5Leaderboard") or {}).get("slug")
    rank = next((r for r in raw.get("so5Rankings") or [] if (r.get("so5Leaderboard") or {}).get("slug") == board), None)
    if not board or not rank or rank.get("ranking") is None:
        return None
    rewards = rank.get("so5Rewards")
    if rewards is None or (not rewards and not closed):
        return None
    if any(not r.get("rewardConfigs") for r in rewards):
        return None
    return reward_amounts([c for r in rewards for c in r.get("rewardConfigs") or []], kind)


def task_receipt(raw: dict[str, Any], info: dict[str, Any], user: str, kind: str) -> dict[str, float] | None:
    if raw.get("draft") or (raw.get("user") or {}).get("slug") != user:
        return None
    start, end = moment(info.get("start")), moment(info.get("end"))
    dates = [moment((a.get("game") or {}).get("date")) for a in raw.get("taskAppearances") or []]
    if not start or not end or not dates or any(at is None or not start <= at < end for at in dates):
        return None
    if raw.get("aasmState") == "FAILED":
        return {}
    configs, more = (raw.get("step") or {}).get("rewardConfigs"), raw.get("rewardMultiplier")
    if (
        raw.get("aasmState") != "SUCCESSFUL"
        or not configs
        or not isinstance(more, (int, float))
        or not math.isfinite(more)
        or more < 0
    ):
        return None
    amounts = reward_amounts(configs, kind)
    return (
        {k: round(v * more, 6) if k.startswith(("cash:", "essence:")) else v for k, v in amounts.items()}
        if amounts is not None
        else None
    )


def pro_replayed_reward(raw: dict[str, Any], score: float | None) -> dict[str, float] | None:
    pro, tiers = raw.get("pro") or {}, raw.get("tiers") or []
    if (
        score is None
        or not isinstance(pro.get("target"), (int, float))
        or not tiers
        or not isinstance(pro.get("boost"), (int, float))
    ):
        return None
    if score < pro["target"]:
        return {}
    tier = tiers[0]
    if any(not isinstance(tier.get(k), (int, float)) for k in ("cash", "essence")):
        return None
    return {
        "cash:USD": round(tier["cash"] * pro["boost"], 6),
        f"essence:{raw.get('rarity') or 'unknown'}:{raw.get('kind') or 'unknown'}": round(
            tier["essence"] * pro["boost"], 6
        ),
    }


def replayed_reward(
    score: float | None, tiers: list[dict[str, Any]], cuts: dict[str, float], kind: str
) -> dict[str, float] | None:
    if score is None or not tiers or any(str(t.get("toRank")) not in cuts for t in tiers):
        return None
    for tier in sorted(tiers, key=lambda t: t["toRank"]):
        if score >= cuts[str(tier["toRank"])]:
            return reward_amounts(tier.get("rewardConfigs") or [], kind)
    return {}


def finished_clock(games: list[dict[str, Any]], previous: dict[str, Any], now: datetime) -> tuple[bool, dict[str, Any]]:
    state = dict(previous)
    active = [g for g in games if g.get("statusTyped") not in ("cancelled", "postponed")]
    signature = hashlib.sha256(
        json.dumps(sorted((str(g.get("id")), str(g.get("date"))) for g in active)).encode()
    ).hexdigest()
    if not active or any(g.get("statusTyped") != "played" for g in active) or state.get("games") != signature:
        state.pop("finishedObservedAt", None)
    state["games"] = signature
    if not active or any(g.get("statusTyped") != "played" for g in active):
        dates = [at for g in active if (at := moment(g.get("date"))) is not None]
        state["at"] = max(now + RETRY, max(dates, default=now) + timedelta(hours=2)).isoformat()
        return False, state
    observed = moment(state.get("finishedObservedAt")) or now
    state["finishedObservedAt"] = observed.isoformat()
    state["at"] = (observed + HOUR).isoformat()
    return now >= observed + HOUR, state


def _body(db: Session, key: str) -> dict[str, Any]:
    row = kept_blocks.read(db, key)
    return dict(row.payload) if row and isinstance(row.payload, dict) else {}


def _inputs(db: Session) -> str:
    return str(
        db.scalar(
            select(func.max(ReadModel.updated_at)).where(
                or_(
                    ReadModel.key == "sorare",
                    ReadModel.key.like("sorare_plan:%"),
                    ReadModel.key.like("entered_week:%"),
                    ReadModel.key.like("my_week:%"),
                )
            )
        )
    )


def _catalog(db: Session) -> dict[str, dict[str, Any]]:
    out: dict[str, dict[str, Any]] = {}
    timeline = db.scalar(select(ReadModel.payload["timeline"]).where(ReadModel.key == "sorare"))
    for week in timeline or []:
        if week.get("slug"):
            out[week["slug"]] = {k: week.get(k) for k in ("slug", "number", "start", "end")}
    rows = db.execute(
        select(
            ReadModel.key,
            ReadModel.payload["gameweek"],
            ReadModel.payload["start"],
            ReadModel.payload["end"],
            ReadModel.payload["number"],
            ReadModel.updated_at,
        ).where(
            or_(
                ReadModel.key.like("sorare_plan:%"),
                ReadModel.key.like("entered_week:%"),
                ReadModel.key.like("my_week:%"),
            )
        )
    )
    for key, gw, start, end, number, updated in rows:
        slug = key.split(":", 1)[1]
        before = out.get(slug) or {}
        out[slug] = {
            **before,
            **{
                k: v
                for k, v in {"slug": slug, "start": start, "end": end, "number": number, **(gw or {})}.items()
                if v is not None
            },
            "inputVersion": max(str(updated), before.get("inputVersion") or ""),
        }
    return out


def _entries(client: SorareClient, slug: str) -> list[str]:
    ids: list[str] = []
    after = None
    while True:
        fixture = client.query(ENTRIES, {"s": slug, "u": settings.sorare_user, "a": after})["so5"]["so5Fixture"]
        if not fixture or fixture.get("slug") != slug:
            raise SorareError("Fixture unavailable")
        page = fixture["so5LineupsPaginated"]
        ids.extend(n["id"] for n in page["nodes"])
        info = page["pageInfo"]
        if not info["hasNextPage"]:
            return list(dict.fromkeys(ids))
        if not info.get("endCursor") or info["endCursor"] == after:
            raise SorareError("Incomplete lineup page")
        after = info["endCursor"]


def signature(line: dict[str, Any]) -> str:
    return "|".join(
        [
            str(line.get("board") or ""),
            *(
                f"{c.get('slug')}:{int(bool(c.get('captain')))}"
                for c in [*(line.get("starters") or []), *(line.get("subs") or [])]
            ),
        ]
    )


def watched_games(
    plan: dict[str, Any], best: dict[str, Any] | None, saved: dict[str, Any], games: list[dict[str, Any]]
) -> list[dict[str, Any]]:
    entered = [line for line in saved.get("lineups") or [] if not line.get("draft")]
    if not entered or any(not line.get("cards") for line in entered):
        return games
    cards = [
        c
        for line in (best or {}).get("lineups") or []
        for c in [*(line.get("starters") or []), *(line.get("subs") or [])]
    ]
    cards.extend(c for line in entered for c in line.get("cards") or [])
    maps = games_of(plan)
    if not cards or any(not card.get("player") or not maps.get(card["player"]) for card in cards):
        return games
    wanted = {gid for card in cards for gid in maps[card["player"]]}
    selected = [game for game in games if game.get("id") in wanted]
    return selected if wanted <= {game.get("id") for game in selected} else games


def check_week(
    db: Session, client: SorareClient, slug: str, info: dict[str, Any], state: dict[str, Any], now: datetime
) -> tuple[dict[str, Any], dict[str, Any]]:
    plan = _body(db, f"sorare_plan:{slug}")
    plans = plan.get("plans") or []
    best = max(plans, key=lambda p: p.get("essence", 0)) if plans else None
    saved = _body(db, f"my_week:{slug}") or _body(db, f"entered_week:{slug}")
    previous = _body(db, f"{PREFIX}{slug}")
    db.rollback()
    fixture = client.query(FIXTURE, {"s": slug})["so5"]["so5Fixture"]
    if not fixture or fixture.get("slug") != slug:
        raise SorareError("Fixture unavailable")
    ready, clock = finished_clock(watched_games(plan, best, saved, fixture.get("games") or []), state, now)
    if not ready:
        return clock, {
            **previous,
            "slug": slug,
            "nextCheckAt": clock["at"],
            "state": "watching",
            "finishedObservedAt": clock.get("finishedObservedAt"),
        }
    correcting = bool(clock.get("correcting"))
    cache = _body(db, f"{STATE_PREFIX}{slug}") if not correcting or clock.get("correctionStarted") else {}
    db.rollback()
    clock["correctionStarted"] = correcting
    lines = (best or {}).get("lineups") or []
    kinds = {line["board"]: line.get("kind") or "unknown" for line in lines}
    ids = _entries(client, slug)
    for entry in saved.get("lineups") or []:
        if entry.get("board") not in kinds:
            name = str(entry.get("competition") or "")
            kinds[entry.get("board")] = next(
                (
                    kind
                    for label, kind in (
                        ("Champion", "champion"),
                        ("LaLiga", "laliga"),
                        ("LALIGA", "laliga"),
                        ("All Star", "all_star"),
                    )
                    if label in name
                ),
                "unknown",
            )
    ids = list(dict.fromkeys([*ids, *(line["id"] for line in saved.get("lineups") or [] if not line.get("draft"))]))
    mine = []
    received = cache.setdefault("received", {})
    for identity in ids:
        raw = received.get(identity)
        if raw is None:
            try:
                if "TaskLineup:" in identity:
                    source = client.query(TASK, {"id": identity.rsplit(":", 1)[-1]})["so5"]["taskLineup"]
                    entry = next((line for line in saved.get("lineups") or [] if line.get("id") == identity), {})
                    raw = (
                        task_receipt(source, info, settings.sorare_user, kinds.get(entry.get("board"), "unknown"))
                        if source.get("id") == identity
                        else None
                    )
                    if raw is not None:
                        received[identity] = raw
                    mine.append({"id": identity, "rewards": raw})
                    continue
                source = client.query(LINEUP, {"id": identity.removeprefix("So5Lineup:")})["so5"]["so5Lineup"]
                board = (source.get("so5Leaderboard") or {}).get("slug")
                if source.get("id") != identity:
                    raise SorareError("Wrong lineup")
                raw = receipt(source, slug, fixture.get("aasmState") == "closed", kinds.get(board, "unknown"))
            except (SorareError, KeyError, TypeError, AttributeError):
                raw = None
            if raw is not None:
                received[identity] = raw
        mine.append({"id": identity, "rewards": raw})
    wanted = {c.get("player") for line in lines for c in [*(line.get("starters") or []), *(line.get("subs") or [])]}
    game_map = {player: ids for player, ids in games_of(plan).items() if player in wanted}
    actuals = results(db, game_map)
    scored_lines = [_score(line, game_map, actuals) for line in lines]
    db.rollback()
    boards = cache.setdefault("boards", {})
    theirs = []
    for line, scored in zip(lines, scored_lines, strict=True):
        board = line["board"]
        reference = boards.get(board)
        unavailable = line.get("group") == "Room" or scored.get("reason") == "incomplete-plan"
        if scored["score"] is not None and reference is None and not line.get("pro") and not unavailable:
            try:
                source = client.query(BOARD, {"s": board})["so5"]["so5Leaderboard"]
                if (source.get("so5Fixture") or {}).get("slug") != slug:
                    raise SorareError("Wrong fixture")
                tiers = (source.get("rewardsConfig") or {}).get("ranking") or []
                entries = source.get("so5LineupsCount") or 0
                cuts = cut_offs(client, board, [min(t["toRank"], entries) for t in tiers], entries)
                mapped = {
                    str(t["toRank"]): cuts[str(min(t["toRank"], entries))]
                    for t in tiers
                    if str(min(t["toRank"], entries)) in cuts
                }
                if tiers and len(mapped) == len({t["toRank"] for t in tiers}):
                    reference = {"tiers": tiers, "cuts": mapped}
                    boards[board] = reference
            except (SorareError, KeyError, TypeError):
                pass
        reward = (
            replayed_reward(scored["score"], reference["tiers"], reference["cuts"], line.get("kind") or "unknown")
            if reference
            else None
        )
        if line.get("pro"):
            reward = pro_replayed_reward(line, scored["score"])
        theirs.append({"signature": signature(line), "rewards": reward, "unavailable": unavailable})
    complete = all(r["rewards"] is not None for r in mine) and all(
        r["rewards"] is not None or r["unavailable"] for r in theirs
    )
    final = complete and correcting
    clock.update(final=final, at=(now + (CORRECTION if complete else RETRY)).isoformat())
    clock["correcting"] = correcting or complete
    if not complete and now > (moment(info.get("end")) or now) + timedelta(days=2):
        clock["at"] = (now + timedelta(hours=6)).isoformat()
    put(db, f"{STATE_PREFIX}{slug}", cache, now)
    return clock, {
        "slug": slug,
        "checkedAt": now.isoformat(),
        "nextCheckAt": None if final else clock["at"],
        "finishedObservedAt": clock.get("finishedObservedAt"),
        "state": "checked" if complete else "pending",
        "you": mine,
        "sofix": theirs,
        "planRank": (best or {}).get("rank"),
    }


def run(db: Session, client: SorareClient, now: datetime) -> int:
    index = _body(db, CLOCK)
    stamp = _inputs(db)
    if index.get("version") == VERSION and index.get("inputs") == stamp:
        due = moment(index.get("at"))
        if due is None or now < due:
            return 0
    weeks = index.get("weeks") or {}
    catalog = _catalog(db)
    for slug, info in catalog.items():
        end = moment(info.get("end"))
        if end and slug not in weeks:
            weeks[slug] = {"at": (end - timedelta(days=2)).isoformat(), "inputVersion": info.get("inputVersion")}
        elif slug in weeks and weeks[slug].get("inputVersion") != info.get("inputVersion"):
            weeks[slug] = {
                **weeks[slug],
                "at": now.isoformat(),
                "final": False,
                "correcting": True,
                "correctionStarted": False,
                "inputVersion": info.get("inputVersion"),
            }
    changed = 0
    source = _Budget(client)
    for slug in sorted(catalog, key=lambda s: catalog[s].get("end") or "", reverse=True):
        state = weeks.get(slug) or {}
        due = moment(state.get("at"))
        if state.get("final") or not due or due > now or changed >= 2:
            continue
        try:
            clock, page = check_week(db, source, slug, catalog[slug], state, now)
            weeks[slug] = clock
            put(db, f"{PREFIX}{slug}", page, now)
        except (SorareError, KeyError, TypeError):
            weeks[slug] = {**state, "at": (now + RETRY).isoformat()}
        changed += 1
    due_dates = [
        at for state in weeks.values() if not state.get("final") and (at := moment(state.get("at"))) is not None
    ]
    put(
        db,
        CLOCK,
        {"version": VERSION, "inputs": stamp, "at": min(due_dates).isoformat() if due_dates else None, "weeks": weeks},
        now,
    )
    return changed
