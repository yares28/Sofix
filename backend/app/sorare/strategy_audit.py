"""Audit · Strategies, and the comparison of a week's lineups: what you entered, Sofix's plan and every strategy, scored once the games are played.

Four sources, each scored from the kept games with the lineup's own saved rules (`frozen_scores._score`), as the Lineups view does:
- the strategy lab's lineups, written down before the lock (`strategy_plans:<slug>`, `strategies.py`);
- Sofix's best plan as it stood at the lock (`sorare_plan:<slug>`);
- the whole Sorare-projection plan saved before the lock (`sorare_alt:<slug>`);
- the lineups you entered (`my_week:<slug>`, or `entered_week:<slug>` while the week is being settled).

Each lineup is asked what it won against the scores that really paid that week, how it did against the best lineup in hindsight for the same
competition (the replay the archive keeps, `sorare_week:<slug>`) and, where a range was saved for it, whether the score was built on the numbers
or on luck. The lineups of one leaderboard are put side by side, with the strategies each one happens to fit (yours is a mix of them).

A week's counts are kept in a read model of their own once they cannot change, so a refresh only opens the lineups of a week still being
settled (the same reason as `lineup_audit`). A week is picked up by the first refresh after its games are in, as provisional (its scores can still move while Sorare reviews them); it is final a day after it ends.
"""

from __future__ import annotations

import hashlib
import json
from datetime import datetime
from typing import Any

from sqlalchemy import or_, select
from sqlalchemy.orm import Session

from app.models import ReadModel
from app.services import kept_blocks
from app.services.publish import put
from app.services.timeutil import as_utc
from app.sorare import strategies
from app.sorare.frozen import PLAN_PREFIX
from app.sorare.frozen_scores import _score, games_of, results
from app.sorare.lineup_audit import KINDS, kept_references, prize
from app.sorare.planner import score_at_rank
from app.sorare.publish import ALT_PREFIX, ARCHIVE_PREFIX, SETTLE, STRATEGY_PREFIX
from app.sorare.strategy_decision import amounts, collect, decision_of, tier_amounts

KEY = "strategy_audit"
VERSION = 7  # 7: each week keeps why Sofix's plans and the cutoff tests won or missed (`diagnosis`, `plan_tracking`)
TRACKING_KEY = "plan_tracking"
DIAGNOSED = {"sofix", "sorare-plan"}
NEAR = 15.0  # points: a score this close to the lowest paid one could have gone either way
PAID = {"card", "cash", "essence"}
HIDDEN = {"inputs", "cutoffTests", "diagnosis"}  # kept for `plan_tracking`, not for the page
MY_WEEK = "my_week:"
ENTERED_WEEK = "entered_week:"
PREFIXES = (STRATEGY_PREFIX, PLAN_PREFIX, ALT_PREFIX, MY_WEEK, ENTERED_WEEK)
VERDICTS = ("lucky", "good", "expected", "poor")
SHORT = {"Goalkeeper": "GK", "Defender": "DEF", "Midfielder": "MID", "Forward": "FWD"}


def _tally() -> dict[str, Any]:
    return {
        "lineups": 0,
        "scored": 0,
        "pending": 0,
        "unavailable": 0,
        "rewardPending": 0,
        "points": 0.0,
        "best": 0.0,  # what the best lineup in hindsight scored in the same competitions, for the lineups that have one
        "pointsVs": 0.0,  # what those lineups scored: the share of the best is this over `best`
        "against": 0,  # how many of the scored lineups that is
        "judged": 0,
        "said": 0.0,  # the chances of a reward the judged lineups were given before the lock, added up: how many it expected paid
        "returnCases": 0,
        "cash": 0.0,
        "essence": {},
        "won": {**dict.fromkeys(KINDS, 0), "none": 0},
        "verdicts": dict.fromkeys(VERDICTS, 0),
    }


def _add(total: dict[str, Any], part: dict[str, Any]) -> None:
    for key in (
        "lineups",
        "scored",
        "pending",
        "unavailable",
        "rewardPending",
        "points",
        "best",
        "pointsVs",
        "against",
        "judged",
        "said",
        "returnCases",
        "cash",
    ):
        total[key] += part.get(key, 0)
    for rarity, value in part.get("essence", {}).items():
        bucket = total["essence"].setdefault(rarity, {"total": 0.0, "cases": 0})
        bucket["total"] += value["total"]
        bucket["cases"] += value["cases"]
    for kind, count in part["won"].items():
        total["won"][kind] += count
    for verdict, count in part["verdicts"].items():
        total["verdicts"][verdict] += count


