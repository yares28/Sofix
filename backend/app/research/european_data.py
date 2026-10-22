"""Bounded European source inventory. Nothing here admits training cases or publishes models.

UEFA's public website batch retains qualifiers, administrative entries, period fields,
placeholders and actual source identities. A terminal page proves pagination only;
it does not prove every fixture was played or every score describes regulation time.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import time
from collections import Counter, defaultdict
from collections.abc import Callable
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from pathlib import Path
from typing import Any

import httpx


@dataclass(frozen=True)
class Competition:
    uefa: str
    native_code: str
    sorare: str
    league_games: int


COMPETITIONS = {
    "CL": Competition("1", "UCL", "uefa-champions-league", 8),
    "EL": Competition("14", "UEL", "uefa-europa-league", 8),
    "CONF": Competition("2019", "UECL", "uefa-europa-conference-league", 6),
}
PAGE_SIZE = 500
MAX_PAGES = 6
BASE = "https://match.uefa.com/v5/matches"
CLUBS_QUERY = """
query($slug:String!,$after:String){football{competition(slug:$slug){slug
 teams(first:50,after:$after){nodes{slug name} pageInfo{hasNextPage endCursor}}
}}}
"""


def validate_page(rows: Any, code: str, season: int) -> list[str]:
    competition = COMPETITIONS[code]
    if not isinstance(rows, list) or len(rows) > PAGE_SIZE:
        raise ValueError("Unexpected UEFA page shape")
    ids = []
    for row in rows:
        source = row.get("competition") or {}
        if any(
            source.get(key) != value
            for key, value in {
                "id": competition.uefa,
                "code": competition.native_code,
                "sex": "MALE",
                "teamCategory": "CLUB",
            }.items()
        ):
            raise ValueError("Wrong UEFA competition population")
        if str(row.get("seasonYear")) != str(season + 1):
            raise ValueError("Wrong UEFA season")
        ident = row.get("id")
        if not isinstance(ident, str) or not ident:
            raise ValueError("Missing UEFA match ID")
        ids.append(ident)
    if len(ids) != len(set(ids)):
        raise ValueError("Repeated UEFA match ID")
    return ids


def reported_pair(raw: Any) -> dict[str, int | None]:
    values = {side: (raw or {}).get(side) for side in ("home", "away")}
    if any(v is not None and (type(v) is not int or v < 0) for v in values.values()):
        raise ValueError("Invalid reported goal")
    return values


def inventory_match(raw: dict[str, Any], code: str, season: int) -> dict[str, Any]:
    validate_page([raw], code, season)
    round_data = raw.get("round") or {}
    top, sub = raw.get("competitionPhase"), round_data.get("phase")
    phase = top or sub
    if top and sub and top != sub:
        phase = None
    phase = (
        "qualifying"
        if phase == "QUALIFYING"
        else ("league" if season >= 2024 else "group")
        if phase == "TOURNAMENT" and round_data.get("mode") == "GROUP"
        else "knockout"
        if phase == "TOURNAMENT" and round_data.get("mode") in {"KNOCK_OUT", "FINAL"}
        else "unresolved"
    )
    teams = {}
    for side in ("home", "away"):
        team = raw.get(f"{side}Team") or {}
        teams[side] = f"uefa:{team['id']}" if team.get("id") and team.get("isPlaceHolder") is False else None
    score = raw.get("score") or {}
    kickoff = (raw.get("kickOffTime") or {}).get("dateTime")
    if kickoff is not None:
        parsed = datetime.fromisoformat(kickoff.replace("Z", "+00:00"))
        if parsed.tzinfo is None:
            raise ValueError("UEFA kickoff has no timezone")
        kickoff = parsed.astimezone(UTC).isoformat()
    return {
        "id": f"uefa:{raw['id']}",
        "competition": code,
        "seasonStart": season,
        "phase": phase,
        "round": round_data.get("id"),
        "roundType": (round_data.get("metaData") or {}).get("type"),
        "matchday": raw.get("matchday"),
        "leg": raw.get("leg"),
        "status": raw.get("status"),
        **teams,
        "kickoff": kickoff,
        "date": (raw.get("kickOffTime") or {}).get("date"),
        "stadium": raw.get("stadium"),
        "neutral": None,
        "reportedRegular": reported_pair(score.get("regular")),
        "reportedTotal": reported_pair(score.get("total")),
        "reportedPenalty": reported_pair(score.get("penalty")),
        "score90": None,
        "modelEligible": False,
    }


def league_phase_coverage(rows: list[dict[str, Any]], code: str, season: int) -> dict[str, Any]:
    league = [r for r in rows if r["phase"] == "league"]
    opponents: dict[str, list[str]] = defaultdict(list)
    homes: Counter[str] = Counter()
    aways: Counter[str] = Counter()
    for row in league:
        home, away = row["home"], row["away"]
        if home is not None and away is not None and home != away:
            opponents[home].append(away)
            opponents[away].append(home)
            homes[home] += 1
            aways[away] += 1
    games = COMPETITIONS[code].league_games
    complete = (
        season >= 2024
        and len(league) == 36 * games // 2
        and len(opponents) == 36
        and all(len(o) == len(set(o)) == games and homes[t] == aways[t] == games // 2 for t, o in opponents.items())
    )
    return {
        "complete": complete,
        "clubs": len(opponents),
        "fixtures": len(league),
        "expectedFixtures": 36 * games // 2 if season >= 2024 else None,
    }


def sorare_clubs(query: Callable[..., Any], code: str) -> list[dict[str, Any]]:
    after = None
    cursors: set[str] = set()
    clubs: dict[str, dict[str, Any]] = {}
    for _ in range(20):
        competition = query(CLUBS_QUERY, {"slug": COMPETITIONS[code].sorare, "after": after})["football"]["competition"]
        if not competition or competition.get("slug") != COMPETITIONS[code].sorare:
            raise ValueError("Wrong Sorare competition identity")
        page = competition["teams"]
        for club in page["nodes"]:
            slug = club.get("slug")
            if not slug or slug in clubs:
                raise ValueError("Repeated or missing Sorare club identity")
            clubs[slug] = club
        info = page["pageInfo"]
        if not info["hasNextPage"]:
            if not clubs:
                raise ValueError("Empty Sorare club connection")
            return sorted(clubs.values(), key=lambda row: row["slug"])
        after = info.get("endCursor")
        if not after or after in cursors:
            raise ValueError("Incomplete Sorare club cursor")
        cursors.add(after)
    raise ValueError("Sorare club pagination budget exceeded")


def digest(body: bytes) -> str:
    return hashlib.sha256(body).hexdigest()


def fetch_inventory(
    client: httpx.Client,
    code: str,
    season: int,
    folder: Path,
    *,
    now: datetime | None = None,
    force: bool = False,
    sleep: Callable[[float], Any] = time.sleep,
) -> dict[str, Any]:
    """Cache exact pages before normalization, check hashes on reuse, never publish incomplete pages.

    Immutable completed editions are reused indefinitely; the current edition expires
    after six hours. HTTP limits stop immediately, preserving the previous snapshot.
    """
    now = now or datetime.now(UTC)
    competition = COMPETITIONS[code]
    folder.mkdir(parents=True, exist_ok=True)
    manifest_path = folder / f"{code}-{season}-manifest.json"
    cached = json.loads(manifest_path.read_text(encoding="utf-8")) if manifest_path.exists() else {}
    fresh = cached and now - datetime.fromisoformat(cached["retrievedAt"]) < timedelta(hours=6)
    completed_edition = season + 1 < now.year or (season + 1 == now.year and now.month >= 7)
    reuse = bool(cached and not force and (fresh or completed_edition))
    seen: set[str] = set()
    rows = []
    receipts = []
    for page in range(MAX_PAGES):
        offset = page * PAGE_SIZE
        url = f"{BASE}?competitionId={competition.uefa}&seasonYear={season + 1}&limit={PAGE_SIZE}&offset={offset}"
        if reuse:
            receipts_cached = cached["pages"]
            if page >= len(receipts_cached) or receipts_cached[page]["offset"] != offset:
                raise ValueError("Missing cached pagination segment")
            target = folder / f"{code}-{season}-offset{offset}-{receipts_cached[page]['sha256']}.json"
            body = target.read_bytes()
            if digest(body) != receipts_cached[page]["sha256"]:
                raise ValueError("UEFA cache checksum mismatch")
        else:
            response = client.get(url)
            response.raise_for_status()
            body = response.content
            target = folder / f"{code}-{season}-offset{offset}-{digest(body)}.json"
        raw = json.loads(body)
        ids = validate_page(raw, code, season)
        if seen.intersection(ids):
            raise ValueError("Repeated match IDs across UEFA pages")
        seen.update(ids)
        if not raw and page == 0:
            raise ValueError("Empty UEFA edition is not a complete inventory")
        normalized = [inventory_match(r, code, season) for r in raw]
        if not reuse:
            target.write_bytes(body)
        receipts.append({"url": url, "offset": offset, "records": len(raw), "bytes": len(body), "sha256": digest(body)})
        rows.extend(normalized)
        if len(raw) < PAGE_SIZE:
            break
        if not reuse:
            sleep(2)
    else:
        raise ValueError("UEFA pagination budget exceeded")
    inventory = {
        "competition": code,
        "seasonStart": season,
        "retrievedAt": cached["retrievedAt"] if reuse else now.isoformat(),
        "paginationComplete": True,
        "pages": receipts,
        "fixtures": rows,
        "phases": dict(Counter(r["phase"] for r in rows)),
        "statuses": dict(Counter(r["status"] for r in rows)),
        "leaguePhase": league_phase_coverage(rows, code, season),
        "modelEligible": False,
    }
    if not reuse:
        pending = manifest_path.with_suffix(".pending")
        pending.write_text(json.dumps(inventory, ensure_ascii=False, indent=2), encoding="utf-8")
        pending.replace(manifest_path)
    return inventory


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--league", choices=COMPETITIONS, required=True)
    parser.add_argument("--season", type=int, required=True, help="Season start year")
    parser.add_argument("--folder", type=Path, default=Path("data/raw/european"))
    parser.add_argument("--force", action="store_true")
    args = parser.parse_args()
    with httpx.Client(
        timeout=45, headers={"User-Agent": "Sofix/1.0 (personal, read-only; cached UEFA inventory)"}
    ) as client:
        result = fetch_inventory(client, args.league, args.season, args.folder, force=args.force)
    print(
        json.dumps(
            {
                key: result[key]
                for key in ("competition", "seasonStart", "phases", "statuses", "leaguePhase", "modelEligible")
            }
        )
    )


if __name__ == "__main__":
    main()
