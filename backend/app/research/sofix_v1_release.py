"""Build the portable Sofix v1 artifact and replay it against the previous LaLiga formula."""

from __future__ import annotations

import argparse
import gzip
import hashlib
import json
import sys
from collections import defaultdict
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from pathlib import Path
from typing import Any

import numpy as np

from app.sorare import forecast, keeper, outfield, sofix_v1

PHASES = (
    ("2024-01-01", "2024-07-01"),
    ("2024-07-01", "2025-07-01"),
    ("2025-07-01", "2026-01-01"),
    ("2026-01-01", "2026-11-01"),
)


def cutoff_for(when: datetime) -> datetime:
    """The historical fixture replay uses the most recent Tuesday or Friday 14:00 UTC lock."""
    when = when.astimezone(UTC)
    day = when.replace(hour=14, minute=0, second=0, microsecond=0)
    return next(
        candidate
        for delta in range(8)
        if (candidate := day - timedelta(days=delta)) <= when and candidate.weekday() in (1, 4)
    )


@dataclass
class Case:
    lock: datetime
    when: datetime
    pos: str
    home: bool
    numbers: keeper.GameNumbers | None
    past: list[dict[str, Any]]
    score: float
    decisive: bool
    role: str
    clean_sheet: bool


def cases(games: list[dict[str, Any]], context: dict[str, Any]) -> list[Case]:
    history: dict[str, list[dict[str, Any]]] = defaultdict(list)
    result = []
    for game in sorted(games, key=lambda g: (g["date"], g["id"])):
        date = game["date"]
        when = datetime.fromisoformat(date.replace("Z", "+00:00"))
        lock = cutoff_for(when)
        ctx = context.get(game["id"])
        if ctx and datetime.fromisoformat(ctx["before"]) > lock:
            raise ValueError("The fixture inputs are from after lock")
        for player, row in game["players"].items():
            if (
                row.get("played") is not True
                or type(row.get("started")) is not bool
                or row.get("score") is None
                or row.get("ver") != 7
                or row.get("pos") not in sofix_v1.POSITIONS
            ):
                continue
            home = row["team"] == game["home"]["slug"]
            numbers = None
            if ctx:
                own, other = ("h", "a") if home else ("a", "h")
                numbers = keeper.GameNumbers(ctx[f"cs_{own}"], ctx[f"lam_{other}"], ctx[f"lam_{own}"])
            past = sofix_v1.eligible(history[player], lock)
            result.append(
                Case(
                    lock,
                    when,
                    row["pos"],
                    home,
                    numbers,
                    past,
                    float(row["score"]),
                    float(row.get("level") or 0) >= 60,
                    "start" if row["started"] else "bench",
                    game["awayGoals" if home else "homeGoals"] == 0,
                )
            )
            history[player].append({**row, "date": date, "competition": keeper.LALIGA})
    return result


def fit(rows: list[Case]) -> sofix_v1.Model:
    from sklearn.ensemble import ExtraTreesRegressor

    trees: dict[str, Any] = {}
    for role in ("start", "bench"):
        group = [r for r in rows if r.role == role and r.numbers is not None]
        x = np.array([sofix_v1.features(r.pos, r.home, r.numbers, r.past) for r in group if r.numbers is not None])
        y = np.array([r.score for r in group])
        bins = np.rint(y).astype(int) + 101 * np.array([r.decisive for r in group])
        forest = ExtraTreesRegressor(n_estimators=36, max_depth=5, min_samples_leaf=30, random_state=26, n_jobs=4)
        forest.fit(x, y)
        packed = []
        for estimator in forest.estimators_:
            tree = estimator.tree_
            leaves = estimator.apply(x)
            nodes = []
            for i in range(tree.node_count):
                if tree.children_left[i] < 0:
                    values, counts = np.unique(bins[leaves == i], return_counts=True)
                    nodes.append([values.tolist(), counts.tolist()])
                else:
                    nodes.append(
                        [
                            int(tree.feature[i]),
                            float(tree.threshold[i]),
                            int(tree.children_left[i]),
                            int(tree.children_right[i]),
                        ]
                    )
            packed.append(nodes)
        trees[role] = packed
    return sofix_v1.Model(trees)


