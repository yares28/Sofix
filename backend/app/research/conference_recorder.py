"""Automatic pre-lock Conference research; durable evidence, no production promotion."""

from __future__ import annotations

import argparse
import hashlib
import json
from datetime import UTC, datetime, timedelta
from pathlib import Path
from typing import Any

import httpx
import numpy as np

from app.modeling.dixon_coles import outcome_table
from app.research import conference_acceptance
from app.research.conference_candidate import average_numbers
from app.research.conference_development import mixture
from app.research.conference_recording import Archive, capture_allowed, seal, select_capture
from app.research.european_alignment import align
from app.research.european_cases import admitted_starters, digest, football_row, is_main, read
from app.research.european_facts import venue
from app.research.european_metadata import QUERY as METADATA_QUERY
from app.research.european_metadata import actual_window
from app.research.european_metadata import validate as validate_metadata
from app.research.european_model import fit
from app.research.european_validation import own_before
from app.research.european_xscore_data import game_snapshot
from app.research.league_xscore_data import when
from app.services import european_sources, r2
from app.sorare import european_history, foreign_history, keeper, outfield
from app.sorare.client import SorareClient, SorareError
from app.sorare.model import SORARE_POSITION

ROOT = Path(__file__).resolve().parents[3]
CANDIDATE = ROOT / "docs/european_validation/CONF-candidate-v2.json"
PROTOCOL = ROOT / "plans/conference-prospective.md"
FUTURE_QUERY = """
query($after:String){football{competition(slug:"uefa-europa-conference-league"){slug
 futureGames(first:50,after:$after){nodes{id date competition{slug}
 homeTeam{slug name} awayTeam{slug name} so5Fixture{slug startDate endDate cutOffDate}}
 pageInfo{hasNextPage endCursor}}
}}}
"""
SQUAD_QUERY = """
query($slug:String!,$after:String){football{club(slug:$slug){slug
 activePlayers(first:50,after:$after){nodes{slug position activeClub{slug}}
 pageInfo{hasNextPage endCursor}}
}}}
"""


def future_games(client: Any) -> list[dict[str, Any]]:
    found: dict[str, dict[str, Any]] = {}
    after = None
    seen = set()
    for _ in range(5):
        competition = client.query(FUTURE_QUERY, {"after": after})["football"]["competition"]
        if competition["slug"] != "uefa-europa-conference-league":
            raise ValueError("Wrong future competition identity")
        page = competition["futureGames"]
        for row in page["nodes"]:
            if row["id"] in found:
                raise ValueError("Repeated future source game")
            found[row["id"]] = row
        if not page["pageInfo"]["hasNextPage"]:
            return list(found.values())
        after = page["pageInfo"]["endCursor"]
        if not after or after in seen:
            raise ValueError("Future game cursor did not advance")
        seen.add(after)
    raise ValueError("Future competition pagination budget exhausted")


def squad(client: Any, slug: str, *, evidence: dict[str, Any] | None = None) -> list[dict[str, Any]]:
    players = {}
    raw_players = []
    noncurrent = []
    after = None
    seen = set()
    for _ in range(4):
        club = client.query(SQUAD_QUERY, {"slug": slug, "after": after})["football"]["club"]
        if not club or club["slug"] != slug:
            raise ValueError("Wrong squad identity")
        page = club["activePlayers"]
        for player in page["nodes"]:
            raw_players.append(player)
            if player["position"] == "Coach":
                continue
            if (player.get("activeClub") or {}).get("slug") != slug:
                noncurrent.append(player)
                continue
            if player["slug"] in players:
                raise ValueError(f"Duplicate current player in {slug}: {player['slug']}")
            players[player["slug"]] = player
        if not page["pageInfo"]["hasNextPage"]:
            if len(players) < 11:
                raise ValueError("Incomplete active squad")
            if evidence is not None:
                evidence[slug] = {"rawPlayers": raw_players, "nonCurrent": noncurrent}
            return list(players.values())
        after = page["pageInfo"]["endCursor"]
        if not after or after in seen:
            raise ValueError("Squad cursor did not advance")
        seen.add(after)
    raise ValueError("Squad page budget exhausted")


