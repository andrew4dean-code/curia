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
    client.post("/api/import", json={"confirm": True, "version": 1}, headers=HEADERS)
    assert client.get("/api/trades", headers=HEADERS).json() == []

    result = client.post("/api/import", json={"confirm": True, **backup}, headers=HEADERS)
    assert result.json() == {"trades": 1, "marks": 1, "options": 0}
    assert client.get("/api/trades", headers=HEADERS).json()[0]["symbol"] == "AAPL"
    assert client.get("/api/marks", headers=HEADERS).json()[0]["price"] == 120


def test_import_without_confirm_is_400(client):
    assert client.post("/api/import", json={"trades": []}, headers=HEADERS).status_code == 400


def test_import_preserves_auto_source(client):
    body = {"confirm": True, "version": 1, "trades": [], "marks": [
        {"symbol": "AAPL", "price": 100.0, "marked_at": "2026-07-24T12:00:00+00:00", "source": "auto"},
    ]}
    client.post("/api/import", json=body, headers=HEADERS)
    marks = client.get("/api/marks", headers=HEADERS).json()
    assert marks[0]["source"] == "auto"
    assert marks[0]["marked_at"] == "2026-07-24T12:00:00+00:00"


def test_import_bad_rows_are_400_and_nothing_is_wiped(client):
    client.post("/api/trades", json={"symbol": "NVDA", "side": "BUY", "qty": 1, "price": 500,
                                     "fees": 0, "executed_at": "2026-07-01", "note": ""}, headers=HEADERS)
    bad_trade = {"confirm": True, "version": 1, "trades": [{"symbol": "AAPL"}], "marks": []}
    assert client.post("/api/import", json=bad_trade, headers=HEADERS).status_code == 400
    bad_mark = {"confirm": True, "version": 1, "trades": [], "marks": [{"symbol": "AAPL"}]}
    assert client.post("/api/import", json=bad_mark, headers=HEADERS).status_code == 400
    assert client.get("/api/trades", headers=HEADERS).json()[0]["symbol"] == "NVDA"


def test_import_rejects_non_curia_json(client):
    client.post("/api/trades", json={"symbol": "NVDA", "side": "BUY", "qty": 1, "price": 500,
                                     "fees": 0, "executed_at": "2026-07-01", "note": ""}, headers=HEADERS)
    resp = client.post("/api/import", json={"confirm": True, "settings": {"theme": "dark"}}, headers=HEADERS)
    assert resp.status_code == 400
    assert client.get("/api/trades", headers=HEADERS).json()[0]["symbol"] == "NVDA"


CSP_OPT = {"symbol": "TQQQ", "opt_type": "PUT", "strike": 62.0, "expiration": "2026-07-31",
           "contracts": 2, "premium": 0.74, "fees": 1.3, "opened_at": "2026-07-24", "note": ""}


def test_export_import_round_trip_with_options(client):
    o = client.post("/api/options", json=CSP_OPT, headers=HEADERS).json()
    client.post(f"/api/options/{o['id']}/settle",
                json={"outcome": "ASSIGNED", "closed_at": "2026-07-31"}, headers=HEADERS)
    backup = client.get("/api/export", headers=HEADERS).json()
    assert len(backup["options"]) == 1 and len(backup["trades"]) == 1

    client.post("/api/import", json={"confirm": True, "version": 1}, headers=HEADERS)
    result = client.post("/api/import", json={"confirm": True, **backup}, headers=HEADERS)
    assert result.json() == {"trades": 1, "marks": 0, "options": 1}
    restored = client.get("/api/options", headers=HEADERS).json()[0]
    assert restored["status"] == "ASSIGNED"
    assert restored["buyback_price"] == 0.0
    assert restored["assigned_trade_id"] is not None


def test_pre_options_backup_still_imports(client):
    body = {"confirm": True, "version": 1,
            "trades": [{"symbol": "AAPL", "side": "BUY", "qty": 1, "price": 100,
                        "fees": 0, "executed_at": "2026-07-01", "note": ""}],
            "marks": []}
    assert client.post("/api/import", json=body, headers=HEADERS).status_code == 200
    assert client.get("/api/options", headers=HEADERS).json() == []


def test_import_remaps_assigned_trade_id(client):
    # burn a trade id so original ids don't start at 1
    burn = client.post("/api/trades", json={"symbol": "ZZZ", "side": "BUY", "qty": 1, "price": 1,
                                            "fees": 0, "executed_at": "2026-07-01", "note": ""},
                       headers=HEADERS).json()
    client.delete(f"/api/trades/{burn['id']}", headers=HEADERS)

    o = client.post("/api/options", json=CSP_OPT, headers=HEADERS).json()
    client.post(f"/api/options/{o['id']}/settle",
                json={"outcome": "ASSIGNED", "closed_at": "2026-07-31"}, headers=HEADERS)
    backup = client.get("/api/export", headers=HEADERS).json()
    old_link = backup["options"][0]["assigned_trade_id"]
    assert old_link == backup["trades"][0]["id"]

    client.post("/api/import", json={"confirm": True, "version": 1}, headers=HEADERS)
    client.post("/api/import", json={"confirm": True, **backup}, headers=HEADERS)
    new_trade = client.get("/api/trades", headers=HEADERS).json()[0]
    new_opt = client.get("/api/options", headers=HEADERS).json()[0]
    assert new_opt["assigned_trade_id"] == new_trade["id"]  # remapped, not copied


def test_import_unknown_assigned_link_becomes_null(client):
    body = {"confirm": True, "version": 1, "trades": [], "marks": [],
            "options": [{**CSP_OPT, "status": "ASSIGNED", "closed_at": "2026-07-31",
                         "assigned_trade_id": 999}]}
    client.post("/api/import", json=body, headers=HEADERS)
    assert client.get("/api/options", headers=HEADERS).json()[0]["assigned_trade_id"] is None
