from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Response
from pydantic import BaseModel, Field, ValidationError
from sqlalchemy import delete, select

from app import quotes
from app.auth import require_key
from app.db import SessionLocal
from app.models import Mark, Option, QuietWeek, Settings, Trade, Wheel, utcnow

router = APIRouter(prefix="/api", dependencies=[Depends(require_key)])


class SettingsIn(BaseModel):
    option_fee_per_contract: float = Field(default=0.0, ge=0)
    stock_fee_per_trade: float = Field(default=0.0, ge=0)
    tax_rate_pct: float = Field(default=0.0, ge=0, le=100)


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


class OptionIn(BaseModel):
    symbol: str = Field(min_length=1, max_length=12)
    opt_type: str = Field(pattern="^(CALL|PUT)$")
    strike: float = Field(ge=0)
    expiration: str = Field(pattern=r"^\d{4}-\d{2}-\d{2}$")
    contracts: int = Field(ge=1)
    premium: float = Field(ge=0)
    fees: float = Field(default=0.0, ge=0)
    opened_at: str = Field(pattern=r"^\d{4}-\d{2}-\d{2}$")
    note: str = ""


class SettleIn(BaseModel):
    outcome: str = Field(pattern="^(EXPIRED|BOUGHT_BACK|ASSIGNED)$")
    closed_at: Optional[str] = Field(default=None, pattern=r"^\d{4}-\d{2}-\d{2}$")
    buyback_price: Optional[float] = Field(default=None, ge=0)
    close_fees: float = Field(default=0.0, ge=0)


class OptionRow(BaseModel):
    symbol: str = Field(min_length=1, max_length=12)
    opt_type: str = Field(pattern="^(CALL|PUT)$")
    strike: float = Field(ge=0)
    expiration: str
    contracts: int = Field(ge=1)
    premium: float = Field(ge=0)
    fees: float = Field(default=0.0, ge=0)
    opened_at: str
    note: str = ""
    status: str = Field(default="OPEN", pattern="^(OPEN|EXPIRED|BOUGHT_BACK|ASSIGNED)$")
    closed_at: Optional[str] = None
    buyback_price: float = Field(default=0.0, ge=0)
    close_fees: float = Field(default=0.0, ge=0)
    assigned_trade_id: Optional[int] = None


class WheelIn(BaseModel):
    symbol: str = Field(min_length=1, max_length=12)
    opened_at: Optional[str] = Field(default=None, pattern=r"^\d{4}-\d{2}-\d{2}$")


class WheelCloseIn(BaseModel):
    closed_at: Optional[str] = Field(default=None, pattern=r"^\d{4}-\d{2}-\d{2}$")


class WheelRow(BaseModel):
    symbol: str = Field(min_length=1, max_length=12)
    no: int = Field(ge=1)
    opened_at: str
    closed_at: Optional[str] = None


class QuietWeekIn(BaseModel):
    friday: str = Field(pattern=r"^\d{4}-\d{2}-\d{2}$")


class ImportBody(BaseModel):
    confirm: bool = False
    version: int = 0
    trades: list[dict] = []
    marks: list[dict] = []
    options: list[dict] = []
    wheels: list[dict] = []
    quiet_weeks: list[str] = []
    # Absent from older backups, which must still restore. Missing settings means keep
    # the defaults, never wipe the ones already configured on this install.
    settings: Optional[dict] = None


def _trade_out(t: Trade) -> dict:
    return {
        "id": t.id, "symbol": t.symbol, "side": t.side, "qty": t.qty,
        "price": t.price, "fees": t.fees, "executed_at": t.executed_at, "note": t.note,
    }


def _mark_out(m: Mark) -> dict:
    return {"symbol": m.symbol, "price": m.price, "marked_at": m.marked_at, "source": m.source}


def _option_out(o: Option) -> dict:
    return {
        "id": o.id, "symbol": o.symbol, "opt_type": o.opt_type, "strike": o.strike,
        "expiration": o.expiration, "contracts": o.contracts, "premium": o.premium,
        "fees": o.fees, "opened_at": o.opened_at, "note": o.note, "status": o.status,
        "closed_at": o.closed_at, "buyback_price": o.buyback_price,
        "close_fees": o.close_fees, "assigned_trade_id": o.assigned_trade_id,
    }


def _wheel_out(w: Wheel) -> dict:
    return {"id": w.id, "symbol": w.symbol, "no": w.no,
            "opened_at": w.opened_at, "closed_at": w.closed_at}


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


@router.get("/options")
def list_options() -> list:
    with SessionLocal() as s:
        rows = s.scalars(select(Option).order_by(Option.expiration, Option.id)).all()
        return [_option_out(o) for o in rows]


@router.post("/options", status_code=201)
def create_option(body: OptionIn) -> dict:
    with SessionLocal() as s:
        o = Option(**{**body.model_dump(), "symbol": body.symbol.strip().upper()})
        s.add(o)
        s.commit()
        return _option_out(o)