def forecast_players(
    candidate: dict[str, Any],
    squads: dict[str, list[dict[str, Any]]],
    prediction: dict[str, float],
    history: dict[str, Any],
    now: datetime,
    *,
    lock: datetime | None = None,
) -> dict[str, Any]:
    km = keeper.KeeperModel(**candidate["keeper"])
    om = {pos: outfield.OutfieldModel(**model) for pos, model in candidate["outfield"].items()}
    result = {}
    for i, (team, players) in enumerate(squads.items()):
        home = i == 0
        numbers = keeper.GameNumbers(
            cs=prediction["cs_h" if home else "cs_a"],
            xga=prediction["lam_a" if home else "lam_h"],
            xgf=prediction["lam_h" if home else "lam_a"],
        )
        for player in players:
            if player["position"] == "Coach":
                continue
            slug = player["slug"]
            if slug in result:
                raise ValueError("Player repeated across actual match sides")
            pos = SORARE_POSITION.get(player["position"], "UNK")
            own = [
                (when(g["date"]), when(g["availableAt"]), float(g["starts"][slug]))
                for g in history.values()
                if g.get("mainStage") is True
                and g.get("settled") is True
                and g.get("competition") in {"CL", "EL", "CONF"}
                and slug in g.get("starts", {})
                and when(g["availableAt"]) < now
                and when(g["date"]) < now
            ]
            dec, mean, form, starts = own_before(own, lock or now)
            score, bare = None, None
            if pos == "GK":
                score, bare = km.predict(numbers, None).start, candidate["noFdr"]["GK"]["mean"]
            elif pos in om:
                score = om[pos].predict(numbers, home, dec, mean, None)
                bare = float(np.clip(np.dot(candidate["noFdr"][pos]["coef"], [1, float(home), dec, mean]), 0, 100))
            result[slug] = {
                "pos": pos,
                "team": team,
                "prediction": score,
                "baseline": form,
                "ablation": bare,
                "ownStarts": starts,
            }
    return result


def settle_players(
    snapshot: dict[str, Any], starters: list[dict[str, Any]], week: str, game: str
) -> list[dict[str, Any]]:
    if len(starters) != 22 or len({p["slug"] for p in starters}) != 22:
        raise ValueError("All 22 authentic starters required")
    rows = []
    for player in starters:
        saved = snapshot["players"].get(player["slug"])
        if (
            not saved
            or saved["pos"] != player["pos"]
            or saved["team"] != player["team"]
            or saved["prediction"] is None
            or saved["ablation"] is None
        ):
            raise ValueError("Starter role/actual side not completely captured before lock")
        rows.append({**saved, "player": player["slug"], "score": float(player["score"]), "week": week, "game": game})
    return rows


def load_candidate(path: Path = CANDIDATE) -> dict[str, Any]:
    candidate = read(path)
    if candidate["candidateSha256"] != digest({k: v for k, v in candidate.items() if k != "candidateSha256"}):
        raise ValueError("Frozen candidate checksum changed")
    if candidate["validated"] is not False or candidate["modelEligible"] is not False:
        raise ValueError("Recorder requires a research-only candidate")
    for name in ("research/european_model.py", "modeling/dixon_coles.py", "sorare/keeper.py", "sorare/outfield.py"):
        if candidate["dependencies"][name] != hashlib.sha256((ROOT / "backend/app" / name).read_bytes()).hexdigest():
            raise ValueError(f"Frozen forecasting implementation changed: {name}")
    return candidate


