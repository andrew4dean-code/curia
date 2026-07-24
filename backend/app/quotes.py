"""US quotes via Yahoo Finance's unofficial chart endpoint — free, no account,
no API key. Requires a browser-like User-Agent (Yahoo rejects default clients).
(Stooq was the original pick but now blocks non-browser clients.)

GET https://query1.finance.yahoo.com/v8/finance/chart/{SYMBOL}?interval=1d&range=1d
→ price at chart.result[0].meta.regularMarketPrice. Unknown symbols → HTTP 404.
"""
from typing import Optional

import httpx

CHART_URL = "https://query1.finance.yahoo.com/v8/finance/chart/{symbol}"
_UA = {"User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)"}


def price_from_chart(data: dict) -> Optional[float]:
    try:
        price = data["chart"]["result"][0]["meta"]["regularMarketPrice"]
    except (KeyError, IndexError, TypeError):
        return None
    return float(price) if isinstance(price, (int, float)) else None


def fetch_quotes(symbols: list[str]) -> dict[str, float]:
    """{SYMBOL: price} for the symbols Yahoo recognizes; skips per-symbol
    failures silently; {} on total failure. Never raises."""
    out: dict[str, float] = {}
    if not symbols:
        return out
    try:
        with httpx.Client(headers=_UA, timeout=8.0) as client:
            for sym in symbols:
                try:
                    resp = client.get(
                        CHART_URL.format(symbol=sym.upper()),
                        params={"interval": "1d", "range": "1d"},
                    )
                    resp.raise_for_status()
                    price = price_from_chart(resp.json())
                    if price is not None:
                        out[sym.upper()] = price
                except Exception:
                    continue
    except Exception:
        return out
    return out
