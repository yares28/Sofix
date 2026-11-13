"""Replay each competition's live xScore and Sofix v1-style candidates on the same pre-lock cases.

    cd backend
    PYTHONPATH=<formula-packages> .venv/Scripts/python reports/experiments/other_competitions/evaluate.py PL BL1 FL1 \
        --variants old laliga_v1 own all_hist pooled --out reports/experiments/other_competitions/results/domestic.json

Within 7 is inclusive, on the conditional score (starters, played substitutes apart), as in plans/sofix-v1.md.
"""

from __future__ import annotations

import argparse
import json
from collections import defaultdict
from pathlib import Path
from typing import Any

import numpy as np

from app.research import sofix_v1_release as rel
from app.research.sofix_v1_competitions import (
    EUROPE,
    SLUGS,
    Case,
    build,
    domestic_numbers,
    european_numbers,
    past,
    read,
    trees,
)
from app.sorare import foreign_scores, outfield, sofix_v1

PHASES = (("2025-07-01", "2026-07-01"), ("2026-07-01", "2027-01-01"))
LIVE_CODES = {"PL", "BL1", "FL1", "CL", "EL", "CONF"}


def as_release(case: Case, scope: str) -> rel.Case:
    return rel.Case(
        case.lock,
        case.when,
        case.pos,
        case.home,
        case.numbers,
        past(case, scope),
        case.score,
        case.decisive,
        case.role,
        False,
    )


def old_point(case: Case, bundle: foreign_scores.Models | None) -> float:
    """The live formula: the competition's validated keeper/outfield model for a starter with fixture numbers, else the
    recent-average fallback (forecast.PRIOR_*), as sofix_v1_release.fallback replays it for LaLiga."""
    r = as_release(case, "own")
    if case.role == "start" and case.numbers is not None and bundle is not None:
        own = [float(g["score"]) for g in r.past if g["started"]]
        if case.comp in EUROPE:  # the live European models read his main-stage starts in all three cups
            cups = set(EUROPE.values())
            own = [
                float(g["score"])
                for g in past(case, "all")
                if g["started"] and g["competition"] in cups and g["at"].month not in (7, 8)
            ]
        dec, mean = outfield.own_record(own)
        if case.pos == "GK":
            return round(bundle.keeper.predict(case.numbers, None).start, 1)
        if case.pos in bundle.outfield:
            return round(bundle.outfield[case.pos].predict(case.numbers, case.home, dec, mean, None), 1)
    return round(rel.fallback(r), 1)


def score(cases: list[Case], points: np.ndarray, old: np.ndarray, means: np.ndarray) -> dict[str, Any]:
    actual = np.array([c.score for c in cases])
    ok, was = np.abs(points - actual) <= 7 + 1e-9, np.abs(old - actual) <= 7 + 1e-9
    weeks: dict[Any, list[int]] = defaultdict(list)
    for i, c in enumerate(cases):
        weeks[c.lock].append(i)
    groups = list(weeks.values())
    diff = np.array([ok[g].sum() - was[g].sum() for g in groups])
    rng = np.random.default_rng(20261113)
    draws = diff[rng.integers(0, len(groups), size=(2000, len(groups)))].sum(axis=1) if groups else np.zeros(1)
    return {
        "cases": len(cases),
        "hits": int(ok.sum()),
        "rate": round(float(ok.mean()), 4) if len(cases) else None,
        "mae": round(float(np.abs(points - actual).mean()), 2) if len(cases) else None,
        "gained": int((ok & ~was).sum()),
        "spoiled": int((was & ~ok).sum()),
        "netCI95": [int(np.quantile(draws, 0.025)), int(np.quantile(draws, 0.975))],
        "meanHits": int((np.abs(means - actual) <= 7 + 1e-9).sum()),
        "bigMisses": int((np.abs(points - actual) > 25).sum()),
    }


def run(codes: list[str], variants: list[str], pool: list[str]) -> dict[str, Any]:
    wanted = sorted(set(codes) | (set(pool) if any(v.startswith("pooled") for v in variants) else set()))
    numbers = {c: domestic_numbers(c, read(SLUGS[c])) for c in wanted if c in ("PL", "BL1", "FL1", "LL")}
    if any(c in EUROPE for c in wanted):
        shared = european_numbers()
        numbers.update({c: shared for c in wanted if c in EUROPE})
    cases = build(wanted, numbers)
    print({c: sum(1 for x in cases if x.comp == c) for c in wanted}, flush=True)
    bundles = {c: foreign_scores.load(c) for c in codes if c in LIVE_CODES}
    laliga = sofix_v1.load()
    report: dict[str, Any] = {"phases": []}
    for start, end in PHASES:
        test_all = [c for c in cases if start <= c.when.date().isoformat() < end]
        if not test_all:
            continue
        first_lock = min(c.lock for c in test_all)
        train_all = [c for c in cases if c.when + sofix_v1.DELAY < first_lock]
        fitted: dict[tuple[str, str], sofix_v1.Model] = {}
        phase: dict[str, Any] = {"from": start, "to": end, "competitions": {}}
        for code in codes:
            test = [c for c in test_all if c.comp == code]
            train = [c for c in train_all if c.comp == code]
            if not test:
                continue
            entry: dict[str, Any] = {"trainCases": len(train)}
            old = np.array([old_point(c, bundles.get(code)) for c in test])
            for variant in variants:
                if variant == "old":
                    points, means = old, old
                else:
                    scope = ("all" if "all_hist" in variant else "own") + "".join(ch for ch in variant if ch.isdigit())
                    plain = "plain" in variant
                    shape = (120, 7, 20) if plain and "small" not in variant else (36, 5, 30)
                    if variant == "laliga_v1":
                        model = laliga
                    elif variant.startswith("pooled"):
                        key = (variant, "")
                        if key not in fitted:
                            fitted[key] = trees(
                                [c for c in train_all if c.comp in pool], scope, plain=plain, shape=shape
                            )
                        model = fitted[key]
                    else:
                        model = trees(train, scope, plain=plain, shape=shape)
                    preds = [
                        model.predict(c.pos, c.home, c.numbers, past(c, scope), role=c.role) if c.numbers else None
                        for c in test
                    ]
                    points = np.array([p.point if p else o for p, o in zip(preds, old, strict=True)])
                    means = np.array([p.outcome.start if p else o for p, o in zip(preds, old, strict=True)])
                entry[variant] = {
                    role: score(
                        [c for c in test if c.role == role],
                        points[[c.role == role for c in test]],
                        old[[c.role == role for c in test]],
                        means[[c.role == role for c in test]],
                    )
                    for role in ("start", "bench")
                }
                print(start, code, variant, json.dumps(entry[variant]), flush=True)
            entry["noNumbers"] = sum(1 for c in test if c.numbers is None)
            phase["competitions"][code] = entry
        report["phases"].append(phase)
    return report


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("codes", nargs="+")
    parser.add_argument("--variants", nargs="+", default=["old", "own"])
    parser.add_argument("--pool", nargs="+", default=["PL", "BL1", "FL1", "LL"])
    parser.add_argument("--out", type=Path, required=True)
    args = parser.parse_args()
    report = run(args.codes, args.variants, args.pool)
    args.out.parent.mkdir(parents=True, exist_ok=True)
    args.out.write_text(json.dumps(report, indent=1) + "\n", encoding="utf-8")


if __name__ == "__main__":
    main()
