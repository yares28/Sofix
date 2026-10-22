"""Prepare and freeze complete European replay cases before opening accuracy metrics."""

from __future__ import annotations

import argparse
import hashlib
import json
import math
from collections import Counter
from datetime import timedelta
from pathlib import Path
from typing import Any

from app.research.european_alignment import align
from app.research.european_data import COMPETITIONS, validate_page
from app.research.european_facts import regulation, venue
from app.research.european_metadata import actual_window, validate
from app.research.european_xscore_data import game_snapshot, starting_eleven
from app.research.league_xscore_data import when
from app.research.league_xscore_validation import POSITIONS, _eleven, clean_label

TRAINING_EXCEPTIONS = {
    ("CONF", 2023): {"2039295", "2039335", "2039302", "2039311", "2039326", "2039358", "2039383"},
    ("CONF", 2024): {"2042294", "2042311", "2042314"},
}
EXPECTED = {
    "CL": {2023: 125, 2024: 189, 2025: 189},
    "EL": {2023: 141, 2024: 189, 2025: 189},
    "CONF": {2023: 141, 2024: 153, 2025: 153},
}


def read(path: Path) -> Any:
    return json.loads(path.read_text(encoding="utf-8"))


def digest(value: Any) -> str:
    return hashlib.sha256(
        json.dumps(value, sort_keys=True, separators=(",", ":"), allow_nan=False).encode()
    ).hexdigest()


def native_rows(folder: Path, code: str, season: int) -> list[dict[str, Any]]:
    manifest = read(folder / f"{code}-{season}-manifest.json")
    if manifest.get("paginationComplete") is not True:
        raise ValueError("Incomplete native calendar pagination")
    rows = []
    for page in manifest["pages"]:
        path = folder / f"{code}-{season}-offset{page['offset']}-{page['sha256']}.json"
        blob = path.read_bytes()
        if hashlib.sha256(blob).hexdigest() != page["sha256"]:
            raise ValueError("Changed native source packet")
        batch = json.loads(blob)
        validate_page(batch, code, season)
        rows.extend(batch)
    if len({r["id"] for r in rows}) != len(rows):
        raise ValueError("Repeated native source fixture")
    return rows


def is_main(row: dict[str, Any]) -> bool:
    return (row.get("competitionPhase") or (row.get("round") or {}).get("phase")) == "TOURNAMENT"


def extra_time(raw: dict[str, Any]) -> bool:
    score = raw.get("score") or {}
    return bool(
        score.get("penalty")
        or score.get("regular") != score.get("total")
        or any(
            e.get("phase") in {"EXTRA_TIME_FIRST_HALF", "EXTRA_TIME_SECOND_HALF"}
            for e in (raw.get("playerEvents") or {}).get("scorers") or []
        )
    )


def football_row(code: str, season: int, raw: dict[str, Any]) -> dict[str, Any]:
    outcome, ground = regulation(raw), venue(raw)
    if outcome["score90"] is None or ground["neutral"] is None:
        raise ValueError(f"Unresolved regulation/venue {code} {raw['id']}: {outcome['basis']} / {ground['basis']}")
    date = when(raw["kickOffTime"]["dateTime"])
    return {
        "id": raw["id"],
        "competition": code,
        "season": season,
        "date": date.isoformat(),
        "availableAt": (date + timedelta(days=2)).isoformat(),
        "availableAtBasis": "retrospective kickoff plus two days; not an archived publication timestamp",
        "sourceFullTimeAt": raw.get("fullTimeAt"),
        "sourceSha256": digest(raw),
        "extraTime": extra_time(raw),
        "home": raw["homeTeam"]["id"],
        "away": raw["awayTeam"]["id"],
        "hg": outcome["score90"][0],
        "ag": outcome["score90"][1],
        "neutral": ground["neutral"],
        "outcome": outcome,
        "venue": ground,
        "stadium": raw.get("stadium"),
        "phase": "league"
        if (raw.get("round") or {}).get("mode") == "GROUP" and season >= 2024
        else "group"
        if (raw.get("round") or {}).get("mode") == "GROUP"
        else "knockout",
        "leg": raw.get("leg"),
        "sourceAggregateAfterMatch": (raw.get("score") or {}).get("aggregate"),
        "round": (raw.get("round") or {}).get("id"),
    }


def admitted_starters(saved: dict[str, Any]) -> list[dict[str, Any]]:
    raw = saved["raw"]
    sides = {}
    for side in ("home", "away"):
        formation = raw.get(side + "Formation") or {}
        if not starting_eleven(formation):
            raise ValueError("Missing authoritative 22-player XI")
        for slug in _eleven(formation["startingLineup"]):
            if slug in sides:
                raise ValueError("Repeated authoritative XI identity")
            sides[slug] = raw[side + "Team"]["slug"]
    starters = [p for p in saved["players"] if p["slug"] in sides]
    if len(starters) != 22 or {p["slug"] for p in starters} != set(sides):
        raise ValueError("Scores do not cover all 22 authoritative starters")
    for player in starters:
        score = player.get("score")
        if (
            player.get("started") is not True
            or player.get("played") is not True
            or player.get("status") != "FINAL"
            or player.get("ver") != 7
            or player.get("pos") not in POSITIONS
            or player.get("team") != sides[player["slug"]]
            or not isinstance(score, (int, float))
            or isinstance(score, bool)
            or not math.isfinite(score)
            or not 0 <= score <= 100
            or player.get("level") is None
            or (player["pos"] == "GK" and clean_label(player) is None)
        ):
            raise ValueError("Invalid final starter score, role, version, identity or playing evidence")
    return starters


