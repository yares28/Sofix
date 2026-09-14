import httpx

from app.sources.football_data_co_uk import decode_csv, fetch_season_csv, season_code

CSV = b"Div,Date,HomeTeam,AwayTeam,FTHG,FTAG\nSP1,15/08/2025,Alav\xe9s,Betis,1,0\n"


def mock_client(requests: list[str]) -> httpx.Client:
    def handler(request: httpx.Request) -> httpx.Response:
        requests.append(str(request.url))
        return httpx.Response(200, content=CSV)
    return httpx.Client(transport=httpx.MockTransport(handler))


def test_season_code():
    assert season_code(2025) == "2526"
    assert season_code(1999) == "9900"


def test_decode_falls_back_to_latin1():
    assert "Alavés" in decode_csv(CSV)
    assert decode_csv("﻿Date".encode("utf-8")) == "Date"


def test_fetch_downloads_once_then_uses_cache(tmp_path):
    requests: list[str] = []
    client = mock_client(requests)
    first = fetch_season_csv(2025, tmp_path, client=client)
    second = fetch_season_csv(2025, tmp_path, client=client)
    assert requests == ["https://www.football-data.co.uk/mmz4281/2526/SP1.csv"]
    assert first.equals(second) and first.loc[0, "HomeTeam"] == "Alavés"

    fetch_season_csv(2025, tmp_path, client=client, refresh=True)
    assert len(requests) == 2
