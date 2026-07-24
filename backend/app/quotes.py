"""Delayed US quotes from Stooq — free CSV endpoint, no account, no API key.

URL shape: https://stooq.com/q/l/?s=aapl.us+msft.us&f=sd2t2ohlcv&h&e=csv
CSV header: Symbol,Date,Time,Open,High,Low,Close,Volume. Close is the latest
price; unknown symbols come back with "N/D" fields.
"""
import httpx

STOOQ_URL = "https://stooq.com/q/l/"


def parse_stooq_csv(text: str) -> dict[str, float]:
    out: dict[str, float] = {}
    for line in text.strip().splitlines()[1:]:  # skip header
        cols = line.split(",")
        if len(cols) < 7 or cols[6] in ("N/D", ""):
            continue
        sym = cols[0].upper().removesuffix(".US")
        try:
            out[sym] = float(cols[6])
        except ValueError:
            continue
    return out


def fetch_quotes(symbols: list[str]) -> dict[str, float]:
    """{SYMBOL: price} for the symbols Stooq recognizes; {} on any failure."""
    if not symbols:
        return {}
    joined = "+".join(f"{s.lower()}.us" for s in symbols)
    try:
        resp = httpx.get(
            STOOQ_URL,
            params={"s": joined, "f": "sd2t2ohlcv", "h": "", "e": "csv"},
            timeout=8.0,
        )
        resp.raise_for_status()
    except Exception:
        return {}
    return parse_stooq_csv(resp.text)
