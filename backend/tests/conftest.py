import numpy as np
import pandas as pd
import pytest

TRUE_ATTACK = {"Strong": 0.45, "Good": 0.2, "Mid A": 0.0, "Mid B": 0.0, "Weak": -0.25, "Poor": -0.4}
TRUE_DEFENCE = {"Strong": 0.4, "Good": 0.15, "Mid A": 0.0, "Mid B": 0.0, "Weak": -0.2, "Poor": -0.35}
MU, HOME_ADV = 0.15, 0.25


def simulate_league(seasons=(2020, 2021, 2022), repeats=4, seed=7, n_teams=None):
    """Round-robin seasons with known ratings, a few days between rounds from mid-August.

    Default: the six named teams above. With `n_teams`, a league of evenly spread ratings.
    """
    rng = np.random.default_rng(seed)
    attack, defence = TRUE_ATTACK, TRUE_DEFENCE
    if n_teams:
        spread = np.linspace(0.4, -0.4, n_teams)
        attack = {f"Team {i:02d}": s for i, s in enumerate(spread)}
        defence = dict(attack)
    names = list(attack)
    rows = []
    for season in seasons:
        date = pd.Timestamp(f"{season}-08-15")
        for _ in range(repeats):
            for home in names:
                for away in names:
                    if home == away:
                        continue
                    lam_h = np.exp(MU + HOME_ADV + attack[home] - defence[away])
                    lam_a = np.exp(MU + attack[away] - defence[home])
                    hg, ag = rng.poisson(lam_h), rng.poisson(lam_a)
                    rows.append({
                        "season_start": season, "date": date, "home": home, "away": away, "hg": hg, "ag": ag,
                        "hst": hg + rng.poisson(2.5), "ast": ag + rng.poisson(2.0),
                        "odds_h": 2.2, "odds_d": 3.3, "odds_a": 3.4,
                    })
                date += pd.Timedelta(days=3)
    return pd.DataFrame(rows).sort_values("date", kind="stable", ignore_index=True)


@pytest.fixture(scope="session")
def league():
    return simulate_league()
