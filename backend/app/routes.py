from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field, ValidationError
from sqlalchemy import delete, select

from app import quotes
from app.auth import require_key
from app.db import SessionLocal
from app.models import Mark, Trade, utcnow

router = APIRouter(prefix="/api", dependencies=[Depends(require_key)])


class TradeIn(BaseModel):
    symbol: str = Field(min_length=1, max_length=12)
    side: str = Field(pattern="^(BUY|SELL)$")
    qty: float = Field(gt=0)
    price: float = Field(ge=0)
    fees: float = Field(default=0.0, ge=0)
    executed_at: str = Field(pattern=r"^\d{4}-\d{2}-\d{2}$")
    note: str = ""


class MarkIn(BaseModel):
    price: float = Field(ge=0)


class MarkRow(BaseModel):
    symbol: str = Field(min_length=1, max_length=12)
    price: float = Field(ge=0)
    marked_at: Optional[str] = None
    source: str = Field(default="manual", pattern="^(auto|manual)$")


class ImportBody(BaseModel):
    confirm: bool = False
    version: int = 0
    trades: list[dict] = []
    marks: list[dict] = []


def _trade_out(t: Trade) -> dict:
    return {
        "id": t.id, "symbol": t.symbol, "side": t.side, "qty": t.qty,
        "price": t.price, "fees": t.fees, "executed_at": t.executed_at, "note": t.note,
    }


def _mark_out(m: Mark) -> dict:
    return {"symbol": m.symbol, "price": m.price, "marked_at": m.marked_at, "source": m.source}


@router.get("/trades")
def list_trades() -> list[dict]:
    with SessionLocal() as s:
        rows = s.scalars(select(Trade).order_by(Trade.executed_at, Trade.id)).all()
        return [_trade_out(t) for t in rows]


@router.post("/trades", status_code=201)
def create_trade(body: TradeIn) -> dict:
    with SessionLocal() as s:
        t = Trade(**{**body.model_dump(), "symbol": body.symbol.strip().upper()})
        s.add(t)
        s.commit()
        return _trade_out(t)


@router.put("/trades/{trade_id}")
def update_trade(trade_id: int, body: TradeIn) -> dict:
    with SessionLocal() as s:
        t = s.get(Trade, trade_id)
        if t is None:
            raise HTTPException(status_code=404, detail="no such trade")
        for k, v in body.model_dump().items():
            setattr(t, k, v)
        t.symbol = body.symbol.strip().upper()
        t.updated_at = utcnow()
        s.commit()
        return _trade_out(t)


@router.delete("/trades/{trade_id}", status_code=204)
def delete_trade(trade_id: int) -> None:
    with SessionLocal() as s:
        t = s.get(Trade, trade_id)
        if t is None:
            raise HTTPException(status_code=404, detail="no such trade")
        s.delete(t)
        s.commit()


@router.get("/marks")
def list_marks() -> list[dict]:
    with SessionLocal() as s:
        return [_mark_out(m) for m in s.scalars(select(Mark).order_by(Mark.symbol)).all()]


@router.put("/marks/{symbol}")
def put_mark(symbol: str, body: MarkIn) -> dict:
    sym = symbol.strip().upper()
    with SessionLocal() as s:
        m = s.get(Mark, sym)
        if m is None:
            m = Mark(symbol=sym, price=body.price, marked_at=utcnow(), source="manual")
            s.add(m)
        else:
            m.price = body.price
            m.marked_at = utcnow()
            m.source = "manual"
        s.commit()
        return _mark_out(m)


@router.post("/marks/refresh")
def refresh_marks() -> list[dict]:
    with SessionLocal() as s:
        net: dict[str, float] = {}
        for sym, side, qty in s.execute(select(Trade.symbol, Trade.side, Trade.qty)).all():
            net[sym] = net.get(sym, 0.0) + (qty if side == "BUY" else -qty)
        open_syms = sorted(sym for sym, q in net.items() if q > 1e-9)
        for sym, price in quotes.fetch_quotes(open_syms).items():
            m = s.get(Mark, sym)
            if m is None:
                s.add(Mark(symbol=sym, price=price, marked_at=utcnow(), source="auto"))
            else:
                m.price = price
                m.marked_at = utcnow()
                m.source = "auto"
        s.commit()
        return [_mark_out(m) for m in s.scalars(select(Mark).order_by(Mark.symbol)).all()]


@router.get("/export")
def export_all() -> dict:
    with SessionLocal() as s:
        trades = [_trade_out(t) for t in s.scalars(select(Trade).order_by(Trade.id)).all()]
        marks = [_mark_out(m) for m in s.scalars(select(Mark)).all()]
        return {"version": 1, "trades": trades, "marks": marks}


@router.post("/import")
def import_all(body: ImportBody) -> dict:
    if not body.confirm:
        raise HTTPException(status_code=400, detail="set confirm=true to replace all data")
    if body.version != 1:
        raise HTTPException(status_code=400, detail="not a Curia backup (missing version)")

    trades: list[TradeIn] = []
    marks: list[MarkRow] = []
    try:
        for row in body.trades:
            trades.append(TradeIn(**{k: row[k] for k in
                                     ("symbol", "side", "qty", "price", "fees", "executed_at", "note")
                                     if k in row}))
        for row in body.marks:
            marks.append(MarkRow(**row))
    except ValidationError as e:
        raise HTTPException(status_code=400, detail=f"invalid import data: {e}")

    with SessionLocal() as s:
        s.execute(delete(Trade))
        s.execute(delete(Mark))
        for data in trades:
            s.add(Trade(**{**data.model_dump(), "symbol": data.symbol.strip().upper()}))
        for row in marks:
            s.add(Mark(symbol=row.symbol.strip().upper(),
                       price=row.price,
                       marked_at=row.marked_at or utcnow(),
                       source=row.source))
        s.commit()
        return {"trades": len(trades), "marks": len(marks)}
