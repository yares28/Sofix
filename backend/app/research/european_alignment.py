"""Fact-only fixture reconciliation: exact published labels or unique oriented game evidence.

No fuzzy spelling, outcome-selected identity, sporting-successor rules or model metrics.
Bindings apply only to the explicitly supplied competition edition. Every missing and
conflicting case stays in the denominator; successful alignment alone admits no score90.
"""

from __future__ import annotations

from collections import defaultdict
from typing import Any

from app.research.european_data import validate_page
from app.research.league_xscore_data import when

# Exact source packets reviewed before metrics. A link identifies one match only;
# it cannot override its clubs, UTC date, score or either captured kickoff.
KICKOFF_LINKS = {
    ("CONF", 2025, "2046324"): (
        "Game:65c06d8a-da06-4481-8c75-ceab14c182cc",
        "52356",
        "50033",
        "rijeka-rijeka",
        "sparta-praha-praha",
        "2025-10-23T16:45:00Z",
        "2025-10-24T14:00:00Z",
    ),
    ("EL", 2023, "2039194"): (
        "Game:5d6a8203-b7fe-4714-afb9-5e819b6aebfd",
        "64125",
        "52934",
        "union-saint-gilloise-bruxelles-brussels",
        "toulouse-toulouse",
        "2023-09-21T16:45:00Z",
        "2023-09-21T16:55:00Z",
    ),
    ("EL", 2025, "2045825"): (
        "Game:3d2e9a0f-e388-4380-bf24-547cede80daa",
        "57477",
        "52723",
        "maccabi-tel-aviv-tel-aviv-yafa-tel-aviv",
        "dynamo-kyiv-kyiv-kiev",
        "2025-08-21T18:00:00Z",
        "2025-08-21T18:15:00Z",
    ),
    ("EL", 2025, "2046279"): (
        "Game:9aa4a41a-c735-4f15-8331-34e277c8fdcc",
        "52323",
        "61582",
        "utrecht-utrecht",
        "genk-genk",
        "2026-01-22T20:00:00Z",
        "2026-01-22T20:50:00Z",
    ),
}