def player_game(
    code: str, season: int, native: dict[str, Any], saved: dict[str, Any], metadata: dict[str, Any]
) -> dict[str, Any]:
    raw = saved["raw"]
    validate(code, raw, metadata)
    week, lock = actual_window(metadata)
    # A resumed match's outcomes cannot become available at its original kickoff.
    available = max(when(native["availableAt"]), when(raw["date"]) + timedelta(days=2))
    return {
        **native,
        "competition": code,
        "season": season,
        "sorareId": raw["id"],
        "sourceDate": raw["date"],
        "availableAt": available.isoformat(),
        "week": week,
        "lock": lock.isoformat(),
        "homeSlug": raw["homeTeam"]["slug"],
        "awaySlug": raw["awayTeam"]["slug"],
        "players": admitted_starters(saved),
        "scoreSourceSha256": digest(raw),
        "fixtureSourceSha256": digest(metadata),
    }


def prepare(source: Path, history: Path) -> dict[str, Any]:
    football = []
    administrative = []
    for code in COMPETITIONS:
        for season in range(2021, 2026):
            for raw in native_rows(history, code, season):
                if not is_main(raw):
                    continue
                if raw.get("status") != "FINISHED":
                    administrative.append(
                        {"competition": code, "season": season, "id": raw["id"], "status": raw.get("status")}
                    )
                    continue
                football.append(football_row(code, season, raw))
    by_native = {(r["competition"], r["id"]): r for r in football}
    games, excluded, alignments = [], [], []
    for code in COMPETITIONS:
        folder = source / code
        index, metadata = read(folder / "index.json"), read(folder / "metadata.json")
        for season in (2023, 2024, 2025):
            native = native_rows(folder / "uefa", code, season)
            # Season boundaries, not calendar-day intersection: resumed games can change date.
            selected = [r for r in index if f"{season}-06-01" <= r["date"][:10] < f"{season + 1}-07-01"]
            alignment = align(code, season, native, selected)
            main = [r for r in native if is_main(r) and r.get("status") == "FINISHED"]
            ids = {r["id"] for r in main}
            links = {r["uefa"]: r["sorare"] for r in alignment["matches"] if r["uefa"] in ids}
            conflicts = [r for r in alignment["conflicts"] if r.get("uefa") in ids or not r.get("uefa")]
            if set(links) != ids or conflicts or len(ids) != EXPECTED[code][season]:
                raise ValueError(
                    f"Incomplete main-stage alignment {code} {season}: missing={sorted(ids - set(links))}, conflicts={conflicts}, count={len(ids)}"
                )
            alignments.append(
                {"competition": code, "season": season, "mainGames": len(main), "alignmentSha256": digest(alignment)}
            )
            exceptions = TRAINING_EXCEPTIONS.get((code, season), set())
            if not exceptions <= ids:
                raise ValueError("Approved training exception missing from official population")
            for raw in main:
                ident, source_id = raw["id"], links[raw["id"]]
                path = folder / "games" / (hashlib.sha256(source_id.encode()).hexdigest() + ".json")
                saved = read(path)
                expected = next(r for r in selected if r["id"] == source_id)
                checked = game_snapshot(code, expected, saved["raw"])
                if saved["players"] != checked["players"]:
                    raise ValueError("Normalized player snapshot differs from authentic raw source")
                validate(code, saved["raw"], metadata[source_id])
                week, lock = actual_window(metadata[source_id])
                football_case = by_native[(code, ident)]
                football_case.update(week=week, lock=lock.isoformat(), sorareId=source_id)
                football_case["availableAt"] = max(
                    when(football_case["availableAt"]), when(saved["raw"]["date"]) + timedelta(days=2)
                ).isoformat()
                if ident in exceptions:
                    excluded.append(
                        {
                            "competition": code,
                            "season": season,
                            "id": ident,
                            "sorareId": source_id,
                            "sourceSha256": hashlib.sha256(path.read_bytes()).hexdigest(),
                            "reason": "owner-approved training-only incomplete source; result kept in FDR",
                        }
                    )
                    continue
                games.append(player_game(code, season, by_native[(code, ident)], saved, metadata[source_id]))
    # Use the later source date for result availability in both football and player replays.
    for game in games:
        by_native[(game["competition"], game["id"])]["availableAt"] = game["availableAt"]
    return {
        "version": 3,
        "football": football,
        "games": sorted(games, key=lambda g: (g["date"], g["id"])),
        "administrative": administrative,
        "trainingSourceExclusions": excluded,
        "alignments": alignments,
        "protocolSha256": hashlib.sha256(Path("../plans/european-model-validation.md").read_bytes()).hexdigest(),
        "runnerSha256": hashlib.sha256(Path(__file__).read_bytes()).hexdigest(),
        "modelEligible": False,
    }


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--source", type=Path, default=Path("data/raw/european-xscore-download"))
    parser.add_argument("--history", type=Path, default=Path("data/raw/european"))
    parser.add_argument("--out", type=Path, default=Path("data/raw/european-cases.json"))
    args = parser.parse_args()
    result = prepare(args.source, args.history)
    result["caseSha256"] = digest(result)
    args.out.write_text(json.dumps(result, separators=(",", ":"), allow_nan=False), encoding="utf-8")
    print(
        json.dumps(
            {
                "caseSha256": result["caseSha256"],
                "football": len(result["football"]),
                "games": dict(Counter(f"{g['competition']}-{g['season']}" for g in result["games"])),
                "trainingExclusions": len(result["trainingSourceExclusions"]),
                "modelEligible": False,
            }
        )
    )


if __name__ == "__main__":
    main()