def record_game(
    client: Any,
    archive: Archive,
    state: dict[str, Any],
    candidate: dict[str, Any],
    native: dict[str, Any],
    source: dict[str, Any],
    model: Any,
    history: Any,
    squads: dict[str, list[dict[str, Any]]],
    facts_at: datetime,
    *,
    squad_evidence: dict[str, Any] | None = None,
) -> None:
    week, lock = actual_window(source)
    if not capture_allowed(datetime.now(UTC), lock, when(candidate["frozenAt"])):
        raise ValueError("Outside pre-lock capture window")
    neutral = venue(native)["neutral"]
    if type(neutral) is not bool:
        raise ValueError("Unresolved actual venue")
    club = model.predict([native["homeTeam"]["id"]], [native["awayTeam"]["id"]], neutral=[neutral]).iloc[0].to_dict()
    average_home = average_numbers(history.to_dict("records"), facts_at, neutral=neutral, home=True)
    average = outcome_table([average_home["xgf"]], [average_home["xga"]], 0.0, 10).iloc[0].to_dict()
    mixed = mixture(club, average, candidate["clubWeight"])
    for side in ("homeTeam", "awayTeam"):
        slug = source[side]["slug"]
        if slug not in squads:
            squads[slug] = squad(client, slug, evidence=squad_evidence)
    at = datetime.now(UTC)
    if not capture_allowed(at, lock, when(candidate["frozenAt"])):
        raise ValueError("Collection crossed actual Sorare deadline")
    sides = {source[s]["slug"]: squads[source[s]["slug"]] for s in ("homeTeam", "awayTeam")}
    players = forecast_players(candidate, sides, mixed, state["history"]["games"], at, lock=lock)
    pooled = history[
        np.array([facts_at - timedelta(days=730) <= when(v) < facts_at for v in history["date"]])
        & np.array([when(v) < facts_at for v in history["availableAt"]])
    ]
    cold = any(
        int(((pooled["home"] == native[s]["id"]) | (pooled["away"] == native[s]["id"])).sum()) < 5
        for s in ("homeTeam", "awayTeam")
    )
    prior = history[
        (history["competition"] == "CONF")
        & np.array([when(v) < facts_at for v in history["availableAt"]])
        & np.array([facts_at - timedelta(days=730) <= when(v) < facts_at for v in history["date"]])
    ]
    if prior.empty:
        raise ValueError("No available Conference comparator history")
    outcomes = np.where(prior["hg"] > prior["ag"], 0, np.where(prior["hg"] == prior["ag"], 1, 2))
    base = ((np.bincount(outcomes, minlength=3) + 1) / (len(outcomes) + 3)).tolist()
    snapshot = seal(
        {
            "candidateSha256": candidate["candidateSha256"],
            "capturedAt": at.isoformat(),
            "footballFactsAt": facts_at.isoformat(),
            "lock": lock.isoformat(),
            "week": week,
            "nativeId": native["id"],
            "source": source,
            "native": native,
            "squads": sides,
            "squadEvidence": {slug: (squad_evidence or {}).get(slug) for slug in sides},
            "football": mixed,
            "plain": [float(average[k]) for k in ("p_h", "p_d", "p_a")],
            "base": base,
            "players": players,
            "historySha256": digest(state["history"]),
            "neutral": neutral,
            "cold": cold,
            "recordingVersion": state["recordingVersion"],
            "protocolSha256": state["protocolSha256"],
        }
    )
    ref = archive.write_capture(snapshot, week=week, lock=lock)
    state["captures"].setdefault(native["id"], []).append(ref)
    archive.write_state(state)


def settle_game(client: Any, archive: Archive, state: dict[str, Any], native: dict[str, Any]) -> None:
    ident = native["id"]
    refs = state["captures"].get(ident, [])
    if not refs:
        raise ValueError("Missing pre-lock forecast; retrospective backfill forbidden")
    previous = archive.read_capture(refs[-1])
    current = client.query(METADATA_QUERY, {"ids": [previous["source"]["id"]]})["nodes"]
    if len(current) != 1 or not current[0]:
        raise ValueError("Missing actual settlement fixture")
    game = current[0]
    if (
        game["id"] != previous["source"]["id"]
        or (game.get("competition") or {}).get("slug") != "uefa-europa-conference-league"
        or any(game[s]["slug"] != previous["source"][s]["slug"] for s in ("homeTeam", "awayTeam"))
    ):
        raise ValueError("Changed settlement game or actual sides")
    week, lock = actual_window(game)
    ref = select_capture(refs, week, lock)
    if ref is None:
        raise ValueError("No forecast for the actual settled Sorare fixture")
    snapshot = archive.read_capture(ref)
    raw = client.query(foreign_history.QUERY, {"id": game["id"]})["anyGame"]
    saved = game_snapshot("CONF", game, raw)
    if raw.get("statusTyped") != "played" or european_history.pending_scores(saved):
        return
    starters = admitted_starters(saved)
    football = football_row("CONF", 2026, native)
    if any(raw.get(s + "Goals") != (native.get("score") or {}).get("total", {}).get(s) for s in ("home", "away")):
        raise ValueError("Official and Sorare final goals differ")
    players = settle_players(snapshot, starters, week, game["id"])
    for player in players:
        player.update(phase=football["phase"], neutral=football["neutral"], extraTime=football["extraTime"])
    evidence = archive.write_evidence(
        {"native": native, "raw": raw, "metadata": game, "settledAt": datetime.now(UTC).isoformat()}
    )
    state["settled"][ident] = {"football": football, "players": players, "capture": ref, "evidence": evidence}
    archive.write_state(state)


