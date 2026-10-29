"""What each competition took to be paid anything: the season's finished gameweeks, averaged (the Targets page).

Built from what the refresh already keeps, with no Sorare call of its own:

- `sorare_references`: for every finished gameweek, the score that finished at each reward rank of each competition, and
  real rooms of 10 (`sync.reference_scores`);
- the reward tables of the gameweeks the run read (`snapshot["competitions"]`), remembered in the block itself, so a table read
  once keeps counting after its week has gone;
- your Pro boards, whose step is a fixed score to reach.

"Paid" is cash, essence or a card; a level that gives XP only never counts (the owner, 6 Oct 2026), though each ladder lists
it below the paid ones with its own average. `played` names the competitions of the lineups you saved in your last six
gameweeks (`my_week:` / `entered_week:`), which the page pins. The block is written with
`put`, which skips an unchanged payload: it moves when a finished gameweek's cut-offs arrive, and only then.
"""

from __future__ import annotations

from datetime import date
from statistics import mean
from typing import Any

from app.sorare import pro, rules
from app.sorare.model import ROOM, Competition, Tier
from app.sorare.planner import score_at_rank

KEY = "reward_bars"
VERSION = 1
PRO = "Pro"
GROUPS = ("In-season", "Classic", ROOM, PRO)
PLAIN_TRACKS = ("Limited", "Rare", "In-Season")
MONTHS = ("jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec")


def week_of(slug: str) -> tuple[date, str] | None:
    """A gameweek's last day and its label from Sorare's slug ("football-31-jul-4-aug-2026" -> 4 Aug 2026, "31 Jul–4 Aug").

    The slug is what every stored week has; its number does not do (September's weeks were kept as 712-714)."""
    parts = slug.removeprefix("football-").split("-")
    try:
        year = int(parts[-1])
        if len(parts) == 4:  # 11-15-sep-2026
            d1, d2, m = int(parts[0]), int(parts[1]), MONTHS.index(parts[2]) + 1
            return date(year, m, d2), f"{d1}–{d2} {parts[2].title()}"
        if len(parts) == 5:  # 31-jul-4-aug-2026
            d1, m1, d2, m2 = int(parts[0]), parts[1], int(parts[2]), parts[3]
            return date(year, MONTHS.index(m2) + 1, d2), f"{d1} {m1.title()}–{d2} {m2.title()}"
    except ValueError:
        return None
    return None


TIER = ("lo", "hi", "cash", "essence", "card", "xp")


def _table(comp: Competition) -> dict[str, Any]:
    """Every level that gives anything, XP-only ones included (the Targets ladder shows them; they never count as paid)."""
    return {
        "name": comp.name,
        "rarity": comp.rarity,
        "group": comp.group,
        "kind": "room" if comp.is_room else "rank",
        "size": comp.room_size or None,
        "tiers": [
            {"lo": t.lo, "hi": t.hi, "cash": t.cash, "essence": t.essence, "card": t.card, "xp": t.xp}
            for t in comp.rewarding_tiers
        ],
    }


def _pays(tier: dict[str, Any]) -> bool:
    return bool(tier["cash"] or tier["essence"] or tier["card"])


def _tables(by_week: dict[str, list[dict[str, Any]]], previous: dict[str, Any] | None) -> dict[str, dict[str, Any]]:
    """Every reward table known: the ones the last block remembered, then the ones this run read (newer wins)."""
    out: dict[str, dict[str, Any]] = {}
    for c in (previous or {}).get("competitions") or []:
        if c.get("kind") in ("rank", "room") and c.get("ladder"):
            out[c["key"]] = {
                "name": c["name"],
                "rarity": c.get("rarity"),
                "group": c["group"],
                "kind": c["kind"],
                "size": c.get("size"),
                "tiers": [{k: t.get(k, 0) for k in TIER} for t in c["ladder"]],
            }
    for raws in by_week.values():
        for raw in raws:
            if raw.get("skipped") or "rewardsConfig" not in raw:
                continue
            try:
                comp = rules.competition(raw)
            except (KeyError, TypeError, ValueError):  # a payload Sofix cannot read is left out, never guessed
                continue
            # A room's key does not say its rarity, and the rooms kept are limited ones (`sync.sample_rooms`): a rare room's table
            # would put a rare prize on limited scores.
            if comp.paying_tiers and not (comp.is_room and comp.rarity != "limited"):
                out[comp.key] = _table(comp)
    return out


def _name(key: str) -> str:
    league, _, track = key.partition(" | ")
    name = rules.LEAGUE_NAMES.get(league, league)
    return name if track in PLAIN_TRACKS else f"{name} · {track}"