def _diagnosis(label: str) -> dict[str, Any]:
    return {
        "label": label,
        "lineups": 0,  # scored
        "judged": 0,
        "paid": 0,
        "said": 0.0,  # the chances of a reward it gave the judged lineups, added up
        "brier": 0.0,  # squared miss of those chances: lower is better, divided by `judged`
        "overExpected": 0.0,  # real score minus expected, added up over `expectedCases`
        "expectedCases": 0,
        "starters": 0,
        "starterOut": 0,  # planned starters who did not play
        "covered": 0,  # of those, how many a substitute replaced
        "lucky": 0,  # lineups above the top of their own range
        "cutCases": 0,
        "cutError": 0.0,  # real lowest paid score minus the one planned on, added up
        "cutMiss": 0.0,  # the same without the sign
        "lostToCut": 0,  # cleared the planned score, not the real one
        "wonByCut": 0,  # under the planned score, over the real one
        "nearMiss": 0,  # within `NEAR` under the real score
        "nearWin": 0,  # within `NEAR` over it
        "chances": {},  # by tenth of the chance given: lineups, chance added up, paid
        "comps": {},  # by competition: lineups, paid, chance added up, points
    }


def _bump(row: dict[str, Any], **amounts: float) -> None:
    for key, amount in amounts.items():
        row[key] = row.get(key, 0) + amount


def _diagnose(
    why: dict[str, Any], raw: dict[str, Any], line: dict[str, Any], won: str | None, cuts: dict[int, float]
) -> None:
    score, cards = line["score"], [c for c in line["cards"] if not c["sub"]]
    out = sum(not c["played"] for c in cards)
    _bump(why, lineups=1, starters=len(cards), starterOut=out, covered=min(out, len(line["cameIn"])))
    _bump(why, lucky=int((line.get("verdict") or {}).get("label") == "lucky"))
    if raw.get("x") is not None:
        _bump(why, overExpected=score - raw["x"], expectedCases=1)
    comp = why["comps"].setdefault(raw.get("key") or "", {})
    _bump(comp, lineups=1, points=score)
    if won is None:
        return
    chance, paid = float(raw.get("pReturn") or 0.0), int(won in PAID)
    _bump(why, judged=1, paid=paid, said=chance, brier=(chance - paid) ** 2)
    _bump(comp, paid=paid, said=chance)
    _bump(why["chances"].setdefault(str(min(int(chance * 10), 9) * 10), {}), lineups=1, said=chance, paid=paid)
    paying = [t for t in raw.get("tiers") or [] if t.get("cash") or t.get("essence") or t.get("card")]
    last = max(paying, key=lambda t: t["hi"]) if paying else None
    real = score_at_rank(cuts, last["hi"]) if last else None
    if last is None or real is None:
        return
    gap = score - real
    _bump(why, nearMiss=int(-NEAR <= gap < 0), nearWin=int(0 <= gap < NEAR))
    if last.get("need"):
        said = float(last["need"])
        _bump(why, cutCases=1, cutError=real - said, cutMiss=abs(real - said))
        _bump(why, lostToCut=int(said <= score < real), wonByCut=int(real <= score < said))


def _merge(total: dict[str, Any], part: dict[str, Any]) -> None:
    for key, value in part.items():
        if isinstance(value, dict):
            _merge(total.setdefault(key, {}), value)
        elif not isinstance(value, str):
            total[key] = total.get(key, 0) + value


def tracking(weeks: list[dict[str, Any]]) -> dict[str, Any]:
    """The cutoff tests and every plan's reasons, added up over the weeks that have them. No page reads this block."""
    tests: dict[str, dict[str, Any]] = {}
    why: dict[str, dict[str, Any]] = {}
    for week in weeks:
        for key, tally in (week.get("cutoffTests") or {}).items():
            total = tests.setdefault(key, {"key": key, "label": tally["label"], **_tally(), "weeks": 0})
            _add(total, tally)
            total["weeks"] += 1
        for who, part in (week.get("diagnosis") or {}).items():
            total = why.setdefault(who, {**_diagnosis(part["label"]), "weeks": 0})
            _merge(total, part)
            total["weeks"] += 1
    return {"version": VERSION, "tests": list(tests.values()), "diagnosis": why}


