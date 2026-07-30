"""A price Andrew typed outranks a price Yahoo guessed.

The auto pull used to stamp `source = "auto"` over every held symbol, so a mark set by
hand survived only until the next refresh — which the app fires after every action. The
hand-set price was gone before he could look at it, and the "marked by you" line in the
Portfolio was unreachable for anything Yahoo prices.
"""
from unittest.mock import patch

from tests.conftest import HEADERS

HELD = {"symbol": "GLD", "side": "BUY", "qty": 100, "price": 50, "executed_at": "2026-07-01"}


def _hold(client):
    client.post("/api/trades", json=HELD, headers=HEADERS)


def test_refresh_leaves_a_hand_set_price_alone(client):
    _hold(client)
    client.put("/api/marks/GLD", json={"price": 61.25}, headers=HEADERS)

    with patch("app.quotes.fetch_quotes", return_value={"GLD": 58.10}):
        client.post("/api/marks/refresh", headers=HEADERS)

    mark = client.get("/api/marks", headers=HEADERS).json()[0]
    assert mark["price"] == 61.25
    assert mark["source"] == "manual"


def test_refresh_still_updates_a_mark_it_set_itself(client):
    _hold(client)
    with patch("app.quotes.fetch_quotes", return_value={"GLD": 58.10}):
        client.post("/api/marks/refresh", headers=HEADERS)
    with patch("app.quotes.fetch_quotes", return_value={"GLD": 59.40}):
        client.post("/api/marks/refresh", headers=HEADERS)

    mark = client.get("/api/marks", headers=HEADERS).json()[0]
    assert mark["price"] == 59.40
    assert mark["source"] == "auto"


def test_dropping_a_mark_hands_the_symbol_back_to_the_quote_pull(client):
    _hold(client)
    client.put("/api/marks/GLD", json={"price": 61.25}, headers=HEADERS)

    assert client.delete("/api/marks/GLD", headers=HEADERS).status_code == 204
    assert client.get("/api/marks", headers=HEADERS).json() == []

    with patch("app.quotes.fetch_quotes", return_value={"GLD": 58.10}):
        client.post("/api/marks/refresh", headers=HEADERS)

    mark = client.get("/api/marks", headers=HEADERS).json()[0]
    assert mark["price"] == 58.10
    assert mark["source"] == "auto"


def test_dropping_a_mark_that_is_not_there_404s(client):
    assert client.delete("/api/marks/GLD", headers=HEADERS).status_code == 404
