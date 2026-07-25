from tests.conftest import HEADERS


def test_mark_then_list(client):
    r = client.post("/api/quiet-weeks", json={"friday": "2026-07-17"}, headers=HEADERS)
    assert r.status_code == 201
    assert r.json() == {"friday": "2026-07-17"}
    assert client.get("/api/quiet-weeks", headers=HEADERS).json() == ["2026-07-17"]


def test_list_is_ascending(client):
    for f in ("2026-07-24", "2026-07-10", "2026-07-17"):
        client.post("/api/quiet-weeks", json={"friday": f}, headers=HEADERS)
    assert client.get("/api/quiet-weeks", headers=HEADERS).json() == [
        "2026-07-10", "2026-07-17", "2026-07-24",
    ]


def test_remarking_is_idempotent_not_an_error(client):
    client.post("/api/quiet-weeks", json={"friday": "2026-07-17"}, headers=HEADERS)
    again = client.post("/api/quiet-weeks", json={"friday": "2026-07-17"}, headers=HEADERS)
    assert again.status_code == 200
    assert again.json() == {"friday": "2026-07-17"}
    assert client.get("/api/quiet-weeks", headers=HEADERS).json() == ["2026-07-17"]


def test_clear(client):
    client.post("/api/quiet-weeks", json={"friday": "2026-07-17"}, headers=HEADERS)
    assert client.delete("/api/quiet-weeks/2026-07-17", headers=HEADERS).status_code == 204
    assert client.get("/api/quiet-weeks", headers=HEADERS).json() == []


def test_clearing_an_unmarked_week_is_404(client):
    assert client.delete("/api/quiet-weeks/2026-07-17", headers=HEADERS).status_code == 404


def test_rejects_a_non_date(client):
    r = client.post("/api/quiet-weeks", json={"friday": "last week"}, headers=HEADERS)
    assert r.status_code == 422


def test_requires_the_passcode(client):
    assert client.get("/api/quiet-weeks").status_code == 401
