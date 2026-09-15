"""One place that ties a club's identities together.

- `code`: football-data.org three-letter code (tla), our stable key
- `history_name`: the name football-data.co.uk uses in its CSVs (the rating model's key)
- display name, badge colour, and home stadium for weather lookups
"""

from __future__ import annotations

import unicodedata
from dataclasses import dataclass


@dataclass(frozen=True)
class TeamInfo:
    code: str
    name: str
    history_name: str
    color: str
    stadium: str
    latitude: float
    longitude: float
    odds_names: tuple[str, ...] = ()  # extra spellings bookmaker feeds use (matched accent- and suffix-insensitively)


TEAMS: tuple[TeamInfo, ...] = (
    TeamInfo("ALA", "Alavés", "Alaves", "#0761af", "Mendizorrotza", 42.8372, -2.6880, ("Deportivo Alaves",)),
    TeamInfo("ATH", "Athletic Club", "Ath Bilbao", "#ee2523", "San Mamés", 43.2641, -2.9494, ("Athletic Bilbao",)),
    TeamInfo(
        "ATL",
        "Atlético Madrid",
        "Ath Madrid",
        "#cb3524",
        "Metropolitano",
        40.4362,
        -3.5995,
        ("Atletico Madrid", "Atlético de Madrid"),
    ),
    TeamInfo("FCB", "Barcelona", "Barcelona", "#a50044", "Spotify Camp Nou", 41.3809, 2.1228, ("FC Barcelona",)),
    TeamInfo("BET", "Real Betis", "Betis", "#0bb363", "Benito Villamarín", 37.3564, -5.9817),
    TeamInfo("CEL", "Celta", "Celta", "#8ac3ee", "Balaídos", 42.2118, -8.7397, ("Celta Vigo", "RC Celta")),
    TeamInfo(
        "DEP", "Deportivo", "La Coruna", "#2a5caa", "Riazor", 43.3687, -8.4174, ("Deportivo La Coruna", "RC Deportivo")
    ),
    TeamInfo("ELC", "Elche", "Elche", "#05642c", "Martínez Valero", 38.2670, -0.6627),
    TeamInfo("ESP", "Espanyol", "Espanol", "#007fc8", "RCDE Stadium", 41.3479, 2.0756, ("Espanyol Barcelona",)),
    TeamInfo("GET", "Getafe", "Getafe", "#005999", "Coliseum", 40.3257, -3.7147),
    TeamInfo("LEV", "Levante", "Levante", "#b4053f", "Ciutat de València", 39.4947, -0.3643),
    TeamInfo("MAL", "Málaga", "Malaga", "#0072bb", "La Rosaleda", 36.7342, -4.4266),
    TeamInfo("OSA", "Osasuna", "Osasuna", "#d91a21", "El Sadar", 42.7966, -1.6370),
    TeamInfo("RAY", "Rayo Vallecano", "Vallecano", "#e53027", "Vallecas", 40.3918, -3.6588),
    TeamInfo("RMA", "Real Madrid", "Real Madrid", "#febe10", "Santiago Bernabéu", 40.4531, -3.6883),
    TeamInfo("RSO", "Real Sociedad", "Sociedad", "#0067b1", "Anoeta", 43.3014, -1.9737),
    TeamInfo(
        "SAN",
        "Racing Santander",
        "Santander",
        "#00923f",
        "El Sardinero",
        43.4764,
        -3.7934,
        ("Racing de Santander", "Real Racing Club de Santander"),
    ),
    TeamInfo("SEV", "Sevilla", "Sevilla", "#d4021d", "Ramón Sánchez-Pizjuán", 37.3840, -5.9705, ("Sevilla FC",)),
    TeamInfo("VAL", "Valencia", "Valencia", "#ee8707", "Mestalla", 39.4746, -0.3583),
    TeamInfo("VIL", "Villarreal", "Villarreal", "#e8c400", "La Cerámica", 39.9441, -0.1036),
    # Recent LaLiga clubs, so relegation/promotion swaps need no code change
    TeamInfo("GIR", "Girona", "Girona", "#cd2534", "Montilivi", 41.9612, 2.8286),
    TeamInfo("MLL", "Mallorca", "Mallorca", "#e20613", "Son Moix", 39.5900, 2.6300, ("RCD Mallorca",)),
    TeamInfo("LPA", "Las Palmas", "Las Palmas", "#e5c200", "Gran Canaria", 28.1000, -15.4567),
    TeamInfo("LEG", "Leganés", "Leganes", "#0059a5", "Butarque", 40.3405, -3.7605),
    TeamInfo("VLL", "Valladolid", "Valladolid", "#921b88", "José Zorrilla", 41.6445, -4.7612),
    TeamInfo("OVI", "Real Oviedo", "Oviedo", "#0c3685", "Carlos Tartiere", 43.3601, -5.8704),
    TeamInfo("CAD", "Cádiz", "Cadiz", "#e5b800", "Nuevo Mirandilla", 36.5027, -6.2728),
    TeamInfo("ALM", "Almería", "Almeria", "#d6202c", "Power Horse Stadium", 36.8400, -2.4350),
    TeamInfo("GRA", "Granada", "Granada", "#c8102e", "Nuevo Los Cármenes", 37.1531, -3.5957),
)

_BY_CODE = {team.code: team for team in TEAMS}
_BY_HISTORY_NAME = {team.history_name: team for team in TEAMS}


def by_code(code: str | None) -> TeamInfo | None:
    return _BY_CODE.get((code or "").upper())


def by_history_name(name: str) -> TeamInfo | None:
    return _BY_HISTORY_NAME.get(name)


def normalize_name(name: str) -> str:
    """Accent-, case- and suffix-insensitive club name ("Atlético de Madrid" == "atletico madrid")."""
    plain = unicodedata.normalize("NFKD", name).encode("ascii", "ignore").decode().lower()
    words = [
        w
        for w in plain.replace(".", " ").replace("-", " ").split()
        if w not in {"cf", "fc", "ca", "rcd", "sad", "de", "club", "cd", "ud", "sd", "rc"}
    ]
    return " ".join(words)


def by_odds_name(name: str) -> TeamInfo | None:
    """A club from a bookmaker feed's spelling: display name, history name or an alias."""
    wanted = normalize_name(name)
    for team in TEAMS:
        if wanted in {normalize_name(n) for n in (team.name, team.history_name, *team.odds_names)}:
            return team
    return None


def require_code(code: str | None, source_name: str = "") -> TeamInfo:
    team = by_code(code)
    if team is None:
        raise KeyError(f"unknown team code {code!r} ({source_name}); add it to app/services/team_registry.py")
    return team
