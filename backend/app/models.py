from datetime import datetime, timezone

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
