from tests.conftest import HEADERS


def test_settings_default_to_zero_on_a_fresh_install(client):
    """A first read creates the row rather than 404ing, so the client never has to
    special-case 'no settings yet' — and zero fees is the honest starting point."""
    r = client.get("/api/settings", headers=HEADERS)
    assert r.status_code == 200
    assert r.json()["option_fee_per_contract"] == 0.0
    assert r.json()["stock_fee_per_trade"] == 0.0


def test_settings_round_trip(client):
    r = client.put("/api/settings", headers=HEADERS, json={"option_fee_per_contract": 0.85, "stock_fee_per_trade": 1.5})
    assert r.status_code == 200
    assert r.json()["option_fee_per_contract"] == 0.85
    assert client.get("/api/settings", headers=HEADERS).json()["stock_fee_per_trade"] == 1.5


def test_settings_stay_a_single_row(client):
    """Two writes must update one row, not accumulate rows that later reads pick between."""
    client.put("/api/settings", headers=HEADERS, json={"option_fee_per_contract": 1.0, "stock_fee_per_trade": 0.0})
    client.put("/api/settings", headers=HEADERS, json={"option_fee_per_contract": 2.0, "stock_fee_per_trade": 0.0})
    assert client.get("/api/settings", headers=HEADERS).json()["option_fee_per_contract"] == 2.0


def test_negative_fees_are_rejected(client):
    """A negative fee is a credit, and would inflate P/L rather than dent it."""
    r = client.put("/api/settings", headers=HEADERS, json={"option_fee_per_contract": -1, "stock_fee_per_trade": 0})
    assert r.status_code == 422


def test_export_carries_settings(client):
    client.put("/api/settings", headers=HEADERS, json={"option_fee_per_contract": 0.65, "stock_fee_per_trade": 0.0})
    assert client.get("/api/export", headers=HEADERS).json()["settings"]["option_fee_per_contract"] == 0.65


def test_import_restores_settings(client):
    client.put("/api/settings", headers=HEADERS, json={"option_fee_per_contract": 0.65, "stock_fee_per_trade": 2.0})
    backup = client.get("/api/export", headers=HEADERS).json()
    client.put("/api/settings", headers=HEADERS, json={"option_fee_per_contract": 9.99, "stock_fee_per_trade": 9.99})
    r = client.post("/api/import", headers=HEADERS, json={**backup, "confirm": True})
    assert r.status_code == 200
    assert client.get("/api/settings", headers=HEADERS).json()["option_fee_per_contract"] == 0.65


def test_import_without_settings_leaves_them_alone(client):
    """An older backup has no settings key. Restoring it must not silently zero the fees
    that are configured here — a zero fee looks exactly like a real one."""
    client.put("/api/settings", headers=HEADERS, json={"option_fee_per_contract": 0.65, "stock_fee_per_trade": 2.0})
    backup = client.get("/api/export", headers=HEADERS).json()
    backup.pop("settings")
    client.post("/api/import", headers=HEADERS, json={**backup, "confirm": True})
    assert client.get("/api/settings", headers=HEADERS).json()["option_fee_per_contract"] == 0.65


def test_tax_rate_round_trips_and_is_bounded(client):
    """A rate is a percentage. Over 100 is a typo (0.24 entered as 24 is fine; 240 is not),
    and a negative rate would hand money back."""
    r = client.put("/api/settings", headers=HEADERS,
                   json={"option_fee_per_contract": 0, "stock_fee_per_trade": 0, "tax_rate_pct": 24})
    assert r.status_code == 200 and r.json()["tax_rate_pct"] == 24
    for bad in (-1, 101):
        assert client.put("/api/settings", headers=HEADERS,
                          json={"option_fee_per_contract": 0, "stock_fee_per_trade": 0,
                                "tax_rate_pct": bad}).status_code == 422
