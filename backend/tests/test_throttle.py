from app import auth
from tests.conftest import HEADERS

BAD = {"X-Curia-Key": "wrong"}


def setup_function():
    auth._reset_throttle()


def test_first_wrong_guesses_are_401_then_429(client):
    for _ in range(5):
        assert client.get("/api/trades", headers=BAD).status_code == 401
    assert client.get("/api/trades", headers=BAD).status_code == 429


def test_correct_key_always_passes_and_resets(client):
    for _ in range(6):
        client.get("/api/trades", headers=BAD)
    assert client.get("/api/trades", headers=HEADERS).status_code == 200
    # counter reset: next wrong guess is a fresh 401, not 429
    assert client.get("/api/trades", headers=BAD).status_code == 401


def test_lockout_expires(client, monkeypatch):
    for _ in range(6):
        client.get("/api/trades", headers=BAD)
    assert client.get("/api/trades", headers=BAD).status_code == 429
    monkeypatch.setitem(auth._throttle, "locked_until", 0.0)
    assert client.get("/api/trades", headers=BAD).status_code == 401