@router.put("/options/{option_id}")
def update_option(option_id: int, body: OptionIn) -> dict:
    with SessionLocal() as s:
        o = s.get(Option, option_id)
        if o is None:
            raise HTTPException(status_code=404, detail="no such option")
        if o.status != "OPEN":
            raise HTTPException(status_code=409, detail="already settled")
        for k, v in body.model_dump().items():
            setattr(o, k, v)
        o.symbol = body.symbol.strip().upper()
        o.updated_at = utcnow()
        s.commit()
        return _option_out(o)


@router.delete("/options/{option_id}", status_code=204)
def delete_option(option_id: int) -> None:
    with SessionLocal() as s:
        o = s.get(Option, option_id)
        if o is None:
            raise HTTPException(status_code=404, detail="no such option")
        s.delete(o)
        s.commit()


@router.post("/options/{option_id}/settle")
def settle_option(option_id: int, body: SettleIn) -> dict:
    if body.outcome == "BOUGHT_BACK" and body.buyback_price is None:
        raise HTTPException(status_code=400, detail="bought back needs buyback_price")
    with SessionLocal() as s:
        o = s.get(Option, option_id)
        if o is None:
            raise HTTPException(status_code=404, detail="no such option")
        if o.status != "OPEN":
            raise HTTPException(status_code=409, detail="already settled")
        closed = body.closed_at or utcnow()[:10]
        if body.outcome == "ASSIGNED":
            t = Trade(
                symbol=o.symbol,
                side="BUY" if o.opt_type == "PUT" else "SELL",
                qty=o.contracts * 100.0,
                price=o.strike,
                fees=0.0,
                executed_at=closed,
                note=f"assigned: {o.symbol} ${o.strike:g} {o.opt_type} exp {o.expiration}",
            )
            s.add(t)
            s.flush()  # id now, still inside the one transaction
            o.assigned_trade_id = t.id
        o.status = body.outcome
        o.closed_at = closed
        o.buyback_price = body.buyback_price if body.outcome == "BOUGHT_BACK" else 0.0
        o.close_fees = body.close_fees
        o.updated_at = utcnow()
        s.commit()
        return _option_out(o)


@router.get("/wheels")
def list_wheels() -> list:
    with SessionLocal() as s:
        return [_wheel_out(w) for w in s.scalars(select(Wheel).order_by(Wheel.symbol, Wheel.no)).all()]


@router.post("/wheels", status_code=201)
def open_wheel(body: WheelIn) -> dict:
    sym = body.symbol.strip().upper()
    with SessionLocal() as s:
        existing = s.scalars(select(Wheel).where(Wheel.symbol == sym)).all()
        if any(w.closed_at is None for w in existing):
            raise HTTPException(status_code=409, detail="this symbol already has an open wheel")
        w = Wheel(symbol=sym, no=max((w.no for w in existing), default=0) + 1,
                  opened_at=body.opened_at or utcnow()[:10])
        s.add(w)
        s.commit()
        return _wheel_out(w)


@router.post("/wheels/{wheel_id}/close")
def close_wheel(wheel_id: int, body: WheelCloseIn) -> dict:
    with SessionLocal() as s:
        w = s.get(Wheel, wheel_id)
        if w is None:
            raise HTTPException(status_code=404, detail="no such wheel")
        if w.closed_at is not None:
            raise HTTPException(status_code=409, detail="already completed")
        w.closed_at = body.closed_at or utcnow()[:10]
        w.updated_at = utcnow()
        s.commit()
        return _wheel_out(w)


@router.delete("/wheels/{wheel_id}", status_code=204)
def delete_wheel(wheel_id: int) -> None:
    with SessionLocal() as s:
        w = s.get(Wheel, wheel_id)
        if w is None:
            raise HTTPException(status_code=404, detail="no such wheel")
        s.delete(w)
        s.commit()


def _settings_row(s) -> Settings:
    """The one settings row, created on first read so a fresh install has defaults
    rather than a 404 the client has to special-case."""
    row = s.get(Settings, 1)
    if row is None:
        row = Settings(id=1)
        s.add(row)
        s.commit()
        s.refresh(row)
    return row


def _settings_out(row: Settings) -> dict:
    return {
        "option_fee_per_contract": row.option_fee_per_contract,
        "stock_fee_per_trade": row.stock_fee_per_trade,
        "tax_rate_pct": row.tax_rate_pct,
        "updated_at": row.updated_at,
    }


@router.get("/settings")
def get_settings() -> dict:
    with SessionLocal() as s:
        return _settings_out(_settings_row(s))


@router.put("/settings")
def put_settings(body: SettingsIn) -> dict:
    with SessionLocal() as s:
        row = _settings_row(s)
        row.option_fee_per_contract = body.option_fee_per_contract
        row.stock_fee_per_trade = body.stock_fee_per_trade
        row.tax_rate_pct = body.tax_rate_pct
        row.updated_at = utcnow()
        s.commit()
        s.refresh(row)
        return _settings_out(row)


