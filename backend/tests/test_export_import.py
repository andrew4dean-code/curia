from tests.conftest import HEADERS

AAPL = {"symbol": "AAPL", "side": "BUY", "qty": 10, "price": 100,
        "fees": 0, "executed_at": "2026-07-01", "note": ""}


def test_export_import_round_trip(client):
    client.post("/api/trades", json=AAPL, headers=HEADERS)
    client.put("/api/marks/AAPL", json={"price": 120}, headers=HEADERS)

    backup = client.get("/api/export", headers=HEADERS).json()
    assert backup["version"] == 1
    assert len(backup["trades"]) == 1

    # wipe by importing empty, then restore from the backup
    client.post("/api/import", json={"confirm": True}, headers=HEADERS)
    assert client.get("/api/trades", headers=HEADERS).json() == []

    result = client.post("/api/import", json={"confirm": True, **backup}, headers=HEADERS)
    assert result.json() == {"trades": 1, "marks": 1}
    assert client.get("/api/trades", headers=HEADERS).json()[0]["symbol"] == "AAPL"
    assert client.get("/api/marks", headers=HEADERS).json()[0]["price"] == 120


def test_import_without_confirm_is_400(client):
    assert client.post("/api/import", json={"trades": []}, headers=HEADERS).status_code == 400
