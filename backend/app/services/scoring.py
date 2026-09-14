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


# Upper bounds for Easy / Easy-ish / Normal / Hard-ish, set by the backtest so labels cover
# 15 / 20 / 30 / 20 / 15 % of fixtures (reports/backtest_laliga.md, section 6).
LABEL_THRESHOLDS = (37.4, 48.6, 61.1, 71.3)
LABELS = ("Easy", "Easy-ish", "Normal", "Hard-ish", "Hard")


def label_bucket(label: str) -> Literal[1, 2, 3, 4, 5]:
    """1 (easiest) … 5 (hardest). The tile colour must come from the same label the tooltip shows."""
    return cast(Literal[1, 2, 3, 4, 5], LABELS.index(label) + 1)


def difficulty_label(score):
    easy, easyish, normal, hardish = LABEL_THRESHOLDS
    if score <= easy:
        return "Easy"
    if score <= easyish:
        return "Easy-ish"
    if score <= normal:
        return "Normal"
    if score <= hardish:
        return "Hard-ish"
    return "Hard"
