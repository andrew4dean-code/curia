from tests.conftest import HEADERS


def _open(client, symbol="TQQQ", opened_at="2026-07-06"):
    r = client.post("/api/wheels", json={"symbol": symbol, "opened_at": opened_at}, headers=HEADERS)
    assert r.status_code == 201
    return r.json()


def test_open_assigns_per_symbol_sequence(client):
    w1 = _open(client)
    assert (w1["symbol"], w1["no"], w1["closed_at"]) == ("TQQQ", 1, None)
    client.post(f"/api/wheels/{w1['id']}/close", json={"closed_at": "2026-07-20"}, headers=HEADERS)
    w2 = _open(client, opened_at="2026-07-21")
    assert w2["no"] == 2
    other = _open(client, symbol="nvda")
    assert (other["symbol"], other["no"]) == ("NVDA", 1)  # upper-cased, own sequence


def test_second_open_wheel_same_symbol_409(client):
    _open(client)
    r = client.post("/api/wheels", json={"symbol": "TQQQ"}, headers=HEADERS)
    assert r.status_code == 409


def test_close_and_double_close(client):
    w = _open(client)
    r = client.post(f"/api/wheels/{w['id']}/close", json={"closed_at": "2026-07-20"}, headers=HEADERS)
    assert r.json()["closed_at"] == "2026-07-20"
    assert client.post(f"/api/wheels/{w['id']}/close", json={}, headers=HEADERS).status_code == 409
    assert client.post("/api/wheels/999/close", json={}, headers=HEADERS).status_code == 404


def test_delete_open_or_closed(client):
    w = _open(client)
    assert client.delete(f"/api/wheels/{w['id']}", headers=HEADERS).status_code == 204
    assert client.get("/api/wheels", headers=HEADERS).json() == []


def test_close_defaults_today(client):
    w = _open(client)
    closed = client.post(f"/api/wheels/{w['id']}/close", json={}, headers=HEADERS).json()
    assert closed["closed_at"] is not None
