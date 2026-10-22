"""Literal club names seen in the retained Sorare fixture lists and public CSVs."""

from typing import Any

from app.services.league_fdr import HISTORY_ALIASES

ALIASES = {
    "ESTAC Troyes": "Troyes",
    "Burnley FC": "Burnley",
    "Leicester City FC": "Leicester",
    "Luton Town FC": "Luton",
    "Sheffield United FC": "Sheffield United",
    "Southampton FC": "Southampton",
    "West Ham United FC": "West Ham",
    "Wolverhampton Wanderers FC": "Wolves",
    "FC St. Pauli": "St Pauli",
    "Kieler SV Holstein 1900": "Holstein Kiel",
    "SV Darmstadt 1898": "Darmstadt",
}


def club_name(team: dict[str, Any], known: set[str]) -> str:
    label = team.get("name") or ""
    mapped = ALIASES.get(label, HISTORY_ALIASES.get(label, label))
    if mapped not in known:
        raise ValueError(f"Unmapped literal club: {label!r} ({team.get('slug')})")
    return mapped