def align(code: str, season: int, uefa: list[dict[str, Any]], sorare: list[dict[str, Any]]) -> dict[str, Any]:
    # The complete edition can exceed a source page. Validate exact population individually.
    for row in uefa:
        validate_page([row], code, season)
    if len({r["id"] for r in uefa}) != len(uefa) or len({r["id"] for r in sorare}) != len(sorare):
        raise ValueError("Repeated fixture identity")
    labels: dict[str, set[str]] = defaultdict(set)
    for row in uefa:
        for side in ("homeTeam", "awayTeam"):
            team = row.get(side) or {}
            if not team.get("id") or team.get("isPlaceHolder") is not False:
                continue
            names = {team.get("internationalName")}
            translated = team.get("translations") or {}
            for key in ("displayName", "displayOfficialName", "shortName"):
                names.add((translated.get(key) or {}).get("EN"))
            for name in names:
                if name:
                    labels[name].add(team["id"])
    source_names: dict[str, set[str]] = defaultdict(set)
    for row in sorare:
        for side in ("homeTeam", "awayTeam"):
            team = row.get(side) or {}
            if team.get("slug") and team.get("name"):
                source_names[team["slug"]].add(team["name"])
    bindings: dict[str, str] = {}
    evidence = []
    conflicts = []

    def bind(slug: str, ident: str, proof: dict[str, Any]) -> bool:
        existing = bindings.get(slug)
        if existing:
            if existing != ident:
                conflicts.append({"reason": "club identity conflict", "slug": slug, "native": ident})
            return False
        if ident in bindings.values():
            conflicts.append({"reason": "two Sorare slugs name one native club", "slug": slug, "native": ident})
            return False
        bindings[slug] = ident
        evidence.append({"slug": slug, "native": ident, **proof})
        return True

    for slug, source_labels in source_names.items():
        native_ids: set[str] = set().union(*(labels[n] for n in source_labels))
        if len(native_ids) == 1:
            bind(
                slug,
                next(iter(native_ids)),
                {"basis": "exact published English club label", "labels": sorted(source_labels)},
            )
    by_time: dict[Any, list[dict[str, Any]]] = defaultdict(list)
    for row in uefa:
        kickoff = (row.get("kickOffTime") or {}).get("dateTime")
        if kickoff:
            by_time[when(kickoff)].append(row)
    # Propagate only from a known oriented opponent at the exact same UTC kickoff,
    # never from scores, same-day uniqueness alone, substrings or transliteration.
    for _ in range(len(source_names) + 1):
        changed = False
        for row in sorare:
            home, away = (
                str((row.get("homeTeam") or {}).get("slug") or ""),
                str((row.get("awayTeam") or {}).get("slug") or ""),
            )
            known_home, known_away = bindings.get(home), bindings.get(away)
            if bool(known_home) == bool(known_away):
                continue
            options = [
                u
                for u in by_time.get(when(row["date"]), [])
                if (known_home is None or (u.get("homeTeam") or {}).get("id") == known_home)
                and (known_away is None or (u.get("awayTeam") or {}).get("id") == known_away)
            ]
            if len(options) == 1:
                native = options[0]
                side, slug = ("awayTeam", away) if known_home else ("homeTeam", home)
                team = native.get(side) or {}
                if slug and team.get("id") and team.get("isPlaceHolder") is False:
                    changed |= bind(
                        slug,
                        team["id"],
                        {
                            "basis": "unique oriented fixture and exact kickoff",
                            "uefa": native["id"],
                            "sorare": row["id"],
                        },
                    )
        if not changed:
            break
    matches = []
    kickoff_differences = []
    used: set[str] = set()
    unmatched = []
    for row in sorare:
        mapped_home = bindings.get(str((row.get("homeTeam") or {}).get("slug") or ""))
        mapped_away = bindings.get(str((row.get("awayTeam") or {}).get("slug") or ""))
        options = [
            u
            for u in by_time.get(when(row["date"]), [])
            if mapped_home
            and mapped_away
            and (u.get("homeTeam") or {}).get("id") == mapped_home
            and (u.get("awayTeam") or {}).get("id") == mapped_away
        ]
        if not options and mapped_home and mapped_away:
            for native in uefa:
                link = KICKOFF_LINKS.get((code, season, native["id"]))
                if not link:
                    continue
                native_time = (native.get("kickOffTime") or {}).get("dateTime")
                if (
                    row["id"],
                    mapped_home,
                    mapped_away,
                    (row.get("homeTeam") or {}).get("slug"),
                    (row.get("awayTeam") or {}).get("slug"),
                ) != link[:5]:
                    continue
                if (
                    (native.get("homeTeam") or {}).get("id") != mapped_home
                    or (native.get("awayTeam") or {}).get("id") != mapped_away
                    or not native_time
                    or when(native_time) != when(link[5])
                    or when(row["date"]) != when(link[6])
                ):
                    continue
                options.append(native)
                kickoff_differences.append(
                    {
                        "uefa": native["id"],
                        "sorare": row["id"],
                        "uefaKickoff": native_time,
                        "sorareKickoff": row["date"],
                        "basis": "reviewed exact source fixture link; both timestamps retained",
                    }
                )
        if len(options) != 1:
            unmatched.append(row["id"])
            continue
        native = options[0]
        if native["id"] in used:
            raise ValueError("Repeated source mapping to the same UEFA fixture")
        used.add(native["id"])
        matches.append({"uefa": native["id"], "sorare": row["id"], "phase": native.get("competitionPhase")})
        total = (native.get("score") or {}).get("total") or {}
        if any(total.get(s) != row.get(f"{s}Goals") for s in ("home", "away")):
            conflicts.append({"uefa": native["id"], "sorare": row["id"], "reason": "score totals differ"})
        if native.get("status") != "FINISHED" or row.get("statusTyped") != "played":
            conflicts.append({"uefa": native["id"], "sorare": row["id"], "reason": "not two completed source statuses"})
    missing = sorted(row["id"] for row in uefa if row["id"] not in used)
    return {
        "competition": code,
        "seasonStart": season,
        "expected": len(uefa),
        "source": len(sorare),
        "matches": matches,
        "bindings": bindings,
        "evidence": evidence,
        "missingUefa": missing,
        "missingSorare": unmatched,
        "conflicts": conflicts,
        "kickoffDifferences": kickoff_differences,
        "complete": bool(uefa) and not missing and not unmatched and not conflicts,
        "modelEligible": False,
    }
