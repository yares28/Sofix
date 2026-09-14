from dataclasses import dataclass
from math import log10


@dataclass
class EloConfig:
    k: float = 24.0
    home_advantage: float = 65.0
    scale: float = 400.0


def expected_score(a, b, hfa=0.0, scale=400.0):
    return 1.0 / (1.0 + 10 ** ((b - (a + hfa)) / scale))


def update_pair(home, away, hg, ag, cfg=EloConfig()):
    expected = expected_score(home, away, cfg.home_advantage, cfg.scale)
    actual = 1.0 if hg > ag else 0.5 if hg == ag else 0.0
    gd = abs(hg - ag)
    margin = 1.0 if gd <= 1 else 1.0 + log10(gd + 1)
    delta = cfg.k * margin * (actual - expected)
    return home + delta, away - delta, expected