def run(client: Any, archive: Archive, folder: Path) -> dict[str, Any]:
    candidate = load_candidate()
    state = archive.read_state()
    if state.get("acceptance"):
        return state
    state["errors"] = []
    started = datetime.now(UTC)
    freeze = when(candidate["frozenAt"])
    state["frozenAt"] = candidate["frozenAt"]
    version = digest(
        {
            name: hashlib.sha256(Path(__file__).with_name(name).read_bytes()).hexdigest()
            for name in ("conference_recorder.py", "conference_recording.py", "conference_acceptance.py")
        }
    )
    if state.get("recordingVersion", version) != version and state["captures"]:
        raise ValueError("Recording implementation changed after prospective forecasts; review before continuing")
    state["recordingVersion"] = version
    protocol = hashlib.sha256(PROTOCOL.read_bytes()).hexdigest()
    if state.get("protocolSha256", protocol) != protocol and state["captures"]:
        raise ValueError("Prospective acceptance protocol changed after capture")
    state["protocolSha256"] = protocol
    calendars = european_sources.calendars(started)
    if 2026 not in calendars["CONF"]:
        raise ValueError("Prospective edition unavailable; never roll the holdout forward")
    native = {r["id"]: r for r in calendars["CONF"][2026] if is_main(r)}
    enrolled = state.setdefault("enrolled", {})
    for ident, row in native.items():
        date = (row.get("kickOffTime") or {}).get("dateTime")
        if ident in enrolled or not date or when(date) > freeze:
            enrolled.setdefault(ident, {"firstSeenAt": started.isoformat()})
    upcoming = future_games(client)
    prior_rows = [
        r
        for r in native.values()
        if (r.get("kickOffTime") or {}).get("dateTime") and when(r["kickOffTime"]["dateTime"]) <= freeze
    ]
    previous = (
        european_history.recent_index(client, "CONF", started) if not state.get("scopeProof") and prior_rows else []
    )
    bindings = dict(read(european_sources.REGISTRY)["bindings"])
    for slug, ident in state.get("bindings", {}).items():
        if slug in bindings and bindings[slug] != ident:
            raise ValueError("Retained source identity conflicts with the registry")
        bindings[slug] = ident
    derived = align("CONF", 2026, list(native.values()), [*previous, *upcoming])["bindings"]
    for slug, ident in derived.items():
        if slug in bindings and bindings[slug] != ident:
            raise ValueError("Conflicting future club identity")
        bindings[slug] = ident
    state["bindings"] = bindings
    excluded = state.setdefault("excluded", {})
    if not state.get("scopeProof"):
        prior_links = european_history.link_games(prior_rows, previous, bindings)
        if set(prior_links) != {r["id"] for r in prior_rows}:
            raise ValueError("Actual Sorare locks required before excluding old native kickoff dates")
        targets = {game["id"]: ident for ident, game in prior_links.items()}
        by_id = {game["id"]: game for game in prior_links.values()}
        metadata = []
        ids = list(targets)
        for offset in range(0, len(ids), 25):
            batch = ids[offset : offset + 25]
            rows = client.query(METADATA_QUERY, {"ids": batch})["nodes"]
            if len(rows) != len(batch) or any(not row for row in rows) or {row["id"] for row in rows} != set(batch):
                raise ValueError("Incomplete population cutoff metadata")
            for row in rows:
                validate_metadata("CONF", by_id[row["id"]], row)
                week, lock = actual_window(row)
                ident = targets[row["id"]]
                if lock <= freeze:
                    excluded[ident] = {"sourceId": row["id"], "lock": lock.isoformat(), "week": week}
                    enrolled.pop(ident, None)
                else:
                    enrolled.setdefault(ident, {"firstSeenAt": started.isoformat()})
                metadata.append(row)
        state["scopeProof"] = archive.write_evidence({"native": prior_rows, "actualCutoffs": metadata})
    links = european_history.link_games(list(native.values()), upcoming, bindings)
    eligible = []
    for ident, game in links.items():
        if not game.get("so5Fixture"):
            continue
        week, lock = actual_window(game)
        if lock <= freeze:
            excluded[ident] = {"sourceId": game["id"], "lock": lock.isoformat(), "week": week}
            enrolled.pop(ident, None)
        elif capture_allowed(started, lock, freeze):
            enrolled.setdefault(ident, {"firstSeenAt": started.isoformat()})["sourceId"] = game["id"]
            eligible.append((ident, game))
    # A first, real source proof reads every current club, even outside a capture window.
    squads: dict[str, list[dict[str, Any]]] = {}
    squad_evidence: dict[str, Any] = {}
    if not state.get("squadProof"):
        current_ids = {
            row[side]["id"]
            for row in native.values()
            if (row.get("round") or {}).get("mode") == "GROUP"
            for side in ("homeTeam", "awayTeam")
        }
        reverse = {ident: slug for slug, ident in bindings.items() if ident in current_ids}
        if len(current_ids) != 36 or len(reverse) != 36:
            raise ValueError(f"Full 36-club source identity proof incomplete: {sorted(current_ids - set(reverse))}")
        for slug in reverse.values():
            squads[slug] = squad(client, slug, evidence=squad_evidence)
        proof = {
            "at": datetime.now(UTC).isoformat(),
            "clubs": len(squads),
            "players": sum(len(p) for p in squads.values()),
            "squadsSha256": digest(squads),
            "nonCurrentSourceRows": sum(len(row["nonCurrent"]) for row in squad_evidence.values()),
        }
        proof["evidence"] = archive.write_evidence(
            {"squads": squads, "sourceRows": squad_evidence, "bindings": reverse}
        )
        state["squadProof"] = proof
        archive.write_state(state)
    if eligible:
        _, context = european_history.collect(client, started, state["history"], capture=folder / "history-games")
        state["history"] = context
        if not context["complete"]:
            state["errors"].append(
                {"stage": "history", "reason": "Incomplete pre-lock history", "details": context["errors"]}
            )
            eligible = []
    if eligible:
        history = european_sources.history(calendars)
        model = fit(
            history, started, teams={native[ident][s]["id"] for ident, _ in eligible for s in ("homeTeam", "awayTeam")}
        )
        for ident, game in eligible:
            try:
                record_game(
                    client,
                    archive,
                    state,
                    candidate,
                    native[ident],
                    game,
                    model,
                    history,
                    squads,
                    started,
                    squad_evidence=squad_evidence,
                )
            except (ValueError, KeyError, TypeError, SorareError) as error:
                state["errors"].append({"game": ident, "stage": "capture", "reason": str(error)[:240]})
    for ident, enrollment in enrolled.items():
        if ident not in native or enrollment.get("preFreezeLock") or ident in state["settled"]:
            continue
        if native[ident].get("status") != "FINISHED":
            continue
        try:
            settle_game(client, archive, state, native[ident])
        except (ValueError, KeyError, TypeError, SorareError) as error:
            state["errors"].append({"game": ident, "stage": "settlement", "reason": str(error)[:240]})
    state["at"] = datetime.now(UTC).isoformat()
    state["status"] = {
        "knownEligibleGames": sum(not v.get("preFreezeLock", False) for v in enrolled.values()),
        "capturedGames": len(state["captures"]),
        "settledGames": len(state["settled"]),
        "metricsOpened": False,
        "modelEligible": False,
    }
    state["status"]["waitingFor"] = conference_acceptance.closure_reasons(list(native.values()), state)
    if not state["status"]["waitingFor"]:
        report = conference_acceptance.evaluate(list(native.values()), state, archive)
        state["acceptance"] = report
        state["acceptanceEvidence"] = archive.write_evidence({"acceptance": report})
        state["status"]["metricsOpened"] = True
    archive.write_state(state)
    return state


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--out", type=Path, default=Path("data/raw/conference-recording"))
    args = parser.parse_args()
    args.out.mkdir(parents=True, exist_ok=True)
    try:
        if not r2.configured():
            raise ValueError("Durable research storage required; cache-only recording is not accepted")
        candidate = load_candidate()
        with SorareClient(pause=0.75) as client:
            if not client.api_key:
                raise ValueError("Use the existing unattended Sorare key; do not export it")
            state = run(client, Archive(candidate["candidateSha256"]), args.out)
        receipt = {
            "at": state["at"],
            "candidateSha256": candidate["candidateSha256"],
            **state["status"],
            "squadProof": state.get("squadProof"),
            "errors": state["errors"],
        }
    except (ValueError, KeyError, TypeError, SorareError, httpx.HTTPError) as error:
        receipt = {
            "at": datetime.now(UTC).isoformat(),
            "modelEligible": False,
            "metricsOpened": False,
            "errors": [{"stage": "setup", "reason": str(error)[:240]}],
        }
    (args.out / "receipt.json").write_text(json.dumps(receipt, indent=2), encoding="utf-8")
    print(json.dumps(receipt))
    return int(bool(receipt["errors"]))


if __name__ == "__main__":
    raise SystemExit(main())
