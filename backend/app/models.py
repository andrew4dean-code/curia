from datetime import datetime, timezone
from typing import Optional

from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column


def utcnow() -> str:
    return datetime.now(timezone.utc).isoformat()


class Base(DeclarativeBase):
    pass


class Trade(Base):
    __tablename__ = "trades"
    id: Mapped[int] = mapped_column(primary_key=True)
    symbol: Mapped[str]
    side: Mapped[str]  # BUY | SELL
    qty: Mapped[float]
    price: Mapped[float]
    fees: Mapped[float] = mapped_column(default=0.0)
    executed_at: Mapped[str]  # YYYY-MM-DD
    note: Mapped[str] = mapped_column(default="")
    created_at: Mapped[str] = mapped_column(default=utcnow)
    updated_at: Mapped[str] = mapped_column(default=utcnow)


class Mark(Base):
    __tablename__ = "marks"
    symbol: Mapped[str] = mapped_column(primary_key=True)
    price: Mapped[float]
    marked_at: Mapped[str] = mapped_column(default=utcnow)
    source: Mapped[str] = mapped_column(default="manual")  # auto | manual


class Option(Base):
    __tablename__ = "options"
    id: Mapped[int] = mapped_column(primary_key=True)
    symbol: Mapped[str]
    opt_type: Mapped[str]  # CALL | PUT
    strike: Mapped[float]
    expiration: Mapped[str]  # YYYY-MM-DD
    contracts: Mapped[int]
    premium: Mapped[float]  # per share; collected = premium * 100 * contracts
    fees: Mapped[float] = mapped_column(default=0.0)
    opened_at: Mapped[str]
    note: Mapped[str] = mapped_column(default="")
    status: Mapped[str] = mapped_column(default="OPEN")  # OPEN|EXPIRED|BOUGHT_BACK|ASSIGNED
    closed_at: Mapped[Optional[str]] = mapped_column(default=None)
    buyback_price: Mapped[float] = mapped_column(default=0.0)
    close_fees: Mapped[float] = mapped_column(default=0.0)
    assigned_trade_id: Mapped[Optional[int]] = mapped_column(default=None)
    created_at: Mapped[str] = mapped_column(default=utcnow)
    updated_at: Mapped[str] = mapped_column(default=utcnow)


class Wheel(Base):
    __tablename__ = "wheels"
    id: Mapped[int] = mapped_column(primary_key=True)
    symbol: Mapped[str]
    no: Mapped[int]
    opened_at: Mapped[str]  # YYYY-MM-DD
    closed_at: Mapped[Optional[str]] = mapped_column(default=None)
    created_at: Mapped[str] = mapped_column(default=utcnow)
    updated_at: Mapped[str] = mapped_column(default=utcnow)


class QuietWeek(Base):
    """A week Andrew deliberately sat out — so an empty week on the board reads
    as 'quiet on purpose' rather than 'not caught up yet'."""
    __tablename__ = "quiet_weeks"
    friday: Mapped[str] = mapped_column(primary_key=True)  # YYYY-MM-DD, the week's Friday
    created_at: Mapped[str] = mapped_column(default=utcnow)


class Settings(Base):
    """Account preferences, as opposed to device ones.

    Exactly one row, id=1. A key/value table would be more flexible and worse: these are
    a fixed, small set of numbers that the money math reads, and giving them real columns
    means a typo is a migration error rather than a silently missing key that reads as
    zero. Zero is a plausible fee, which is what makes a missing one dangerous.
    """

    __tablename__ = "settings"
    id: Mapped[int] = mapped_column(primary_key=True, default=1)
    # Dollars per contract, applied to a newly recorded option. Brokers charge per
    # contract rather than per order, so this multiplies by the contract count.
    option_fee_per_contract: Mapped[float] = mapped_column(default=0.0)
    # Dollars per stock fill, applied whole — share commissions do not scale with size
    # at any broker Curia is likely to meet.
    stock_fee_per_trade: Mapped[float] = mapped_column(default=0.0)
    # Percent, 0-100. Andrew's own estimate of what he will owe on realized gains. The
    # app multiplies by it and never chooses it: this is arithmetic, not tax advice.
    tax_rate_pct: Mapped[float] = mapped_column(default=0.0)
    updated_at: Mapped[str] = mapped_column(default=utcnow)