def hindsight_best(db: Session, slug: str) -> dict[str, float]:
    """The score of the best lineup in hindsight for each competition of the week, from the archived replay (empty until it is kept)."""
    row = kept_blocks.read(db, f"{ARCHIVE_PREFIX}{slug}")
    hindsight = ((row.payload if row else None) or {}).get("hindsight") or {}
    best: dict[str, float] = {}
    for lineup in hindsight.get("lineups") or []:
        total = (lineup.get("actual") or {}).get("total")
        if total is not None and lineup.get("key"):
            best[lineup["key"]] = max(best.get(lineup["key"], 0.0), float(total))
    return best


def _body(db: Session, key: str) -> dict[str, Any]:
    row = kept_blocks.read(db, key)
    return dict(row.payload) if row and isinstance(row.payload, dict) else {}


def _unknown_cards(raw: dict[str, Any]) -> list[dict[str, Any]]:
    starters = raw.get("starters") or []
    cards = [*starters, *(raw.get("subs") or [])] if "starters" in raw else raw.get("cards") or []
    bench = {i for i, slot in enumerate((raw.get("scoring") or {}).get("slots") or []) if slot.get("sub")}
    return [
        {
            "slug": card["slug"],
            "player": card.get("player") or card["slug"],
            "name": card.get("name") or card["slug"],
            "pos": card.get("pos") or SHORT.get((card.get("positions") or [""])[0], ""),
            "club": card.get("club"),
            "score": None,
            "played": None,
            "captain": bool(card.get("captain")),
            "sub": i >= len(starters) if "starters" in raw else card.get("index") in bench,
        }
        for i, card in enumerate(cards)
        if card.get("slug")
    ]


# ------------------------------------------------------------------------------------------------ what a lineup fits
def fits(cards: list[dict[str, Any]], fixtures: dict[str, dict[str, Any]] | None) -> list[str]:
    """The strategies a lineup happens to fit, by their keys. Every lineup is a mix of them: yours was not built by one. The ones that
    need the week's games (who plays whom, the odds, the chance he plays) are only judged when those were kept."""
    found: list[str] = []
    keepers = [c for c in cards if c["pos"] == "GK"]
    if keepers and any(c["pos"] == "DEF" and c["club"] == keepers[0]["club"] for c in cards):
        found.append("keeper-defender")
    clubs = [c["club"] for c in cards if c["club"]]
    if clubs and max(clubs.count(club) for club in set(clubs)) >= 3:
        found.append("club-stack")
    if fixtures is None or not all(c["player"] in fixtures for c in cards):
        return found

    def games(card: dict[str, Any]) -> list[dict[str, Any]]:
        return fixtures[card["player"]].get("games") or []

    if keepers:
        mine = {(g["id"], g.get("venue")) for g in games(keepers[0])}
        facing = any(
            (g["id"], "A" if g.get("venue") == "H" else "H") in mine
            for c in cards
            if c["pos"] in ("MID", "FWD")
            for g in games(c)
        )
        if not facing:
            found.append("no-clash")
    if all((fixtures[c["player"]].get("p") or 0) >= strategies.SUREST for c in cards):
        found.append("surest")
    if all(strategies.favourite(games(c)) for c in cards):
        found.append("favourites")
    return found


