"""Complete, per-club foreign player indexes; a failed read preserves identity, not old forecasts."""

from __future__ import annotations

import argparse
import json
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

from app.research.league_xscore_data import LEAGUES
from app.sorare import sync
from app.sorare.client import SorareClient, SorareError
from app.sorare.model import SORARE_POSITION

SIZES = {"PL": 20, "BL1": 18}


def expired(row: dict[str, Any]) -> dict[str, Any]:
    player = dict(row.get("player") or {})
    for key in ("plan", "ahead0", "ahead1"):
        player[key] = []
    player.update(nextClassicFixtureProjectedScore=None, nextClassicFixturePlayingStatusOdds=None)
    return {**row, "projection": None, "player": player, "fresh": False}


def rows(index: dict[str, Any]) -> list[dict[str, Any]]:
    found = {}
    for club, players in index.get("clubs", {}).items():
        for row in players:
            if ((row.get("player") or {}).get("activeClub") or {}).get("slug") == club:
                found[row["slug"]] = row
    return sorted(found.values(), key=lambda p: p["slug"])


def collect_index(
    client: Any, code: str, fixture: str, now: datetime, previous: dict[str, Any] | None = None
) -> dict[str, Any]:
    if code not in LEAGUES:
        raise ValueError("Only the requested leagues are allowed")
    prior = (previous or {}).get("clubs") or {}
    kept = {club: [expired(row) for row in players] for club, players in prior.items()}
    errors = []
    try:
        clubs = client.query(sync.CLUBS, {"s": LEAGUES[code]})["football"]["competition"]["teams"]["nodes"]
        slugs = {c["slug"] for c in clubs}
        if len(clubs) != SIZES[code] or len(slugs) != SIZES[code]:
            raise ValueError("Incomplete current club list")
    except (SorareError, ValueError, KeyError, TypeError) as error:
        return {
            "competition": code,
            "week": fixture,
            "at": now.isoformat(),
            "complete": False,
            "clubs": kept,
            "errors": [str(error)[:200]],
        }
    kept = {club: players for club, players in kept.items() if club in slugs}
    for club in sorted(slugs):
        try:
            players = sync._squad(client, club, fixture, strict=True)
            if not players:
                raise ValueError("Empty squad")
            parsed = []
            for player in players:
                slug = player.get("slug")
                if not slug:
                    raise ValueError("Missing player identity")
                active = player.get("activeClub") or {}
                parsed.append(
                    {
                        "slug": slug,
                        "name": player.get("displayName") or slug,
                        "pos": SORARE_POSITION.get(player.get("position") or ""),
                        "club": active.get("shortName") or active.get("name"),
                        "crest": active.get("pictureUrl"),
                        "average": player.get("average"),
                        "projection": player.get("nextClassicFixtureProjectedScore"),
                        "eur": sync._market_price(player),
                        "pic": player.get("pictureUrl") or player.get("avatarPictureUrl") or "",
                        "player": player,
                        "fresh": True,
                    }
                )
            kept[club] = parsed
        except (SorareError, ValueError, KeyError, TypeError) as error:
            errors.append(f"{club}: {str(error)[:150]}")
    return {
        "competition": code,
        "week": fixture,
        "at": now.isoformat(),
        "complete": not errors and len(kept) == SIZES[code],
        "clubs": kept,
        "errors": errors,
    }


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--league", choices=LEAGUES, required=True)
    parser.add_argument("--out", type=Path, default=Path("data/raw/league-xscore-current"))
    args = parser.parse_args()
    now = datetime.now(UTC)
    with SorareClient(pause=0.75) as client:
        if not client.api_key:
            raise RuntimeError("Use the existing unattended read-only key")
        selected = sync.pick_gameweeks(sync.gameweeks(client, now=now), now)["plan"]
        index = collect_index(client, args.league, selected["slug"], now)
        index["sourceCalls"] = client.calls
    args.out.mkdir(parents=True, exist_ok=True)
    (args.out / f"{args.league}.json").write_text(json.dumps(index), encoding="utf-8")
    print(
        json.dumps(
            {
                "competition": args.league,
                "complete": index["complete"],
                "clubs": len(index["clubs"]),
                "players": len(rows(index)),
                "errors": index["errors"],
            }
        )
    )
    return 0 if index["complete"] else 1


if __name__ == "__main__":
    raise SystemExit(main())