def _rank_bar(kept: dict[str, Any], rank: int) -> float | None:
    """The score at that rank in one week, only where the week read it (or read ranks on both sides of it) and the field was
    bigger than it: a week whose whole field was paid, or a rank past the last one read, says nothing."""
    field = int(kept.get("entries") or 0)
    if field and field <= rank:
        return None
    cuts = {int(r): float(s) for r, s in (kept.get("cuts") or {}).items() if float(s) > 0}
    if not cuts or not min(cuts) <= rank <= max(cuts):
        return None
    return score_at_rank(cuts, rank)


def _room_bar(rooms: list[float], size: int, place: int) -> list[float]:
    """The score that finished at that place in each real room sampled (they are kept one room after another)."""
    out = []
    for i in range(0, len(rooms) - size + 1, size):
        room = sorted(rooms[i : i + size], reverse=True)
        out.append(room[place - 1])
    return out


def _round(value: float | None) -> float | None:
    return None if value is None else round(value, 2)


def _summary(by_week: list[tuple[str, float]], samples: list[float]) -> dict[str, Any]:
    scores = [s for _, s in by_week]
    return {
        "bar": _round(mean(samples)) if samples else None,
        "low": _round(min(scores)) if scores else None,
        "high": _round(max(scores)) if scores else None,
        "latest": _round(by_week[-1][1]) if by_week else None,
        "samples": len(samples),
        "byWeek": [{"week": label, "score": _round(s)} for label, s in by_week],
    }


def _measured(key: str, table: dict[str, Any] | None, weeks: list[tuple[str, dict[str, Any]]]) -> dict[str, Any]:
    kept = [(gw, refs[key]) for gw, refs in weeks if isinstance(refs.get(key), dict)]
    track = key.partition(" | ")[2]
    rarity = track.lower() if track in ("Limited", "Rare") else None  # an in-season track is named after its rarity
    base = {
        "key": key,
        "name": _name(key),
        "rarity": rarity,
        "group": None,
        "kind": "rank",
        "size": None,
        "paidTo": None,
    }
    if table is None:
        return {**base, **_summary([], []), "reward": None, "ladder": []}
    tiers = table["tiers"]
    last = [t for t in tiers if _pays(t)][-1]  # the bar is the last paid level's, never an XP one
    base = {**base, **{k: table[k] for k in ("name", "rarity", "group", "kind", "size")}, "paidTo": last["hi"]}
    if table["kind"] == "room":
        size = int(table.get("size") or 10)

        def at(place: int) -> tuple[list[tuple[str, float]], list[float]]:
            per_week, every = [], []
            for gw, k in kept:
                found = _room_bar([float(v) for v in k.get("rooms") or []], size, place)
                if found:
                    per_week.append((gw, mean(found)))
                    every += found
            return per_week, every

        per_week, every = at(last["hi"])
        ladder = [{**t, "bar": _round(mean(at(t["hi"])[1])) if at(t["hi"])[1] else None} for t in tiers]
        return {**base, **_summary(per_week, every), "reward": _reward(last), "ladder": ladder}

    def ranked(rank: int) -> list[tuple[str, float]]:
        return [(gw, s) for gw, k in kept if (s := _rank_bar(k, rank)) is not None]

    per_week = ranked(last["hi"])
    ladder = [{**t, "bar": _round(mean(s for _, s in found)) if (found := ranked(t["hi"])) else None} for t in tiers]
    return {**base, **_summary(per_week, [s for _, s in per_week]), "reward": _reward(last), "ladder": ladder}


def _reward(tier: dict[str, Any]) -> dict[str, Any]:
    return {"cash": tier["cash"], "essence": tier["essence"], "card": tier["card"]}


def _pro(boards: list[dict[str, Any]] | None, previous: dict[str, Any] | None) -> list[dict[str, Any]]:
    """Each Pro board's current step: its target is the bar, with no averaging (the steps after it are its ladder)."""
    comps = pro.competitions(boards)
    if not comps:  # boards not read this run: keep the last ones rather than lose them
        return [c for c in (previous or {}).get("competitions") or [] if c.get("kind") == "target"]
    out = []
    for comp in comps:
        target = comp.reference.get(1)
        tier: Tier = comp.tiers[0]
        out.append(
            {
                "key": comp.key,
                "name": comp.name,
                "rarity": comp.rarity,
                "group": PRO,
                "kind": "target",
                "size": None,
                "paidTo": None,
                "bar": target,
                "low": None,
                "high": None,
                "latest": None,
                "samples": 0,
                "byWeek": [],
                "reward": {"cash": tier.cash, "essence": tier.essence, "card": False},
                "ladder": [
                    {
                        "lo": level,
                        "hi": level,
                        "cash": cash,
                        "essence": essence,
                        "card": False,
                        "xp": 0,
                        "bar": float(goal),
                    }
                    for level, goal, cash, essence in comp.pro_steps
                ],
            }
        )
    return out