# ------------------------------------------------------------------------------------------------ a week
class _Week:
    """One week's tallies and boards while it is read."""

    def __init__(
        self, db: Session, slug: str, info: dict[str, Any], fixtures: dict[str, dict[str, Any]] | None
    ) -> None:
        self.slug = slug
        self.best = hindsight_best(db, slug)
        self.fixtures = fixtures
        self.boards: dict[str, dict[str, Any]] = {}
        self.settled = True
        self.out: dict[str, Any] = {
            "slug": slug,
            "number": info.get("number"),
            "end": info["end"],
            "strategies": {},
            "cutoffTests": {},
            "diagnosis": {},
            "sofix": None,
            "sorare": None,
            "you": None,
        }

    def board(self, slug: str, comp: str | None, key: str | None) -> dict[str, Any]:
        board = self.boards.setdefault(slug, {"board": slug, "comp": comp, "key": key, "rows": []})
        board["comp"] = board["comp"] or comp
        board["key"] = board["key"] or key
        board["best"] = self.best.get(board["key"])
        return board

    def judge(
        self,
        who: str,
        label: str,
        raws: list[dict[str, Any]],
        games: dict[str, list[str]],
        actuals: Any,
        cuts_of: dict[str, Any],
    ) -> dict[str, Any]:
        """Score one source's lineups, put each on its board and return the source's tally for the week."""
        tally = _tally()
        for raw in raws:
            tally["lineups"] += 1
            line = _score(raw, games, actuals, with_cards=True)
            if line["score"] is None:
                unavailable = line.get("reason") == "incomplete-plan"
                tally["unavailable" if unavailable else "pending"] += 1
                self.settled = self.settled and unavailable
                self.board(raw.get("board") or raw.get("key") or "", raw.get("comp"), raw.get("key"))["rows"].append(
                    {
                        "who": who,
                        "label": label,
                        "score": None,
                        "state": "unavailable" if unavailable else "pending",
                        "x": raw.get("x"),
                        "lo": raw.get("lo"),
                        "hi": raw.get("hi"),
                        "verdict": None,
                        "beat": [],
                        "won": None,
                        "fits": [],
                        "cards": _unknown_cards(raw),
                    }
                )
                continue
            tally["scored"] += 1
            tally["points"] += line["score"]
            if raw.get("key") in self.best:
                tally["best"] += self.best[raw["key"]]
                tally["pointsVs"] += line["score"]
                tally["against"] += 1
            cuts = {int(r): float(v) for r, v in ((cuts_of.get(raw.get("key")) or {}).get("cuts") or {}).items()}
            won = prize(raw, line["score"], cuts)
            if won is not None:
                tally["judged"] += 1
                tally["said"] += float(raw.get("pReturn") or 0.0)
                tally["won"][won] += 1
            elif raw.get("tiers"):
                tally["rewardPending"] += 1
                self.settled = False
            returns = tier_amounts(raw, line["score"], won, cuts)
            collect(tally, returns)
            if who in DIAGNOSED or who.startswith("cutoff-"):
                _diagnose(self.out["diagnosis"].setdefault(who, _diagnosis(label)), raw, line, won, cuts)
            said = line.get("verdict")
            if said:
                tally["verdicts"][said["label"]] += 1
            starters = [c for c in line["cards"] if not c["sub"]]
            self.board(raw.get("board") or raw.get("key") or "", raw.get("comp"), raw.get("key"))["rows"].append(
                {
                    "who": who,
                    "label": label,
                    "score": line["score"],
                    "x": raw.get("x"),
                    "lo": raw.get("lo"),
                    "hi": raw.get("hi"),
                    "verdict": said["label"] if said else None,
                    "beat": said["beat"] if said else [],
                    "won": won,
                    "returns": returns,
                    "fits": fits(starters, self.fixtures),
                    "cards": line["cards"],
                }
            )
        return tally

    def yours(self, saved: dict[str, Any]) -> dict[str, Any] | None:
        """Your entered lineups from the saved week; a known score counts even while its rank is pending."""
        tally = _tally()
        for line in saved.get("lineups") or []:
            result = line.get("result")
            if line.get("draft"):
                continue
            tally["lineups"] += 1
            if not result or result.get("score") is None:
                tally["pending"] += 1
                self.settled = False
                self.board(line.get("board") or line.get("id") or "", line.get("competition"), None)["rows"].append(
                    {
                        "who": "you",
                        "label": "You",
                        "score": None,
                        "state": "pending",
                        "x": None,
                        "lo": None,
                        "hi": None,
                        "verdict": None,
                        "beat": [],
                        "won": None,
                        "fits": [],
                        "cards": _unknown_cards(line),
                    }
                )
                continue
            kind = (
                "card"
                if result.get("card")
                else "cash"
                if (result.get("cash") or 0) > 0
                else "essence"
                if (result.get("essence") or 0) > 0
                else "xp"
                if (result.get("xp") or 0) > 0
                else "none"
            )
            if result.get("rank") is None:
                kind = None
                tally["rewardPending"] += 1
                self.settled = False
            returns = amounts(result, line) if kind is not None else None
            collect(tally, returns)
            score = float(result["score"])
            board = self.board(line.get("board") or line.get("id") or "", None, None)
            slots = (line.get("scoring") or {}).get("slots") or []
            cards = [
                {
                    "slug": c["slug"],
                    "player": c.get("player") or c["slug"],
                    "name": c.get("name") or c["slug"],
                    "pos": SHORT.get((c.get("positions") or [""])[0], ""),
                    "club": c.get("club"),
                    "score": c.get("score"),
                    "played": c.get("score") is not None,
                    "captain": bool(c.get("captain")),
                    "sub": bool(slots[c["index"]].get("sub"))
                    if c.get("index") is not None and c["index"] < len(slots)
                    else False,
                }
                for c in line.get("cards") or []
            ]
            if board["key"] in self.best:
                tally["best"] += self.best[board["key"]]
                tally["pointsVs"] += score
                tally["against"] += 1
            tally["scored"] += 1
            tally["points"] += score
            if kind is not None:
                tally["judged"] += 1
                tally["won"][kind] += 1
            board["comp"] = board["comp"] or line.get("competition")
            board["rows"].insert(
                0,
                {
                    "who": "you",
                    "label": "You",
                    "score": score,
                    "x": None,
                    "lo": None,
                    "hi": None,
                    "verdict": None,
                    "beat": [],
                    "won": kind,
                    "returns": returns,
                    "rank": result.get("rank"),
                    "fits": fits([c for c in cards if not c["sub"]], self.fixtures),
                    "cards": cards,
                },
            )
        return tally if tally["lineups"] else None


