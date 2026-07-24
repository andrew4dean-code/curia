from tests.conftest import HEADERS

AAPL = {"symbol": "aapl", "side": "BUY", "qty": 10, "price": 100.5,
        "fees": 1.25, "executed_at": "2026-07-01", "note": "starter"}


def test_crud_round_trip(client):
    created = client.post("/api/trades", json=AAPL, headers=HEADERS)
    assert created.status_code == 201
    t = created.json()
    assert t["symbol"] == "AAPL"  # upper-cased
    assert t["id"] > 0

    assert client.get("/api/trades", headers=HEADERS).json() == [t]

    updated = client.put(f"/api/trades/{t['id']}", json={**AAPL, "qty": 12}, headers=HEADERS)
    assert updated.json()["qty"] == 12

    assert client.delete(f"/api/trades/{t['id']}", headers=HEADERS).status_code == 204
    assert client.get("/api/trades", headers=HEADERS).json() == []


def test_validation_rejects_bad_side_and_qty(client):
    assert client.post("/api/trades", json={**AAPL, "side": "HOLD"}, headers=HEADERS).status_code == 422
    assert client.post("/api/trades", json={**AAPL, "qty": 0}, headers=HEADERS).status_code == 422
    assert client.post("/api/trades", json={**AAPL, "executed_at": "07/01/2026"}, headers=HEADERS).status_code == 422


def test_update_missing_trade_404(client):
    assert client.put("/api/trades/999", json=AAPL, headers=HEADERS).status_code == 404


def test_marks_upsert(client):
    m1 = client.put("/api/marks/nvda", json={"price": 500}, headers=HEADERS).json()
    assert m1["symbol"] == "NVDA"
    m2 = client.put("/api/marks/NVDA", json={"price": 510}, headers=HEADERS).json()
    assert m2["price"] == 510
    assert client.get("/api/marks", headers=HEADERS).json() == [m2]