PLAYED_WEEKS = 6
SAVED = ("my_week:", "entered_week:")  # your settled lineups first, then the ones of a week still being settled


def entered(rows: list[tuple[str, Any]]) -> list[dict[str, Any]]:
    """The lineups you saved in your last six gameweeks, as (week, board, competition): what the Targets page pins.

    `rows` are (key, payload) of `my_week:<slug>` and `entered_week:<slug>`; a week with both reads `my_week`."""
    bodies: dict[str, dict[str, Any]] = {}
    for prefix in reversed(SAVED):
        for key, payload in rows:
            if key.startswith(prefix) and isinstance(payload, dict):
                bodies[key.removeprefix(prefix)] = payload
    dated = sorted((when[0], slug) for slug in bodies if (when := week_of(slug)))
    return [
        {"week": slug, "board": line.get("board") or "", "competition": line.get("competition") or ""}
        for _, slug in dated[-PLAYED_WEEKS:]
        for line in bodies[slug].get("lineups") or []
        if isinstance(line, dict)
    ]


def _boards(by_week: dict[str, list[dict[str, Any]]], previous: dict[str, Any] | None) -> dict[str, str]:
    """Each leaderboard's competition key, by its slug without the gameweek ("seasonal-spain-in_season_spain_limited"),
    which stays the same from week to week. Remembered in the block, so a week no longer read still maps."""
    out = dict((previous or {}).get("boards") or {})
    for week, raws in by_week.items():
        for raw in raws:
            if raw.get("slug") and raw.get("league") and raw.get("track"):
                out[str(raw["slug"]).removeprefix(f"{week}-")] = f"{raw['league']} | {raw['track']}"
    return out


def _played(lines: list[dict[str, Any]], boards: dict[str, str], known: set[str]) -> list[str]:
    """The competitions those lineups were in, most entered first. A Pro lineup names its league ("Pro · LALIGA EA SPORTS")."""
    count: dict[str, int] = {}
    for line in lines:
        name = line["competition"]
        key = (
            f"{name.removeprefix('Pro · ')} | {PRO}"
            if name.startswith("Pro · ")
            else boards.get(line["board"].removeprefix(f"{line['week']}-"))
        )
        if key in known:
            count[key] = count.get(key, 0) + 1
    return sorted(count, key=lambda k: (-count[k], k))


def build(
    references: dict[str, Any],
    by_week: dict[str, list[dict[str, Any]]],
    boards: list[dict[str, Any]] | None,
    previous: dict[str, Any] | None,
    lines: list[dict[str, Any]] | None = None,
) -> dict[str, Any]:
    """The Targets page: every competition's bar to be paid anything, from the finished gameweeks the refresh has recorded."""
    dated = sorted(
        (
            (when, refs)
            for slug, refs in references.items()
            if not slug.startswith("_") and isinstance(refs, dict) and refs and (when := week_of(slug))
        ),
        key=lambda w: w[0][0],
    )
    weeks = [(label, refs) for (_, label), refs in dated]
    tables = _tables(by_week, previous)
    measured = sorted({k for _, refs in weeks for k in refs} | set(tables))
    comps = [_measured(key, tables.get(key), weeks) for key in measured] + _pro(boards, previous)
    order = {g: i for i, g in enumerate(GROUPS)}
    comps.sort(key=lambda c: (order.get(c["group"] or "", len(GROUPS)), c["name"], c["rarity"] or ""))

    unread: dict[str, dict[str, Any]] = {
        u["key"]: u for u in (previous or {}).get("unread") or [] if u["key"] not in measured
    }
    for raws in by_week.values():
        for raw in raws:
            key = f"{raw.get('league')} | {raw.get('track')}"
            if raw.get("skipped") and key not in measured:
                unread[key] = {"key": key, "name": _name(key), "rarity": raw.get("rarity"), "why": raw["skipped"]}
    board_keys = _boards(by_week, previous)
    return {
        "version": VERSION,
        "latest": weeks[-1][0] if weeks else None,
        "weeks": [label for label, _ in weeks],
        "competitions": comps,
        "unread": sorted(unread.values(), key=lambda u: (u["name"], u["rarity"] or "")),
        "played": _played(lines or [], board_keys, {c["key"] for c in comps}),
        "boards": board_keys,
    }