def week_of(
    db: Session,
    slug: str,
    lab: dict[str, Any],
    frozen: dict[str, Any],
    now: datetime,
    references: dict[str, Any],
) -> dict[str, Any]:
    other = _body(db, f"{ALT_PREFIX}{slug}")
    saved = _body(db, f"{MY_WEEK}{slug}") or _body(db, f"{ENTERED_WEEK}{slug}")
    info = (lab or frozen or other).get("gameweek") or saved
    players = (frozen.get("playing") or {}).get("players") or []
    maps = {"lab": lab.get("games") or {}, "sofix": games_of(frozen), "sorare": games_of(other)}
    # Older alternative payloads omit playing; fall back only for players they do not name themselves.
    maps["sorare"] = {**maps["sofix"], **maps["sorare"]}
    every: dict[str, list[str]] = {}
    for mapping in maps.values():
        for player, ids in mapping.items():
            every[player] = sorted(set(every.get(player, [])) | set(ids))
    actuals = results(db, every)
    fixtures = {p["player"]: {"games": p.get("games") or [], "p": p.get("p")} for p in players} or None
    reference = references.get(slug) or {}
    week = _Week(db, slug, info, fixtures)
    for entry in lab.get("strategies") or []:
        week.out["strategies"][entry["key"]] = week.judge(
            entry["key"], entry["label"], entry.get("lineups") or [], maps["lab"], actuals, reference
        )
    for source, payload, who, label in (
        ("sofix", frozen, "sofix", "Sofix plan 1"),
        ("sorare", other, "sorare-plan", "Sorare plan 1"),
    ):
        plan = next((p for i, p in enumerate(payload.get("plans") or []) if p.get("rank", i + 1) == 1), None)
        if plan:
            week.out[source] = week.judge(who, label, plan.get("lineups") or [], maps[source], actuals, reference)
    tracked = lab.get("cutoffTests") or []
    for entry in tracked:
        tally = week.judge(entry["key"], entry["label"], entry.get("lineups") or [], maps["lab"], actuals, reference)
        week.out["cutoffTests"][entry["key"]] = {**tally, "label": entry["label"]}
    week.out["you"] = week.yours(saved)
    hidden = {entry["key"] for entry in tracked}  # a test of the planner, not a lineup to compare on the week's boards
    for board in week.boards.values():
        board["rows"] = [row for row in board["rows"] if row["who"] not in hidden]
        board["rows"].sort(
            key=lambda r: (r["who"] != "you", r["score"] is None, -(r["score"] or 0), r["who"] != "sofix")
        )
    week.out["boards"] = [b for b in week.boards.values() if b["rows"]]
    end = as_utc(datetime.fromisoformat(info["end"]))
    has_plans = any(
        t and t["scored"] for t in [*week.out["strategies"].values(), week.out["sofix"], week.out["sorare"]]
    )
    week.out["final"] = now >= end + SETTLE and week.settled and (not has_plans or bool(week.best))
    return week.out


