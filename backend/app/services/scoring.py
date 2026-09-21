from typing import Literal, cast


def normalize_probs(win: float, draw: float, loss: float) -> tuple[float, float, float]:
    vals = [max(float(win), 0.0), max(float(draw), 0.0), max(float(loss), 0.0)]
    total = sum(vals)
    if total == 0:
        return (1 / 3, 1 / 3, 1 / 3)
    return (vals[0] / total, vals[1] / total, vals[2] / total)


def expected_points(win: float, draw: float) -> float:
    return 3 * win + draw


def difficulty_score(win: float, draw: float, loss: float) -> float:
    win, draw, loss = normalize_probs(win, draw, loss)
    return max(0.0, min(100.0, 100.0 * (1.0 - expected_points(win, draw) / 3.0)))


LABELS = ("Very favourite", "Favourite", "Even", "Underdog", "Big underdog")

# Upper bounds for the first four labels. The middle three cuts come from the backtest's 15/20/30/20/15 %
# shares (reports/backtest_laliga.md, section 6); the TOP one is venue-aware, because the same difficulty
# means a very different chance of winning home and away.
#
# Over nine blind seasons a top-band tile won 70.4% of the time at home but only 59.3% away - one colour,
# two promises. Splitting the top cut (36.0 home, 23.4 away) makes it 72.0% and 72.2%: the colour finally
# means the same thing wherever the game is played. See docs/fixture_difficulty.md, 1.6.
THRESHOLDS: dict[str, tuple[float, float, float, float]] = {
    "H": (36.0, 48.6, 61.1, 71.3),
    "A": (23.4, 48.6, 61.1, 71.3),
}
# The home scale as a single set, for the research scripts that study the score rather than the board
# (reports/experiments/*). Production always goes through difficulty_label with a venue.
LABEL_THRESHOLDS = THRESHOLDS["H"]


def label_bucket(label: str) -> Literal[1, 2, 3, 4, 5]:
    """1 (kindest) … 5 (hardest). The tile colour must come from the same label the tooltip shows."""
    return cast(Literal[1, 2, 3, 4, 5], LABELS.index(label) + 1)


def difficulty_label(score: float, venue: str = "H") -> str:
    """The word on the tile. `venue` is "H" or "A" for the club whose tile this is."""
    thresholds = THRESHOLDS.get(venue, THRESHOLDS["H"])
    return next((label for label, cut in zip(LABELS[:4], thresholds, strict=True) if score <= cut), LABELS[-1])
