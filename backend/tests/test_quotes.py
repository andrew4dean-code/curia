from app import quotes
from tests.conftest import HEADERS


def test_price_from_chart_happy_and_malformed():
    payload = {"chart": {"result": [{"meta": {"regularMarketPrice": 100.5, "symbol": "AAPL"}}]}}
    assert quotes.price_from_chart(payload) == 100.5
    assert quotes.price_from_chart({"chart": {"result": []}}) is None
    assert quotes.price_from_chart({}) is None


def test_refresh_marks_only_touches_open_symbols(client, monkeypatch):
    for body in [
        {"symbol": "AAPL", "side": "BUY", "qty": 10, "price": 100, "fees": 0, "executed_at": "2026-07-01", "note": ""},
        {"symbol": "TSLA", "side": "BUY", "qty": 5, "price": 200, "fees": 0, "executed_at": "2026-07-01", "note": ""},
        {"symbol": "TSLA", "side": "SELL", "qty": 5, "price": 210, "fees": 0, "executed_at": "2026-07-02", "note": ""},
    ]:
        client.post("/api/trades", json=body, headers=HEADERS)

    seen = {}

    def fake_fetch(symbols):
        seen["symbols"] = symbols
        return {"AAPL": 123.45}

    monkeypatch.setattr(quotes, "fetch_quotes", fake_fetch)
    marks = client.post("/api/marks/refresh", headers=HEADERS).json()
    assert seen["symbols"] == ["AAPL"]  # TSLA is fully closed — not fetched
    assert len(marks) == 1
    assert marks[0]["symbol"] == "AAPL"
    assert marks[0]["price"] == 123.45
    assert marks[0]["source"] == "auto"


def test_stooq_failure_keeps_existing_marks(client, monkeypatch):
    client.post("/api/trades", json={"symbol": "AAPL", "side": "BUY", "qty": 1, "price": 100, "fees": 0, "executed_at": "2026-07-01", "note": ""}, headers=HEADERS)
    client.put("/api/marks/AAPL", json={"price": 111}, headers=HEADERS)
    monkeypatch.setattr(quotes, "fetch_quotes", lambda syms: {})  # simulated outage
    marks = client.post("/api/marks/refresh", headers=HEADERS).json()
    assert marks[0]["price"] == 111
    assert marks[0]["source"] == "manual"  # untouched


def test_manual_put_sets_source_manual(client):
    m = client.put("/api/marks/nvda", json={"price": 500}, headers=HEADERS).json()
    assert m["source"] == "manual"
