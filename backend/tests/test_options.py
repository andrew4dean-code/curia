from tests.conftest import HEADERS

CSP = {"symbol": "tqqq", "opt_type": "PUT", "strike": 62.0, "expiration": "2026-07-31",
       "contracts": 2, "premium": 0.74, "fees": 1.30, "opened_at": "2026-07-24", "note": "weekly"}


def _create(client, body=None):
    r = client.post("/api/options", json=body or CSP, headers=HEADERS)
    assert r.status_code == 201
    return r.json()


def test_create_and_list_round_trip(client):
    o = _create(client)
    assert o["symbol"] == "TQQQ"           # upper-cased
    assert o["status"] == "OPEN"
    assert o["closed_at"] is None
    assert o["assigned_trade_id"] is None
    assert client.get("/api/options", headers=HEADERS).json() == [o]


def test_validation_rejects_bad_type_and_contracts(client):
    assert client.post("/api/options", json={**CSP, "opt_type": "STRADDLE"}, headers=HEADERS).status_code == 422
    assert client.post("/api/options", json={**CSP, "contracts": 0}, headers=HEADERS).status_code == 422
    assert client.post("/api/options", json={**CSP, "premium": -1}, headers=HEADERS).status_code == 422


def test_edit_open_option(client):
    o = _create(client)
    r = client.put(f"/api/options/{o['id']}", json={**CSP, "premium": 0.80}, headers=HEADERS)
    assert r.json()["premium"] == 0.80


def test_delete_option(client):
    o = _create(client)
    assert client.delete(f"/api/options/{o['id']}", headers=HEADERS).status_code == 204
    assert client.get("/api/options", headers=HEADERS).json() == []


def test_settle_expired_keeps_everything(client):
    o = _create(client)
    r = client.post(f"/api/options/{o['id']}/settle",
                    json={"outcome": "EXPIRED", "closed_at": "2026-07-31"}, headers=HEADERS)
    body = r.json()
    assert body["status"] == "EXPIRED"
    assert body["closed_at"] == "2026-07-31"
    assert body["assigned_trade_id"] is None
    assert client.get("/api/trades", headers=HEADERS).json() == []  # no stock side


def test_settle_bought_back_requires_price(client):
    o = _create(client)
    assert client.post(f"/api/options/{o['id']}/settle",
                       json={"outcome": "BOUGHT_BACK"}, headers=HEADERS).status_code == 400
    r = client.post(f"/api/options/{o['id']}/settle",
                    json={"outcome": "BOUGHT_BACK", "buyback_price": 0.21, "close_fees": 1.0,
                          "closed_at": "2026-07-30"}, headers=HEADERS)
    assert r.json()["buyback_price"] == 0.21
    assert r.json()["close_fees"] == 1.0


def test_settle_assigned_put_books_buy_atomically(client):
    o = _create(client)
    r = client.post(f"/api/options/{o['id']}/settle",
                    json={"outcome": "ASSIGNED", "closed_at": "2026-07-31"}, headers=HEADERS)
    body = r.json()
    trades = client.get("/api/trades", headers=HEADERS).json()
    assert len(trades) == 1
    t = trades[0]
    assert t["side"] == "BUY" and t["qty"] == 200 and t["price"] == 62.0
    assert t["executed_at"] == "2026-07-31"
    assert t["note"] == "assigned: TQQQ $62 PUT exp 2026-07-31"
    assert body["assigned_trade_id"] == t["id"]


def test_settle_assigned_call_books_sell(client):
    o = _create(client, {**CSP, "opt_type": "CALL", "strike": 70.0})
    client.post(f"/api/options/{o['id']}/settle",
                json={"outcome": "ASSIGNED", "closed_at": "2026-07-31"}, headers=HEADERS)
    t = client.get("/api/trades", headers=HEADERS).json()[0]
    assert t["side"] == "SELL" and t["price"] == 70.0


def test_double_settle_and_edit_after_settle_409(client):
    o = _create(client)
    client.post(f"/api/options/{o['id']}/settle", json={"outcome": "EXPIRED"}, headers=HEADERS)
    assert client.post(f"/api/options/{o['id']}/settle",
                       json={"outcome": "EXPIRED"}, headers=HEADERS).status_code == 409
    assert client.put(f"/api/options/{o['id']}", json=CSP, headers=HEADERS).status_code == 409
