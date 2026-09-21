"""Does the post-match review tell bad luck from a bad rating?

    cd backend
    .venv\\Scripts\\python reports\\experiments\\review.py --cache %TEMP%\\fdr_state.pkl --out %TEMP%\\review.md

app/services/postmortem.py files every finished match as `as forecast`, `variance` (surprising, but the
club played as the forecast said), `evidence` (surprising, and outplayed on shots too) or `data`. This
script checks the claim on nine seasons of blind forecasts: if the labels mean anything, a club filed as
`evidence` should go on doing what surprised us, and a club filed as `variance` should not.

Each club-match is reviewed with the forecast made the Monday before it, and judged on what the club did
in the four weeks *after* - which the review never saw.
"""

from __future__ import annotations

import argparse
import logging
import sys
from pathlib import Path

BACKEND = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(BACKEND))
sys.path.insert(0, str(Path(__file__).resolve().parent))

import difficulty_backtest as replay  # noqa: E402
import numpy as np  # noqa: E402
import pandas as pd  # noqa: E402

from app.logging_config import configure_logging  # noqa: E402
from app.services.postmortem import SURPRISING, league_conversion, review_rows  # noqa: E402

logger = logging.getLogger("review")

AFTER_DAYS = 28  # how long after a match we look to see whether the review was right


def last_forecast_before_kickoff(forecasts: pd.DataFrame) -> pd.DataFrame:
    """One row per club per match: the blind forecast made on the Monday before it was played."""
    rows = replay.team_view(forecasts[forecasts["method"] == replay.BLIND])
    played = rows[rows["horizon"] == 1]
    return played.sort_values("cutoff").groupby(["season_start", "date", "team", "opponent"], as_index=False).last()


def with_match_facts(rows: pd.DataFrame, matches: pd.DataFrame) -> pd.DataFrame:
    """Add the shots and red cards each club had in that match."""
    home = matches.rename(columns={"home": "team", "away": "opponent", "hst": "shots_on_target", "hr": "reds_for", "ar": "reds_against"})  # fmt: skip
    away = matches.rename(columns={"away": "team", "home": "opponent", "ast": "shots_on_target", "ar": "reds_for", "hr": "reds_against"})  # fmt: skip
    columns = ["date", "team", "opponent", "shots_on_target", "reds_for", "reds_against"]
    facts = pd.concat([home[columns], away[columns]], ignore_index=True)
    joined = rows.merge(facts, on=["date", "team", "opponent"], how="left", validate="one_to_one")
    joined["red_cards"] = (joined["reds_for"].fillna(0) + joined["reds_against"].fillna(0)) > 0
    return joined


def what_happened_next(reviewed: pd.DataFrame, matches: pd.DataFrame) -> pd.DataFrame:
    """For each reviewed match, the club's points per game over the next four weeks."""
    home = matches.assign(team=matches["home"], points=np.select([matches["hg"] > matches["ag"], matches["hg"] == matches["ag"]], [3, 1], 0))  # fmt: skip
    away = matches.assign(team=matches["away"], points=np.select([matches["ag"] > matches["hg"], matches["hg"] == matches["ag"]], [3, 1], 0))  # fmt: skip
    played = pd.concat([home[["team", "date", "points"]], away[["team", "date", "points"]]], ignore_index=True)
    records = []
    for team, group in played.groupby("team"):
        dates = group["date"].to_numpy()
        points = group["points"].to_numpy(dtype=float)
        mine = reviewed[reviewed["team"] == team]
        for date in mine["date"]:
            window = (dates > np.datetime64(date)) & (dates <= np.datetime64(date + pd.Timedelta(days=AFTER_DAYS)))
            records.append({"team": team, "date": date, "next_ppg": points[window].mean() if window.any() else np.nan})
    return reviewed.merge(pd.DataFrame(records), on=["team", "date"], how="left", validate="one_to_one")


def verdict_table(reviewed: pd.DataFrame) -> pd.DataFrame:
    """How often each verdict is reached, and what the club did before and after."""
    table = reviewed.groupby("verdict").agg(
        matches=("points", "size"),
        surprise=("surprise", "mean"),
        expected_points=("expected_points", "mean"),
        points=("points", "mean"),
        performance_gap=("performance_gap", "mean"),
        next_four_weeks=("next_ppg", "mean"),
    )
    table["share"] = table["matches"] / table["matches"].sum()
    order = [v for v in ("as forecast", "variance", "evidence", "data") if v in table.index]
    return table.reindex(order).rename_axis("verdict").reset_index()


def disappointments(reviewed: pd.DataFrame) -> pd.DataFrame:
    """The question the board gets asked: an easy game was lost - now what?

    Only games the forecast called kind (top third of expected points) that the club then lost.
    """
    kind = reviewed[reviewed["expected_points"] >= reviewed["expected_points"].quantile(2 / 3)]
    lost = kind[kind["points"] == 0]
    table = lost.groupby("verdict").agg(
        matches=("points", "size"),
        expected_points=("expected_points", "mean"),
        performance_gap=("performance_gap", "mean"),
        next_four_weeks=("next_ppg", "mean"),
    )
    table["share"] = table["matches"] / table["matches"].sum()
    order = [v for v in ("variance", "evidence", "data") if v in table.index]
    return table.reindex(order).rename_axis("verdict").reset_index()


