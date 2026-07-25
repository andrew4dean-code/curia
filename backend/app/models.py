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