def read(db: Session, now: datetime, *, write: bool = True) -> dict[str, Any]:
    kept = _body(db, KEY)
    stamps = {
        key: as_utc(at).isoformat()
        for key, at in db.execute(
            select(ReadModel.key, ReadModel.updated_at).where(
                or_(*(ReadModel.key.like(f"{prefix}%") for prefix in (*PREFIXES, ARCHIVE_PREFIX)))
            )
        )
    }
    slugs = {key.removeprefix(prefix) for key in stamps for prefix in PREFIXES if key.startswith(prefix)}
    references = kept_references(db)
    weeks: dict[str, Any] = dict(kept.get("weeks") or {})
    for slug in sorted(slugs):
        inputs = {key: stamps[key] for prefix in (*PREFIXES, ARCHIVE_PREFIX) if (key := f"{prefix}{slug}") in stamps}
        inputs["reference"] = hashlib.sha256(
            json.dumps(references.get(slug) or {}, sort_keys=True).encode()
        ).hexdigest()
        previous = weeks.get(slug) or {}
        if kept.get("version") == VERSION and previous.get("final") and previous.get("inputs") == inputs:
            continue
        lab, frozen = _body(db, f"{STRATEGY_PREFIX}{slug}"), _body(db, f"{PLAN_PREFIX}{slug}")
        other = _body(db, f"{ALT_PREFIX}{slug}") if not lab and not frozen else {}
        saved = (
            (_body(db, f"{MY_WEEK}{slug}") or _body(db, f"{ENTERED_WEEK}{slug}"))
            if not (lab or frozen or other)
            else {}
        )
        end = ((lab or frozen or other).get("gameweek") or saved).get("end")
        if not end or now <= as_utc(datetime.fromisoformat(end)):
            continue
        weeks[slug] = {**week_of(db, slug, lab, frozen, now, references), "inputs": inputs}
    if write and (weeks != (kept.get("weeks") or {}) or kept.get("version") != VERSION):
        put(db, KEY, {"version": VERSION, "weeks": weeks}, now)
    if write:
        put(db, TRACKING_KEY, tracking(list(weeks.values())), now)
    return page(list(weeks.values()))


def page(weeks: list[dict[str, Any]]) -> dict[str, Any]:
    """What the Audit shows: every strategy's sums over the season (a strategy with no week yet is there with nothing in it), Sofix's best
    plan and yours beside them, and week by week (newest first)."""
    weeks = sorted(weeks, key=lambda w: w["end"], reverse=True)
    season: dict[str, dict[str, Any]] = {s.key: {**_tally(), "weeks": 0} for s in strategies.STRATEGIES}
    sofix, sorare, mine = ({**_tally(), "weeks": 0} for _ in range(3))
    for week in weeks:
        for key, tally in week["strategies"].items():
            if key in season:
                _add(season[key], tally)
                season[key]["weeks"] += 1
        for total, part in ((sofix, week.get("sofix")), (sorare, week.get("sorare")), (mine, week.get("you"))):
            if part:
                _add(total, part)
                total["weeks"] += 1
    listed = [{"key": s.key, "label": s.label, "note": s.note, **season[s.key]} for s in strategies.STRATEGIES]
    return {
        "strategies": listed,
        "sofix": sofix,
        "sorare": sorare,
        "you": mine,
        "decision": decision_of(weeks),
        "weeks": [
            {**{k: v for k, v in week.items() if k not in HIDDEN}, "decision": decision_of([week])} for week in weeks
        ],
    }


def track_record(audit: dict[str, Any] | None) -> dict[str, Any] | None:
    """Sofix's plan against what happened, over the audited weeks (plans/plan-algorithm-v2.md step 8): how many of its judged lineups it
    expected to be paid (their chances added up) and how many were. None until a lineup has been judged."""
    said, paid, judged, weeks = 0.0, 0, 0, []
    for week in sorted(((audit or {}).get("weeks") or {}).values(), key=lambda w: w.get("number") or 0):
        sofix = week.get("sofix") or {}
        if not sofix.get("judged"):
            continue
        said += float(sofix.get("said") or 0.0)
        won = sofix.get("won") or {}
        paid += sum(int(won.get(k) or 0) for k in ("card", "cash", "essence"))  # XP is never paid
        judged += int(sofix["judged"])
        weeks.append(week.get("number"))
    if not judged:
        return None
    return {
        "said": round(said, 1),
        "paid": paid,
        "judged": judged,
        "weeks": len(weeks),
        "from": weeks[0],
        "to": weeks[-1],
    }
