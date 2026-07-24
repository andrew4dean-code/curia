from tests.conftest import HEADERS


def test_health_needs_no_key(client):
    assert client.get("/api/health").json() == {"ok": True}


def test_missing_key_is_401(client):
    assert client.get("/api/trades").status_code == 401


def test_wrong_key_is_401(client):
    assert client.get("/api/trades", headers={"X-Curia-Key": "nope"}).status_code == 401


def test_right_key_passes(client):
    assert client.get("/api/trades", headers=HEADERS).status_code == 200