def does_it_predict(reviewed: pd.DataFrame) -> str:
    """The test that matters: after a kind fixture is lost, does the verdict say what comes next?"""
    kind = reviewed[reviewed["expected_points"] >= reviewed["expected_points"].quantile(2 / 3)]
    lost = kind[(kind["points"] == 0) & kind["next_ppg"].notna()]
    groups = lost.groupby("verdict")["next_ppg"]
    variance, evidence = groups.get_group("variance"), groups.get_group("evidence")
    gap = evidence.mean() - variance.mean()
    # A two-sample interval, no bootstrap needed for a difference of means this simple.
    se = float(np.sqrt(evidence.var(ddof=1) / len(evidence) + variance.var(ddof=1) / len(variance)))
    direction = "more" if gap > 0 else "fewer"
    verdict = "does not predict" if abs(gap) < 1.96 * se or gap > 0 else "predicts"
    return (
        f"A club filed as `evidence` took {evidence.mean():.2f} points per game over the next four weeks "
        f"({len(evidence)} cases); one filed as `variance` took {variance.mean():.2f} ({len(variance)} cases). "
        f"That is {abs(gap):.2f} {direction} for the group the review called a rating problem, "
        f"±{1.96 * se:.2f} at 95%. **The verdict {verdict} what comes next.** It describes what happened in the "
        f"match, which is what it was built for; it is not a signal to change the rating, and the drift test "
        f"built on the same idea did not pay either (see docs/fixture_difficulty.md)."
    )


def examples(reviewed: pd.DataFrame, season: int, count: int = 6) -> pd.DataFrame:
    """The most surprising results of one season, as the review describes them."""
    rows = reviewed[(reviewed["season_start"] == season) & (reviewed["verdict"] != "data")]
    picked = rows.nsmallest(count, "surprise")
    return pd.DataFrame(
        {
            "date": picked["date"].dt.strftime("%Y-%m-%d"),
            "club": picked["team"],
            "opponent": picked["opponent"],
            "forecast": picked["expected_points"].map("{:.2f} xPts".format),
            "verdict": picked["verdict"],
            "what the review says": picked["note"],
        }
    )


def build(matches: pd.DataFrame, state: dict) -> str:
    rows = last_forecast_before_kickoff(state["forecasts"])
    rows = with_match_facts(rows, matches)
    conversion = league_conversion(matches[matches["season_start"] < replay.TEST_SEASONS[0]])
    reviewed = review_rows(rows, conversion)
    reviewed = what_happened_next(reviewed, matches)
    logger.info("reviewed %d club-matches, conversion %.3f goals per shot on target", len(reviewed), conversion)

    fmt = {"matches": ".0f", "share": ".1%", "surprise": ".2f", "expected_points": ".2f", "points": ".2f", "performance_gap": "+.2f", "next_four_weeks": ".2f"}  # fmt: skip
    seasons = replay.season_label(replay.TEST_SEASONS[0]), replay.season_label(replay.TEST_SEASONS[-1])
    return f"""# Reading finished matches: does the review mean anything?

Every club-match of {seasons[0]}-{seasons[1]} ({len(reviewed):,} of them), each read against the blind forecast made the
Monday before it. A result counts as surprising when the forecast itself gave results that bad (or worse) no more
than {SURPRISING:.0%} of the time. Shots on target are valued at the league's {conversion:.3f} goals per shot, fitted on
seasons before the test window.

**next_four_weeks** is the club's points per game over the {AFTER_DAYS} days *after* the reviewed match - the part the
review never saw. It is what decides whether the labels are worth anything.

## Every match

{replay.table(verdict_table(reviewed), fmt)}

## The case the board gets asked about: a kind fixture, lost

Games in the kindest third of forecasts that the club went on to lose:

{replay.table(disappointments(reviewed), {k: v for k, v in fmt.items() if k not in ("surprise", "points")})}

{does_it_predict(reviewed)}

## What it says, in words

The six most surprising results of {replay.season_label(2025)}:

{replay.table(examples(reviewed, 2025), {})}
"""


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--cache", type=Path, required=True, help="replay state from difficulty_backtest.py")
    parser.add_argument("--out", type=Path)
    args = parser.parse_args()
    configure_logging()

    matches = replay.load_history(range(replay.HISTORY_FROM, replay.TEST_SEASONS[-1] + 1), replay.CACHE_DIR)
    state = pd.read_pickle(args.cache)
    text = build(matches, state)
    if args.out:
        args.out.write_text(text, encoding="utf-8")
        logger.info("report → %s", args.out)
    sys.stdout.reconfigure(errors="replace")
    print(text)


if __name__ == "__main__":
    main()