def previous(rows: list[Case]) -> tuple[keeper.KeeperModel | None, dict[str, outfield.OutfieldModel]]:
    gks, field = [], []
    for r in rows:
        if r.role != "start" or r.numbers is None:
            continue
        if r.pos == "GK":
            gks.append(keeper.Start("", r.when, "", r.numbers, None, r.score, r.decisive, r.clean_sheet))
        else:
            dec, mean = outfield.own_record([p["score"] for p in r.past if p["started"]])
            field.append(
                outfield.OutfieldStart("", r.when, "", r.pos, r.numbers, r.home, None, dec, mean, r.score, r.decisive)
            )
    return keeper.fit(gks), outfield.fit_all(field)


def fallback(r: Case) -> float:
    recent = [p["score"] for p in r.past[:5] if p["started"] is (r.role == "start")]
    prior = forecast.PRIOR_START_SCORE if r.role == "start" else forecast.PRIOR_SUB_SCORE
    if not recent and r.role == "start":
        played = [p["score"] for p in r.past[:5]]
        return (sum(played) + 2 * forecast.PRIOR_SCORE) / (len(played) + 2)
    return (sum(recent) + 2 * prior) / (len(recent) + 2)


def assess(model: sofix_v1.Model, train: list[Case], test: list[Case]) -> dict[str, Any]:
    gks, field = previous(train)
    results: dict[str, Any] = {}
    for role in ("start", "bench"):
        scores = []
        for r in test:
            if r.role != role:
                continue
            old = fallback(r)
            if role == "start" and r.numbers is not None:
                if r.pos == "GK" and gks:
                    old = gks.predict(r.numbers).start
                elif r.pos in field:
                    dec, mean = outfield.own_record([p["score"] for p in r.past if p["started"]])
                    old = field[r.pos].predict(r.numbers, r.home, dec, mean)
            new = model.predict(r.pos, r.home, r.numbers, r.past, role=role) if r.numbers else None
            scores.append((r.score, round(old, 1), new.point if new else old, new.outcome.start if new else old))
        actual, old, point, mean = np.array(scores).T
        old_ok, new_ok = abs(old - actual) <= 7 + 1e-9, abs(point - actual) <= 7 + 1e-9
        results[role] = {
            "cases": len(actual),
            "previousHits": int(old_ok.sum()),
            "hits": int(new_ok.sum()),
            "meanHits": int((abs(mean - actual) <= 7 + 1e-9).sum()),
            "gained": int((new_ok & ~old_ok).sum()),
            "spoiled": int((old_ok & ~new_ok).sum()),
            "previousMAE": float(abs(old - actual).mean()),
            "mae": float(abs(point - actual).mean()),
            "meanMAE": float(abs(mean - actual).mean()),
        }
    return results


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--games", type=Path, required=True)
    parser.add_argument("--football", type=Path, required=True)
    parser.add_argument("--packages", type=Path, required=True)
    parser.add_argument("--report", type=Path, required=True)
    parser.add_argument("--artifact", type=Path, required=True)
    args = parser.parse_args()
    sys.path.insert(0, str(args.packages.resolve()))
    raw = args.games.read_bytes()
    context = json.loads(args.football.read_bytes())["context"]
    rows = cases([json.loads(line) for line in raw.splitlines() if line.strip()], context)
    report: dict[str, Any] = {"sourceSha256": hashlib.sha256(raw).hexdigest(), "phases": []}
    for start, end in PHASES:
        first_lock = min(r.lock for r in rows if start <= r.when.date().isoformat() < end)
        train = [r for r in rows if r.when + sofix_v1.DELAY < first_lock]
        test = [r for r in rows if start <= r.when.date().isoformat() < end]
        scores = assess(fit(train), train, test)
        phase = {"from": start, "to": end, "trainCases": len(train), **scores}
        print(json.dumps(phase), flush=True)
        report["phases"].append(phase)
    args.report.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    model = fit(rows)
    args.artifact.write_bytes(
        gzip.compress(
            json.dumps(
                {
                    "version": sofix_v1.VERSION,
                    "trainedThrough": (max(r.when for r in rows) + sofix_v1.DELAY).isoformat(),
                    "trees": model.trees,
                },
                separators=(",", ":"),
            ).encode(),
            mtime=0,
        )
    )


if __name__ == "__main__":
    main()