@router.get("/quiet-weeks")
def list_quiet_weeks() -> list:
    with SessionLocal() as s:
        return [q.friday for q in s.scalars(select(QuietWeek).order_by(QuietWeek.friday)).all()]


@router.post("/quiet-weeks")
def mark_quiet_week(body: QuietWeekIn, response: Response) -> dict:
    with SessionLocal() as s:
        if s.get(QuietWeek, body.friday) is not None:
            return {"friday": body.friday}  # already marked; re-marking is not an error
        s.add(QuietWeek(friday=body.friday))
        s.commit()
    response.status_code = 201
    return {"friday": body.friday}


@router.delete("/quiet-weeks/{friday}", status_code=204)
def clear_quiet_week(friday: str) -> None:
    with SessionLocal() as s:
        q = s.get(QuietWeek, friday)
        if q is None:
            raise HTTPException(status_code=404, detail="week is not marked")
        s.delete(q)
        s.commit()


@router.get("/export")
def export_all() -> dict:
    with SessionLocal() as s:
        trades = [_trade_out(t) for t in s.scalars(select(Trade).order_by(Trade.id)).all()]
        marks = [_mark_out(m) for m in s.scalars(select(Mark)).all()]
        options = [_option_out(o) for o in s.scalars(select(Option).order_by(Option.id)).all()]
        wheels = [_wheel_out(w) for w in s.scalars(select(Wheel).order_by(Wheel.id)).all()]
        quiet = [q.friday for q in s.scalars(select(QuietWeek).order_by(QuietWeek.friday)).all()]
        settings = _settings_out(_settings_row(s))
        return {"version": 1, "trades": trades, "marks": marks, "options": options,
                "wheels": wheels, "quiet_weeks": quiet, "settings": settings}


@router.post("/import")
def import_all(body: ImportBody) -> dict:
    if not body.confirm:
        raise HTTPException(status_code=400, detail="set confirm=true to replace all data")
    if body.version != 1:
        raise HTTPException(status_code=400, detail="not a Curia backup (missing version)")

    trades: list[TradeIn] = []
    marks: list[MarkRow] = []
    option_rows: list[OptionRow] = []
    wheel_rows: list[WheelRow] = []
    quiet_rows: list = []
    old_ids = [row.get("id") for row in body.trades]
    try:
        for row in body.trades:
            trades.append(TradeIn(**{k: row[k] for k in
                                     ("symbol", "side", "qty", "price", "fees", "executed_at", "note")
                                     if k in row}))
        for row in body.marks:
            marks.append(MarkRow(**row))
        for row in body.options:
            option_rows.append(OptionRow(**row))
        for row in body.wheels:
            wheel_rows.append(WheelRow(**row))
        for row in body.quiet_weeks:
            quiet_rows.append(QuietWeekIn(friday=row).friday)
        imported_settings = SettingsIn(**body.settings) if body.settings else None
    except ValidationError as e:
        raise HTTPException(status_code=400, detail=f"invalid import data: {e}")

    with SessionLocal() as s:
        s.execute(delete(Trade))
        s.execute(delete(Mark))
        s.execute(delete(Option))
        s.execute(delete(Wheel))
        s.execute(delete(QuietWeek))
        # Settings are updated rather than deleted and recreated: the row is a singleton
        # and a backup without one should leave what is configured here alone.
        if imported_settings is not None:
            row = _settings_row(s)
            row.option_fee_per_contract = imported_settings.option_fee_per_contract
            row.stock_fee_per_trade = imported_settings.stock_fee_per_trade
            row.tax_rate_pct = imported_settings.tax_rate_pct
            row.updated_at = utcnow()
        id_map: dict = {}
        for old_id, data in zip(old_ids, trades):
            t = Trade(**{**data.model_dump(), "symbol": data.symbol.strip().upper()})
            s.add(t)
            s.flush()  # id now, still inside the one transaction
            if old_id is not None:
                id_map[old_id] = t.id
        for row in marks:
            s.add(Mark(symbol=row.symbol.strip().upper(),
                       price=row.price,
                       marked_at=row.marked_at or utcnow(),
                       source=row.source))
        for row in option_rows:
            assigned = id_map.get(row.assigned_trade_id) if row.assigned_trade_id is not None else None
            s.add(Option(**{**row.model_dump(), "symbol": row.symbol.strip().upper(),
                            "assigned_trade_id": assigned}))
        for row in wheel_rows:
            s.add(Wheel(symbol=row.symbol.strip().upper(),
                       no=row.no,
                       opened_at=row.opened_at,
                       closed_at=row.closed_at))
        for friday in quiet_rows:
            s.add(QuietWeek(friday=friday))
        s.commit()
        return {"trades": len(trades), "marks": len(marks), "options": len(option_rows),
                "wheels": len(wheel_rows), "quiet_weeks": len(quiet_rows)}
