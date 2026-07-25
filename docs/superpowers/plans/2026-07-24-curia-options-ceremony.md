# Curia — Weekly Options + Trade Ceremony — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Sold-options tracking (premium, expiry countdown, expire/buyback/assign settlement with atomic stock booking) plus the print→fold→envelope→ship→stamp-in ceremony on every trade submit.

**Architecture:** Same shape as the base app — dumb store rows in the backend (`options` table + settle endpoint whose ASSIGNED branch books the stock trade in one transaction), all money math in tested TS (`optionsMath.ts`), ceremony as a dependency-free CSS/state-machine overlay.

**Tech Stack:** unchanged (React 19 + Vite 7 on Node 20; FastAPI + SQLAlchemy on Python 3.9 venv; Railway deploy via `railway up`).

## Global Constraints

- Spec: `docs/superpowers/specs/2026-07-24-curia-options-ceremony-design.md`. Repo `~/curia-app`, branch `dev` (create from `main` at start; merge back at end).
- Frontend commands: `export PATH="$HOME/.nvm/versions/node/v20.20.2/bin:$PATH"` first, always. Backend venv is Python 3.9: `typing.Optional[...]`, never `X | None`.
- Enums are exact uppercase strings: sides `BUY`/`SELL`; option types `CALL`/`PUT`; statuses `OPEN`/`EXPIRED`/`BOUGHT_BACK`/`ASSIGNED`. All dates `YYYY-MM-DD`; timestamps ISO UTC.
- Premium is **per share**; cash collected = `premium × 100 × contracts`. Contracts are integers ≥ 1.
- Assignment is atomic: option flip + stock-trade insert in ONE transaction; PUT→BUY, CALL→SELL, qty = `contracts × 100`, price = strike, fees 0, note `assigned: SYM $STRIKE TYPE exp EXPIRATION`.
- Snapshot cache key becomes `curia-cache-v2` (shape gains `options`).
- Ceremony: stages print(1.2s+0.4s seal) → fold(0.9s) → envelope(0.8s) → ship(0.9s) → stamp-in; tap anywhere skips; **NO reduced-motion bypass** (explicit user preference); after landing, odometers roll slow (`--roll-hero: 2.2s`, `--roll-detail: 2.6s`) for ~3s via a `roll-slow` class, then normal.
- Ceremony plays only after the server accepted the trade. Errors stay in the sheet.
- Never commit `node_modules`, `.venv`, `dist`, `*.db`. Commit at the end of every task with the given message.

---

### Task 1: Backend — options table, CRUD, atomic settle, backup rows (TDD)

**Files:**
- Modify: `backend/app/models.py` (add `Option`), `backend/app/routes.py` (option schemas + endpoints + export/import)
- Test: create `backend/tests/test_options.py`; modify `backend/tests/test_export_import.py`

**Interfaces:**
- Consumes: existing `Trade`, `SessionLocal`, `require_key` router pattern, `utcnow`.
- Produces the HTTP contract Tasks 2–5 build on:
  - `GET /api/options` → `[OptionOut]` ordered by (`expiration`, `id`)
  - `POST /api/options` (OptionIn) → OptionOut 201, always status OPEN, symbol upper-cased
  - `PUT /api/options/{id}` (OptionIn) → OptionOut; 404 missing; **409 if not OPEN**
  - `DELETE /api/options/{id}` → 204
  - `POST /api/options/{id}/settle` body `{outcome, closed_at?, buyback_price?, close_fees?}` → OptionOut; 404/409; 400 if BOUGHT_BACK without `buyback_price`; ASSIGNED books the stock trade atomically and sets `assigned_trade_id`
  - `OptionOut = {id, symbol, opt_type, strike, expiration, contracts, premium, fees, opened_at, note, status, closed_at, buyback_price, close_fees, assigned_trade_id}`
  - `GET /api/export` gains `"options": [OptionOut]` (by id); `POST /api/import` accepts optional `options` (validated `OptionRow`), still version-gated

- [ ] **Step 1: Branch + failing tests**

```bash
cd ~/curia-app && git checkout -b dev
```

`backend/tests/test_options.py`:
```python
from tests.conftest import HEADERS

CSP = {"symbol": "tqqq", "opt_type": "PUT", "strike": 62.0, "expiration": "2026-07-31",
       "contracts": 2, "premium": 0.74, "fees": 1.30, "opened_at": "2026-07-24", "note": "weekly"}


def _create(client, body=None):
    r = client.post("/api/options", json=body or CSP, headers=HEADERS)
    assert r.status_code == 201
    return r.json()


def test_create_and_list_round_trip(client):
    o = _create(client)
    assert o["symbol"] == "TQQQ"           # upper-cased
    assert o["status"] == "OPEN"
    assert o["closed_at"] is None
    assert o["assigned_trade_id"] is None
    assert client.get("/api/options", headers=HEADERS).json() == [o]


def test_validation_rejects_bad_type_and_contracts(client):
    assert client.post("/api/options", json={**CSP, "opt_type": "STRADDLE"}, headers=HEADERS).status_code == 422
    assert client.post("/api/options", json={**CSP, "contracts": 0}, headers=HEADERS).status_code == 422
    assert client.post("/api/options", json={**CSP, "premium": -1}, headers=HEADERS).status_code == 422


def test_edit_open_option(client):
    o = _create(client)
    r = client.put(f"/api/options/{o['id']}", json={**CSP, "premium": 0.80}, headers=HEADERS)
    assert r.json()["premium"] == 0.80


def test_delete_option(client):
    o = _create(client)
    assert client.delete(f"/api/options/{o['id']}", headers=HEADERS).status_code == 204
    assert client.get("/api/options", headers=HEADERS).json() == []


def test_settle_expired_keeps_everything(client):
    o = _create(client)
    r = client.post(f"/api/options/{o['id']}/settle",
                    json={"outcome": "EXPIRED", "closed_at": "2026-07-31"}, headers=HEADERS)
    body = r.json()
    assert body["status"] == "EXPIRED"
    assert body["closed_at"] == "2026-07-31"
    assert body["assigned_trade_id"] is None
    assert client.get("/api/trades", headers=HEADERS).json() == []  # no stock side


def test_settle_bought_back_requires_price(client):
    o = _create(client)
    assert client.post(f"/api/options/{o['id']}/settle",
                       json={"outcome": "BOUGHT_BACK"}, headers=HEADERS).status_code == 400
    r = client.post(f"/api/options/{o['id']}/settle",
                    json={"outcome": "BOUGHT_BACK", "buyback_price": 0.21, "close_fees": 1.0,
                          "closed_at": "2026-07-30"}, headers=HEADERS)
    assert r.json()["buyback_price"] == 0.21
    assert r.json()["close_fees"] == 1.0


def test_settle_assigned_put_books_buy_atomically(client):
    o = _create(client)
    r = client.post(f"/api/options/{o['id']}/settle",
                    json={"outcome": "ASSIGNED", "closed_at": "2026-07-31"}, headers=HEADERS)
    body = r.json()
    trades = client.get("/api/trades", headers=HEADERS).json()
    assert len(trades) == 1
    t = trades[0]
    assert t["side"] == "BUY" and t["qty"] == 200 and t["price"] == 62.0
    assert t["executed_at"] == "2026-07-31"
    assert t["note"] == "assigned: TQQQ $62 PUT exp 2026-07-31"
    assert body["assigned_trade_id"] == t["id"]


def test_settle_assigned_call_books_sell(client):
    o = _create(client, {**CSP, "opt_type": "CALL", "strike": 70.0})
    client.post(f"/api/options/{o['id']}/settle",
                json={"outcome": "ASSIGNED", "closed_at": "2026-07-31"}, headers=HEADERS)
    t = client.get("/api/trades", headers=HEADERS).json()[0]
    assert t["side"] == "SELL" and t["price"] == 70.0


def test_double_settle_and_edit_after_settle_409(client):
    o = _create(client)
    client.post(f"/api/options/{o['id']}/settle", json={"outcome": "EXPIRED"}, headers=HEADERS)
    assert client.post(f"/api/options/{o['id']}/settle",
                       json={"outcome": "EXPIRED"}, headers=HEADERS).status_code == 409
    assert client.put(f"/api/options/{o['id']}", json=CSP, headers=HEADERS).status_code == 409
```

Append to `backend/tests/test_export_import.py`:
```python
CSP_OPT = {"symbol": "TQQQ", "opt_type": "PUT", "strike": 62.0, "expiration": "2026-07-31",
           "contracts": 2, "premium": 0.74, "fees": 1.3, "opened_at": "2026-07-24", "note": ""}


def test_export_import_round_trip_with_options(client):
    o = client.post("/api/options", json=CSP_OPT, headers=HEADERS).json()
    client.post(f"/api/options/{o['id']}/settle",
                json={"outcome": "ASSIGNED", "closed_at": "2026-07-31"}, headers=HEADERS)
    backup = client.get("/api/export", headers=HEADERS).json()
    assert len(backup["options"]) == 1 and len(backup["trades"]) == 1

    client.post("/api/import", json={"confirm": True, "version": 1}, headers=HEADERS)
    result = client.post("/api/import", json={"confirm": True, **backup}, headers=HEADERS)
    assert result.json() == {"trades": 1, "marks": 0, "options": 1}
    restored = client.get("/api/options", headers=HEADERS).json()[0]
    assert restored["status"] == "ASSIGNED"
    assert restored["buyback_price"] == 0.0
    assert restored["assigned_trade_id"] is not None


def test_pre_options_backup_still_imports(client):
    body = {"confirm": True, "version": 1,
            "trades": [{"symbol": "AAPL", "side": "BUY", "qty": 1, "price": 100,
                        "fees": 0, "executed_at": "2026-07-01", "note": ""}],
            "marks": []}
    assert client.post("/api/import", json=body, headers=HEADERS).status_code == 200
    assert client.get("/api/options", headers=HEADERS).json() == []
```

- [ ] **Step 2: Run to verify failure**

```bash
cd ~/curia-app/backend && source .venv/bin/activate && python -m pytest tests/test_options.py -q
```
Expected: errors — `/api/options` returns 404/405 (routes don't exist).

- [ ] **Step 3: Implement**

Append to `backend/app/models.py` (add `from typing import Optional` at top):
```python
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
```

In `backend/app/routes.py`: import `Option` from `app.models` and `Optional` from `typing`; add after the existing schemas:
```python
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


def _option_out(o: Option) -> dict:
    return {
        "id": o.id, "symbol": o.symbol, "opt_type": o.opt_type, "strike": o.strike,
        "expiration": o.expiration, "contracts": o.contracts, "premium": o.premium,
        "fees": o.fees, "opened_at": o.opened_at, "note": o.note, "status": o.status,
        "closed_at": o.closed_at, "buyback_price": o.buyback_price,
        "close_fees": o.close_fees, "assigned_trade_id": o.assigned_trade_id,
    }


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
```

Extend export/import in the same file:
- `ImportBody` gains `options: list[dict] = []`.
- `export_all` adds `"options": [_option_out(o) for o in s.scalars(select(Option).order_by(Option.id)).all()]`.
- `import_all`: pre-validate `option_rows = [OptionRow(**r) for r in body.options]` inside the existing try; add `s.execute(delete(Option))` beside the other deletes; insert each with `Option(**{**row.model_dump(), "symbol": row.symbol.strip().upper()})`; return `{"trades": ..., "marks": ..., "options": len(option_rows)}`. Update the two existing import tests' expected dicts to include `"marks": 0/1, "options": 0` accordingly (`test_export_import_round_trip` expects `{"trades": 1, "marks": 1, "options": 0}`).

- [ ] **Step 4: Run the full backend suite**

```bash
python -m pytest -q
```
Expected: 31 passed (20 existing + 9 options + 2 export additions; existing round-trip test updated for the new import-count shape).

- [ ] **Step 5: Commit**

```bash
cd ~/curia-app && git add backend && git commit -m "feat(backend): options table, CRUD, atomic assign-settle, backup rows, test-first"
```

---

### Task 2: Frontend math + types + API + snapshot v2 (TDD)

**Files:**
- Modify: `frontend/src/lib/types.ts`, `frontend/src/lib/time.ts`, `frontend/src/lib/api.ts`
- Create: `frontend/src/lib/optionsMath.ts`
- Test: create `frontend/src/lib/__tests__/optionsMath.test.ts`; modify `frontend/src/lib/__tests__/time.test.ts`, `frontend/src/lib/__tests__/api.test.ts`, and the `Snapshot` fixtures in `frontend/src/components/__tests__/PortfolioTab.test.tsx`, `frontend/src/components/__tests__/LedgerTab.test.tsx` (add `options: []`)

**Interfaces:**
- Consumes: backend contract from Task 1.
- Produces for Tasks 3–5:
  - `types.ts`: `OptionStatus`, `OptionType = 'CALL' | 'PUT'`, `OptionPosition` (exact backend OptionOut shape, `closed_at: string | null`, `assigned_trade_id: number | null`), `OptionDraft = Omit<OptionPosition, 'id' | 'status' | 'closed_at' | 'buyback_price' | 'close_fees' | 'assigned_trade_id'>`, `OptionStats { totalKept; winRate; expiredCount; boughtBackCount; assignedCount; settledCount; avgTake }`
  - `optionsMath.ts`: `premiumCollected(o): number`, `optionRealizedPl(o): number | null` (null while OPEN), `computeOptionStats(options: OptionPosition[]): OptionStats`
  - `time.ts`: `daysUntil(dateStr): number` (local midnights), `expiryLabel(dateStr): string` (`'past due' | 'today' | 'tomorrow' | 'Nd'`), `nextFriday(): string` (upcoming Friday, today if Friday)
  - `api.ts`: `Snapshot` gains `options: OptionPosition[]`; cache key `'curia-cache-v2'`; `createOption(d: OptionDraft)`, `updateOption(id: number, d: OptionDraft)`, `deleteOption(id: number)`, `settleOption(id: number, body: { outcome: OptionStatus; closed_at?: string; buyback_price?: number; close_fees?: number })` all returning `OptionPosition` (delete → void)

- [ ] **Step 1: Failing tests**

`frontend/src/lib/__tests__/optionsMath.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { computeOptionStats, optionRealizedPl, premiumCollected } from '../optionsMath';
import type { OptionPosition } from '../types';

let nextId = 1;
function opt(p: Partial<OptionPosition>): OptionPosition {
  return {
    id: nextId++, symbol: 'TQQQ', opt_type: 'PUT', strike: 62, expiration: '2026-07-31',
    contracts: 2, premium: 0.74, fees: 1.3, opened_at: '2026-07-24', note: '',
    status: 'OPEN', closed_at: null, buyback_price: 0, close_fees: 0,
    assigned_trade_id: null, ...p,
  };
}

describe('optionsMath', () => {
  it('collected = premium x 100 x contracts', () => {
    expect(premiumCollected(opt({}))).toBeCloseTo(148);
  });

  it('open options have no realized P/L yet', () => {
    expect(optionRealizedPl(opt({}))).toBeNull();
  });

  it('expired keeps everything minus fees', () => {
    expect(optionRealizedPl(opt({ status: 'EXPIRED' }))).toBeCloseTo(146.7);
  });

  it('bought back nets premium minus buyback minus both fees', () => {
    const o = opt({ status: 'BOUGHT_BACK', buyback_price: 0.21, close_fees: 1 });
    // (0.74 - 0.21) * 200 - 1.3 - 1 = 106 - 2.3
    expect(optionRealizedPl(o)).toBeCloseTo(103.7);
  });

  it('assigned keeps the premium; share economics live in the stock ledger', () => {
    expect(optionRealizedPl(opt({ status: 'ASSIGNED' }))).toBeCloseTo(146.7);
  });

  it('stats aggregate settled options only, zeros when none', () => {
    expect(computeOptionStats([opt({})])).toEqual({
      totalKept: 0, winRate: 0, expiredCount: 0, boughtBackCount: 0,
      assignedCount: 0, settledCount: 0, avgTake: 0,
    });
    const s = computeOptionStats([
      opt({ status: 'EXPIRED' }),                                          // +146.7
      opt({ status: 'BOUGHT_BACK', buyback_price: 0.9, close_fees: 0 }),   // (0.74-0.9)*200-1.3 = -33.3
      opt({ status: 'ASSIGNED' }),                                         // +146.7
      opt({}),                                                             // open, ignored
    ]);
    expect(s.settledCount).toBe(3);
    expect(s.expiredCount).toBe(1);
    expect(s.boughtBackCount).toBe(1);
    expect(s.assignedCount).toBe(1);
    expect(s.totalKept).toBeCloseTo(260.1);
    expect(s.winRate).toBeCloseTo((2 / 3) * 100);
    expect(s.avgTake).toBeCloseTo(86.7);
  });
});
```

Append to `frontend/src/lib/__tests__/time.test.ts` (inside the existing describe or a new one, keeping the fake-timer hooks pattern already in the file):
```ts
describe('expiry helpers', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('daysUntil and expiryLabel count local days', () => {
    vi.setSystemTime(new Date(2026, 6, 24, 18, 0, 0)); // Fri Jul 24, 6pm local
    expect(daysUntil('2026-07-24')).toBe(0);
    expect(expiryLabel('2026-07-24')).toBe('today');
    expect(expiryLabel('2026-07-25')).toBe('tomorrow');
    expect(expiryLabel('2026-07-31')).toBe('7d');
    expect(expiryLabel('2026-07-20')).toBe('past due');
  });

  it('nextFriday returns today on a Friday, else the coming Friday', () => {
    vi.setSystemTime(new Date(2026, 6, 24, 9, 0, 0)); // Friday
    expect(nextFriday()).toBe('2026-07-24');
    vi.setSystemTime(new Date(2026, 6, 27, 9, 0, 0)); // Monday
    expect(nextFriday()).toBe('2026-07-31');
  });
});
```
(Update that file's import line to `import { agoLabel, daysUntil, expiryLabel, nextFriday } from '../time';`.)

- [ ] **Step 2: Run to verify failure**

```bash
cd ~/curia-app/frontend && npx vitest run src/lib/__tests__/optionsMath.test.ts src/lib/__tests__/time.test.ts
```
Expected: FAIL — missing module / missing exports.

- [ ] **Step 3: Implement**

Append to `frontend/src/lib/types.ts`:
```ts
export type OptionType = 'CALL' | 'PUT';
export type OptionStatus = 'OPEN' | 'EXPIRED' | 'BOUGHT_BACK' | 'ASSIGNED';

export interface OptionPosition {
  id: number;
  symbol: string;
  opt_type: OptionType;
  strike: number;
  expiration: string; // YYYY-MM-DD
  contracts: number;
  premium: number; // per share
  fees: number;
  opened_at: string;
  note: string;
  status: OptionStatus;
  closed_at: string | null;
  buyback_price: number;
  close_fees: number;
  assigned_trade_id: number | null;
}

export type OptionDraft = Omit<
  OptionPosition,
  'id' | 'status' | 'closed_at' | 'buyback_price' | 'close_fees' | 'assigned_trade_id'
>;

export interface OptionStats {
  totalKept: number;
  winRate: number; // percent
  expiredCount: number;
  boughtBackCount: number;
  assignedCount: number;
  settledCount: number;
  avgTake: number;
}
```

`frontend/src/lib/optionsMath.ts`:
```ts
import type { OptionPosition, OptionStats } from './types';

export function premiumCollected(o: OptionPosition): number {
  return o.premium * 100 * o.contracts;
}

export function optionRealizedPl(o: OptionPosition): number | null {
  switch (o.status) {
    case 'OPEN':
      return null;
    case 'EXPIRED':
    case 'ASSIGNED':
      return premiumCollected(o) - o.fees;
    case 'BOUGHT_BACK':
      return (o.premium - o.buyback_price) * 100 * o.contracts - o.fees - o.close_fees;
  }
}

export function computeOptionStats(options: OptionPosition[]): OptionStats {
  const settled = options.filter((o) => o.status !== 'OPEN');
  if (!settled.length) {
    return {
      totalKept: 0, winRate: 0, expiredCount: 0, boughtBackCount: 0,
      assignedCount: 0, settledCount: 0, avgTake: 0,
    };
  }
  const pls = settled.map((o) => optionRealizedPl(o) ?? 0);
  const wins = pls.filter((p) => p > 0).length;
  const totalKept = pls.reduce((a, b) => a + b, 0);
  return {
    totalKept,
    winRate: (wins / settled.length) * 100,
    expiredCount: settled.filter((o) => o.status === 'EXPIRED').length,
    boughtBackCount: settled.filter((o) => o.status === 'BOUGHT_BACK').length,
    assignedCount: settled.filter((o) => o.status === 'ASSIGNED').length,
    settledCount: settled.length,
    avgTake: totalKept / settled.length,
  };
}
```

Append to `frontend/src/lib/time.ts`:
```ts
function localDateString(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function daysUntil(dateStr: string): number {
  const [y, m, d] = dateStr.split('-').map(Number);
  const target = new Date(y, m - 1, d);
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  return Math.round((target.getTime() - today.getTime()) / 86_400_000);
}

export function expiryLabel(dateStr: string): string {
  const days = daysUntil(dateStr);
  if (days < 0) return 'past due';
  if (days === 0) return 'today';
  if (days === 1) return 'tomorrow';
  return `${days}d`;
}

export function nextFriday(): string {
  const d = new Date();
  d.setDate(d.getDate() + ((5 - d.getDay() + 7) % 7)); // 0 when already Friday
  return localDateString(d);
}
```

`frontend/src/lib/api.ts` changes:
- `const CACHE_STORAGE = 'curia-cache-v2';`
- Import `OptionDraft, OptionPosition, OptionStatus` types; `Snapshot` gains `options: OptionPosition[]`.
- `fetchSnapshot` requests trades, marks, and `request<OptionPosition[]>('/api/options')` via one `Promise.all`, stores all three plus `fetchedAt`.
- Add:
```ts
export const createOption = (d: OptionDraft) =>
  request<OptionPosition>('/api/options', { method: 'POST', body: JSON.stringify(d) });
export const updateOption = (id: number, d: OptionDraft) =>
  request<OptionPosition>(`/api/options/${id}`, { method: 'PUT', body: JSON.stringify(d) });
export const deleteOption = (id: number) =>
  request<void>(`/api/options/${id}`, { method: 'DELETE' });
export const settleOption = (
  id: number,
  body: { outcome: Exclude<OptionStatus, 'OPEN'>; closed_at?: string; buyback_price?: number; close_fees?: number },
) => request<OptionPosition>(`/api/options/${id}/settle`, { method: 'POST', body: JSON.stringify(body) });
```
- Fixture/key repairs: `api.test.ts` cache-corruption test string `'curia-cache-v1'` → `'curia-cache-v2'`; add `options: []` to the `Snapshot` fixtures in `PortfolioTab.test.tsx` and `LedgerTab.test.tsx` (TypeScript will refuse to compile them otherwise — that IS the reminder).

- [ ] **Step 4: Full frontend suite + build**

```bash
npx vitest run && npm run build
```
Expected: 33 passed (25 + 6 optionsMath + 2 time). Build clean.

- [ ] **Step 5: Commit**

```bash
cd ~/curia-app && git add frontend/src && git commit -m "feat(options-math): premium/settlement P/L, expiry helpers, options in snapshot v2, test-first"
```

---

### Task 3: Add-sheet option mode + Open Options section + Settle sheet

**Files:**
- Modify: `frontend/src/components/AddTradeSheet.tsx` (Stock|Option mode toggle + option fields + edit-option mode), `frontend/src/components/PortfolioTab.tsx` (Open Options section + `TabProps` gains two callbacks), `frontend/src/App.tsx` (sheet union grows), `frontend/src/styles/app.css` (chip + segmented styles)
- Create: `frontend/src/components/SettleSheet.tsx`
- Test: create `frontend/src/components/__tests__/AddTradeSheet.test.tsx`, `frontend/src/components/__tests__/SettleSheet.test.tsx`; modify `frontend/src/components/__tests__/PortfolioTab.test.tsx` (+1 test); `LedgerTab.test.tsx` fixtures get the two new no-op TabProps callbacks

**Interfaces:**
- Consumes: Task 2's api + math + time helpers; existing sheet/backdrop CSS.
- Produces (binding for Tasks 4–5):
  - `TabProps` (in `PortfolioTab.tsx`) gains `onSettleOption: (o: OptionPosition) => void; onEditOption: (o: OptionPosition) => void`
  - `AddTradeSheet` props become `{ trade: Trade | null; option?: OptionPosition | null; onDone: () => Promise<void>; onCancel: () => void }` — `option` non-null = edit-option mode (mode toggle hidden when editing either kind)
  - `SettleSheet` props: `{ option: OptionPosition; onDone: () => Promise<void>; onEdit: () => void; onCancel: () => void }`
  - App's sheet state union: `{ kind: 'trade'; trade: Trade | null } | { kind: 'optionEdit'; option: OptionPosition } | { kind: 'mark'; symbol: string } | { kind: 'settle'; option: OptionPosition } | null`

- [ ] **Step 1: Failing tests**

`frontend/src/components/__tests__/AddTradeSheet.test.tsx`:
```tsx
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AddTradeSheet } from '../AddTradeSheet';

describe('AddTradeSheet option mode', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    localStorage.clear();
  });

  it('switching to Option shows option fields', () => {
    render(<AddTradeSheet trade={null} onDone={vi.fn()} onCancel={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Option' }));
    expect(screen.getByLabelText('Strike')).toBeInTheDocument();
    expect(screen.getByLabelText('Expiration')).toBeInTheDocument();
    expect(screen.getByLabelText('Contracts')).toBeInTheDocument();
    expect(screen.getByLabelText('Premium / share')).toBeInTheDocument();
  });

  it('submitting an option POSTs to /api/options', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ id: 9 }), { status: 201 }),
    );
    vi.stubGlobal('fetch', fetchMock);
    const onDone = vi.fn().mockResolvedValue(undefined);
    render(<AddTradeSheet trade={null} onDone={onDone} onCancel={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Option' }));
    fireEvent.change(screen.getByLabelText('Symbol'), { target: { value: 'tqqq' } });
    fireEvent.change(screen.getByLabelText('Strike'), { target: { value: '62' } });
    fireEvent.change(screen.getByLabelText('Contracts'), { target: { value: '2' } });
    fireEvent.change(screen.getByLabelText('Premium / share'), { target: { value: '0.74' } });
    fireEvent.click(screen.getByRole('button', { name: /Sell to open/ }));
    await waitFor(() => expect(onDone).toHaveBeenCalledOnce());
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('/api/options');
    const body = JSON.parse((init as RequestInit).body as string);
    expect(body).toMatchObject({ symbol: 'TQQQ', opt_type: 'PUT', strike: 62, contracts: 2, premium: 0.74 });
  });
});
```

`frontend/src/components/__tests__/SettleSheet.test.tsx`:
```tsx
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { SettleSheet } from '../SettleSheet';
import type { OptionPosition } from '../../lib/types';

const csp: OptionPosition = {
  id: 1, symbol: 'TQQQ', opt_type: 'PUT', strike: 62, expiration: '2026-07-31',
  contracts: 2, premium: 0.74, fees: 1.3, opened_at: '2026-07-24', note: '',
  status: 'OPEN', closed_at: null, buyback_price: 0, close_fees: 0, assigned_trade_id: null,
};

describe('SettleSheet', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    localStorage.clear();
  });

  it('expired outcome settles in one tap', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response('{}', { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    const onDone = vi.fn().mockResolvedValue(undefined);
    render(<SettleSheet option={csp} onDone={onDone} onEdit={vi.fn()} onCancel={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: /Expired worthless/ }));
    fireEvent.click(screen.getByRole('button', { name: /^Settle$/ }));
    await waitFor(() => expect(onDone).toHaveBeenCalledOnce());
    expect(JSON.parse((fetchMock.mock.calls[0][1] as RequestInit).body as string).outcome).toBe('EXPIRED');
  });

  it('bought back reveals the price field and requires it', () => {
    render(<SettleSheet option={csp} onDone={vi.fn()} onEdit={vi.fn()} onCancel={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: /Bought back/ }));
    expect(screen.getByLabelText('Buyback / share')).toBeRequired();
  });

  it('assigned shows exactly what will be booked', () => {
    render(<SettleSheet option={csp} onDone={vi.fn()} onEdit={vi.fn()} onCancel={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: /Assigned/ }));
    expect(screen.getByText(/Books: BUY 200 TQQQ @ \$62\.00/)).toBeInTheDocument();
  });
});
```

Add to `PortfolioTab.test.tsx` (fixtures gain the two new callbacks as `vi.fn()`; new test):
```tsx
it('lists open options with countdown and premium collected', () => {
  const withOpt: Snapshot = {
    ...snap,
    options: [{
      id: 1, symbol: 'TQQQ', opt_type: 'PUT', strike: 62, expiration: new Date().toISOString().slice(0, 10),
      contracts: 2, premium: 0.74, fees: 0, opened_at: '2026-07-20', note: '',
      status: 'OPEN', closed_at: null, buyback_price: 0, close_fees: 0, assigned_trade_id: null,
    }],
  };
  render(<PortfolioTab snap={withOpt} onRefresh={vi.fn()} onEditTrade={vi.fn()} onMark={vi.fn()}
                       onSettleOption={vi.fn()} onEditOption={vi.fn()} />);
  expect(screen.getByText('Open Options')).toBeInTheDocument();
  expect(screen.getByText(/TQQQ \$62 PUT/)).toBeInTheDocument();
  // the countdown chip is its own <span>, so match its exact text, not "exp today"
  expect(screen.getByText('today')).toBeInTheDocument();
  expect(screen.getByText(/\$148\.00 collected/)).toBeInTheDocument();
});
```

- [ ] **Step 2: Run to verify failure**

```bash
npx vitest run src/components/__tests__/AddTradeSheet.test.tsx src/components/__tests__/SettleSheet.test.tsx src/components/__tests__/PortfolioTab.test.tsx
```
Expected: FAIL (no Option button, no SettleSheet module, no Open Options section) plus TS prop errors — the two new TabProps callbacks must be added everywhere PortfolioTab/LedgerTab are rendered in tests.

- [ ] **Step 3: Implement**

`app.css` additions:
```css
.segmented { display: flex; border: 1px solid var(--rule); border-radius: 8px; overflow: hidden; margin-bottom: 12px; }
.segmented button { flex: 1; padding: 10px; background: var(--parchment); border: none; font-family: var(--font-display); font-weight: 700; font-size: 14px; color: var(--ink-soft); }
.segmented button.active { background: var(--maroon); color: var(--parchment); }
.chip { display: inline-block; padding: 1px 8px; border-radius: 999px; border: 1px solid var(--rule); font-size: 11px; }
.chip.hot { border-color: var(--maroon); color: var(--maroon); font-weight: 700; }
.outcomes { display: flex; flex-direction: column; gap: 8px; margin: 12px 0; }
.outcomes button { text-align: left; padding: 12px; border: 1px solid var(--rule); border-radius: 8px; background: var(--parchment); font-family: var(--font-mono); font-size: 14px; color: var(--ink); }
.outcomes button.active { border-color: var(--maroon); box-shadow: inset 0 0 0 1px var(--maroon); }
.books-preview { text-align: center; color: var(--gold-label); font-size: 13px; margin: 8px 0; }
```

`AddTradeSheet.tsx` — restructure. Keep every existing stock field/behavior identical; add:
```tsx
// new imports
import { createOption, createTrade, deleteTrade, updateOption, updateTrade } from '../lib/api';
import type { OptionDraft, OptionPosition, OptionType, Side, Trade } from '../lib/types';
import { nextFriday } from '../lib/time';
```
New props: `option?: OptionPosition | null`. Mode state:
```tsx
const [mode, setMode] = useState<'stock' | 'option'>(option ? 'option' : 'stock');
const editing = Boolean(trade || option);
```
Segmented control at the top of the form (hidden while `editing`):
```tsx
{!editing && (
  <div className="segmented">
    <button type="button" className={mode === 'stock' ? 'active' : ''} onClick={() => setMode('stock')}>Stock</button>
    <button type="button" className={mode === 'option' ? 'active' : ''} onClick={() => setMode('option')}>Option</button>
  </div>
)}
```
Option-mode state (initialized from `option` when editing, else defaults):
```tsx
const [optType, setOptType] = useState<OptionType>(option?.opt_type ?? 'PUT');
const [strike, setStrike] = useState(option ? String(option.strike) : '');
const [expiration, setExpiration] = useState(option?.expiration ?? nextFriday());
const [contracts, setContracts] = useState(option ? String(option.contracts) : '1');
const [premium, setPremium] = useState(option ? String(option.premium) : '');
```
Option-mode fields (rendered when `mode === 'option'`, replacing the stock side/qty/price block; symbol, fees, date, note fields are shared — the date label reads "Date sold", the submit button reads `Sell to open` / `Save changes`):
```tsx
<div className="field">
  <label htmlFor="opt-type">Call / Put</label>
  <select id="opt-type" value={optType} onChange={(e) => setOptType(e.target.value as OptionType)}>
    <option value="PUT">Put</option>
    <option value="CALL">Call</option>
  </select>
</div>
<div className="field">
  <label htmlFor="strike">Strike</label>
  <input id="strike" type="number" inputMode="decimal" step="any" min="0" value={strike} onChange={(e) => setStrike(e.target.value)} required />
</div>
<div className="field">
  <label htmlFor="expiration">Expiration</label>
  <input id="expiration" type="date" value={expiration} onChange={(e) => setExpiration(e.target.value)} required />
</div>
<div className="field">
  <label htmlFor="contracts">Contracts</label>
  <input id="contracts" type="number" inputMode="numeric" step="1" min="1" value={contracts} onChange={(e) => setContracts(e.target.value)} required />
</div>
<div className="field">
  <label htmlFor="premium">Premium / share</label>
  <input id="premium" type="number" inputMode="decimal" step="any" min="0" value={premium} onChange={(e) => setPremium(e.target.value)} required />
</div>
```
Submit branch:
```tsx
if (mode === 'option') {
  const draft: OptionDraft = {
    symbol: symbol.trim().toUpperCase(), opt_type: optType, strike: Number(strike),
    expiration, contracts: Number(contracts), premium: Number(premium),
    fees: Number(fees) || 0, opened_at: date, note,
  };
  if (option) await updateOption(option.id, draft);
  else await createOption(draft);
} else {
  // existing stock create/update block unchanged
}
await onDone();
```
(Delete button stays stock-only here; option delete lives in SettleSheet.)

`SettleSheet.tsx`:
```tsx
import { useState } from 'react';
import type { FormEvent } from 'react';
import { deleteOption, settleOption } from '../lib/api';
import { premiumCollected } from '../lib/optionsMath';
import { formatMoney } from '../lib/format';
import type { OptionPosition, OptionStatus } from '../lib/types';

const today = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

export function SettleSheet({
  option,
  onDone,
  onEdit,
  onCancel,
}: {
  option: OptionPosition;
  onDone: () => Promise<void>;
  onEdit: () => void;
  onCancel: () => void;
}) {
  const [outcome, setOutcome] = useState<Exclude<OptionStatus, 'OPEN'> | null>(null);
  const [buyback, setBuyback] = useState('');
  const [closeFees, setCloseFees] = useState('0');
  const [date, setDate] = useState(today());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const bookSide = option.opt_type === 'PUT' ? 'BUY' : 'SELL';
  const bookQty = option.contracts * 100;

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!outcome) return;
    setBusy(true);
    setError('');
    try {
      await settleOption(option.id, {
        outcome,
        closed_at: date,
        ...(outcome === 'BOUGHT_BACK'
          ? { buyback_price: Number(buyback), close_fees: Number(closeFees) || 0 }
          : {}),
      });
      await onDone();
    } catch {
      setError('Could not settle — check your connection.');
      setBusy(false);
    }
  }

  async function remove() {
    if (!window.confirm(`Delete this open ${option.symbol} option?`)) return;
    setBusy(true);
    try {
      await deleteOption(option.id);
      await onDone();
    } catch {
      setError('Could not delete — check your connection.');
      setBusy(false);
    }
  }

  return (
    <div className="sheet-backdrop" onClick={onCancel}>
      <form className="sheet" onClick={(e) => e.stopPropagation()} onSubmit={submit}>
        <h2>
          {option.symbol} ${option.strike} {option.opt_type} — settle
        </h2>
        <div className="row-sub" style={{ marginBottom: 6 }}>
          {option.contracts}x · exp {option.expiration} · {formatMoney(premiumCollected(option))} collected
        </div>
        <div className="outcomes">
          <button type="button" className={outcome === 'EXPIRED' ? 'active' : ''} onClick={() => setOutcome('EXPIRED')}>
            Expired worthless — keep it all
          </button>
          <button type="button" className={outcome === 'BOUGHT_BACK' ? 'active' : ''} onClick={() => setOutcome('BOUGHT_BACK')}>
            Bought back
          </button>
          <button type="button" className={outcome === 'ASSIGNED' ? 'active' : ''} onClick={() => setOutcome('ASSIGNED')}>
            Assigned
          </button>
        </div>
        {outcome === 'BOUGHT_BACK' && (
          <>
            <div className="field">
              <label htmlFor="buyback">Buyback / share</label>
              <input id="buyback" type="number" inputMode="decimal" step="any" min="0" autoFocus value={buyback} onChange={(e) => setBuyback(e.target.value)} required />
            </div>
            <div className="field">
              <label htmlFor="close-fees">Fees</label>
              <input id="close-fees" type="number" inputMode="decimal" step="any" min="0" value={closeFees} onChange={(e) => setCloseFees(e.target.value)} />
            </div>
          </>
        )}
        {outcome === 'ASSIGNED' && (
          <div className="books-preview">
            Books: {bookSide} {bookQty} {option.symbol} @ {formatMoney(option.strike)}
          </div>
        )}
        <div className="field">
          <label htmlFor="settle-date">Settle date</label>
          <input id="settle-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} required />
        </div>
        <button className="btn" disabled={busy || !outcome || (outcome === 'BOUGHT_BACK' && !buyback)}>
          {busy ? 'Settling…' : 'Settle'}
        </button>
        <div className="btn-row">
          <button type="button" className="btn btn-ghost" onClick={onCancel} disabled={busy}>Cancel</button>
          <button type="button" className="btn btn-ghost" onClick={onEdit} disabled={busy}>Edit</button>
          <button type="button" className="btn btn-ghost" onClick={remove} disabled={busy}>Delete</button>
        </div>
        {error && <div style={{ color: 'var(--pl-red)', marginTop: 8, fontSize: 13 }}>{error}</div>}
      </form>
    </div>
  );
}
```

`PortfolioTab.tsx`: extend `TabProps` with `onSettleOption` / `onEditOption`; after the Positions block add:
```tsx
{openOptions.length > 0 && (
  <>
    <h2 className="section-title">Open Options</h2>
    {openOptions.map((o) => (
      <button key={o.id} className="row" style={rowButtonStyle} onClick={() => onSettleOption(o)}>
        <div className="row-main">
          <div className="row-sym">
            {o.symbol} ${o.strike} {o.opt_type}
          </div>
          <div className="row-sub">
            {o.contracts}x · exp{' '}
            <span className={`chip${daysUntil(o.expiration) <= 1 ? ' hot' : ''}`}>{expiryLabel(o.expiration)}</span>
            {' '}· {formatMoney(premiumCollected(o))} collected
          </div>
        </div>
      </button>
    ))}
  </>
)}
```
with `const openOptions = snap.options.filter((o) => o.status === 'OPEN');`, imports for `daysUntil, expiryLabel`, `premiumCollected`, and `rowButtonStyle` extracted as a shared const for the existing position rows' inline style (same object, defined once at module top — do not duplicate the style literal). The test asserts `exp today` — the sub renders `exp` + chip text, so include the literal space as shown.

`App.tsx`: sheet union per Interfaces; `tabProps` gains
```tsx
onSettleOption: (option: OptionPosition) => setSheet({ kind: 'settle', option }),
onEditOption: (option: OptionPosition) => setSheet({ kind: 'optionEdit', option }),
```
and render branches:
```tsx
{sheet?.kind === 'optionEdit' && (
  <AddTradeSheet trade={null} option={sheet.option} onDone={async () => { setSheet(null); await refresh(); }} onCancel={() => setSheet(null)} />
)}
{sheet?.kind === 'settle' && (
  <SettleSheet option={sheet.option} onDone={async () => { setSheet(null); await refresh(); }} onEdit={() => setSheet({ kind: 'optionEdit', option: sheet.option })} onCancel={() => setSheet(null)} />
)}
```
`LedgerTab.test.tsx` renders gain `onSettleOption={vi.fn()} onEditOption={vi.fn()}`.

- [ ] **Step 4: Full suite + build**

```bash
npx vitest run && npm run build
```
Expected: 39 passed (33 + 2 AddTradeSheet + 3 SettleSheet + 1 PortfolioTab). Build clean.

- [ ] **Step 5: Visual check**

Backend dev server + seed one open option via curl (CSP TQQQ $62 PUT ×2 @ 0.74, expiring this Friday); `npm run dev`; Browser pane at mobile size: Open Options section shows with countdown chip; tapping opens the Settle sheet; the three outcomes behave (Bought back reveals price; Assigned shows "Books: BUY 200 TQQQ @ $62.00"). Screenshot. Kill servers, delete `backend/curia.db`.

- [ ] **Step 6: Commit**

```bash
cd ~/curia-app && git add frontend/src && git commit -m "feat(options-ui): add-sheet option mode, open options section, settle sheet"
```

---

### Task 4: Ledger — Premium Record + seller stats

**Files:**
- Modify: `frontend/src/components/LedgerTab.tsx`
- Test: modify `frontend/src/components/__tests__/LedgerTab.test.tsx` (+2 tests)

**Interfaces:**
- Consumes: `computeOptionStats`, `optionRealizedPl` (Task 2), snapshot options.
- Produces: nothing new — final consumer.

- [ ] **Step 1: Failing tests** (append; the shared `snap` fixture gains a settled + an open option)

```tsx
const settledPut: OptionPosition = {
  id: 11, symbol: 'TQQQ', opt_type: 'PUT', strike: 62, expiration: '2026-07-18',
  contracts: 2, premium: 0.74, fees: 1.3, opened_at: '2026-07-14', note: '',
  status: 'EXPIRED', closed_at: '2026-07-18', buyback_price: 0, close_fees: 0, assigned_trade_id: null,
};

it('shows the premium record with outcome tag and P/L', () => {
  render(<LedgerTab snap={{ ...snap, options: [settledPut] }} {...cbs} />);
  expect(screen.getByText('Premium Record')).toBeInTheDocument();
  expect(screen.getByText('EXPIRED')).toBeInTheDocument();
  expect(screen.getAllByText(/\+\$146\.70/).length).toBeGreaterThan(0);
  expect(screen.getByText('Premium kept')).toBeInTheDocument();
});

it('open options do not appear in the premium record', () => {
  render(<LedgerTab snap={{ ...snap, options: [{ ...settledPut, id: 12, status: 'OPEN', closed_at: null }] }} {...cbs} />);
  expect(screen.queryByText('Premium Record')).not.toBeInTheDocument();
});
```
(`cbs` = the four shared callback props object `{ onRefresh: vi.fn(), onEditTrade: vi.fn(), onMark: vi.fn(), onSettleOption: vi.fn(), onEditOption: vi.fn() }` — introduce it and reuse in the file's older tests.)

- [ ] **Step 2: Verify failure** — `npx vitest run src/components/__tests__/LedgerTab.test.tsx` → FAIL.

- [ ] **Step 3: Implement** — in `LedgerTab.tsx` add after the closed-trades stats block ("The record") and before the All entries link:

```tsx
{settledOptions.length > 0 && (
  <>
    <h2 className="section-title">Premium Record</h2>
    {settledOptions.map((o) => (
      <div className="row" key={`opt-${o.id}`}>
        <div className="row-main">
          <div className="row-sym">
            {o.symbol} ${o.strike} {o.opt_type}{' '}
            <span className="chip">{o.status.replace('_', ' ')}</span>
          </div>
          <div className="row-sub">
            {o.contracts}x · {o.opened_at} → {o.closed_at}
            {o.status === 'ASSIGNED' ? ' · shares booked' : ''}
          </div>
        </div>
        <div className="row-right">
          <div style={{ color: plColor(optionRealizedPl(o) ?? 0) }}>
            {formatSignedMoney(optionRealizedPl(o) ?? 0)}
          </div>
        </div>
      </div>
    ))}
    <div className="stats-grid">
      <div className="stat"><div className="label">Premium kept</div><div className="value" style={{ color: plColor(oStats.totalKept) }}>{formatSignedMoney(oStats.totalKept)}</div></div>
      <div className="stat"><div className="label">Win rate</div><div className="value">{formatPct(oStats.winRate)}</div></div>
      <div className="stat"><div className="label">Outcomes</div><div className="value">{oStats.expiredCount}E · {oStats.boughtBackCount}B · {oStats.assignedCount}A</div></div>
      <div className="stat"><div className="label">Avg take</div><div className="value">{formatSignedMoney(oStats.avgTake)}</div></div>
    </div>
  </>
)}
```
with
```tsx
const settledOptions = [...snap.options]
  .filter((o) => o.status !== 'OPEN')
  .sort((a, b) => (b.closed_at ?? '').localeCompare(a.closed_at ?? '') || b.id - a.id);
const oStats = computeOptionStats(snap.options);
```
and imports `computeOptionStats, optionRealizedPl` from `../lib/optionsMath`.

- [ ] **Step 4: Full suite + build** — `npx vitest run && npm run build` → 41 passed, build clean.

- [ ] **Step 5: Commit**

```bash
cd ~/curia-app && git add frontend/src && git commit -m "feat(ledger): premium record + weekly-seller stats"
```

---

### Task 5: The ceremony — print → fold → envelope → ship → stamp-in + slow roll

**Files:**
- Create: `frontend/src/components/TradeCeremony.tsx`, `frontend/src/styles/ceremony.css`
- Modify: `frontend/src/App.tsx` (ceremony wiring + `landing`/`justAdded` state), `frontend/src/components/AddTradeSheet.tsx` (onDone carries ticket data), `frontend/src/components/PortfolioTab.tsx` (stamp-in class on the just-added row), `frontend/src/styles/curia-tokens.css` (roll-slow override), `frontend/src/main.tsx` (import ceremony.css)
- Test: create `frontend/src/components/__tests__/TradeCeremony.test.tsx`

**Interfaces:**
- Consumes: everything prior.
- Produces / changes (binding):
  - `export interface TicketData { no: number; title: string; symbol: string; lines: string[] }` (in `TradeCeremony.tsx`; `symbol` is the traded/underlying symbol, used by App to target the stamp-in row)
  - `TradeCeremony` props: `{ ticket: TicketData; onDone: () => void }`; root div carries `data-stage` = `print | fold | envelope | ship`; any click anywhere calls `onDone` immediately (once).
  - `AddTradeSheet.onDone` becomes `(ticket: TicketData) => Promise<void>` — built from the server response (`no` = created/updated id; title `TRADE TICKET` for stocks, `OPTION TICKET` for options; lines = human strings like `BUY 400 TQQQ`, `@ $72.00 · Jul 20 2026` or `SELL TO OPEN 2x`, `TQQQ $62 PUT · exp Jul 31`, `$148.00 collected`).
  - `TabProps` gains OPTIONAL `justAdded?: { kind: 'trade' | 'option'; id: number; symbol: string } | null` (optional so existing test renders compile unchanged; the matching row gets className `stamp-in` appended — options match by `id`, stock position rows by `symbol`).
  - SettleSheet keeps its plain `onDone` (settling is not a new-trade ceremony).

- [ ] **Step 1: Failing tests**

`frontend/src/components/__tests__/TradeCeremony.test.tsx`:
```tsx
import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TradeCeremony } from '../TradeCeremony';
import type { TicketData } from '../TradeCeremony';

const ticket: TicketData = { no: 47, title: 'TRADE TICKET', symbol: 'TQQQ', lines: ['BUY 400 TQQQ', '@ $72.00'] };

describe('TradeCeremony', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('typesets the ticket and advances through the stages', () => {
    const onDone = vi.fn();
    const { container } = render(<TradeCeremony ticket={ticket} onDone={onDone} />);
    expect(screen.getByText(/TRADE TICKET Nº 47/)).toBeInTheDocument();
    expect(screen.getByText('BUY 400 TQQQ')).toBeInTheDocument();
    const root = container.querySelector('[data-stage]')!;
    expect(root.getAttribute('data-stage')).toBe('print');
    act(() => vi.advanceTimersByTime(1700));
    expect(root.getAttribute('data-stage')).toBe('fold');
    act(() => vi.advanceTimersByTime(950));
    expect(root.getAttribute('data-stage')).toBe('envelope');
    act(() => vi.advanceTimersByTime(850));
    expect(root.getAttribute('data-stage')).toBe('ship');
    expect(onDone).not.toHaveBeenCalled();
    act(() => vi.advanceTimersByTime(1000));
    expect(onDone).toHaveBeenCalledOnce();
  });

  it('a tap anywhere skips straight to done, exactly once', () => {
    const onDone = vi.fn();
    const { container } = render(<TradeCeremony ticket={ticket} onDone={onDone} />);
    fireEvent.click(container.querySelector('[data-stage]')!);
    fireEvent.click(container.querySelector('[data-stage]')!);
    expect(onDone).toHaveBeenCalledOnce();
    act(() => vi.advanceTimersByTime(6000));
    expect(onDone).toHaveBeenCalledOnce(); // timers cleaned up, no double fire
  });
});
```

- [ ] **Step 2: Verify failure** — `npx vitest run src/components/__tests__/TradeCeremony.test.tsx` → FAIL (no module).

- [ ] **Step 3: Implement the overlay**

`frontend/src/components/TradeCeremony.tsx`:
```tsx
import { useEffect, useRef, useState } from 'react';

export interface TicketData {
  no: number;
  title: string;
  symbol: string;
  lines: string[];
}

type Stage = 'print' | 'fold' | 'envelope' | 'ship';

const STAGE_MS: [Stage, number][] = [
  ['print', 1700], // 1.2s rise + 0.4s seal + breath
  ['fold', 950],
  ['envelope', 850],
  ['ship', 1000],
];

export function TradeCeremony({ ticket, onDone }: { ticket: TicketData; onDone: () => void }) {
  const [stage, setStage] = useState<Stage>('print');
  const done = useRef(false);
  const timers = useRef<number[]>([]);

  function finish() {
    if (done.current) return;
    done.current = true;
    timers.current.forEach(clearTimeout);
    onDone();
  }

  useEffect(() => {
    let at = 0;
    for (let i = 1; i < STAGE_MS.length; i++) {
      at += STAGE_MS[i - 1][1];
      const next = STAGE_MS[i][0];
      timers.current.push(window.setTimeout(() => setStage(next), at));
    }
    at += STAGE_MS[STAGE_MS.length - 1][1];
    timers.current.push(window.setTimeout(finish, at));
    return () => timers.current.forEach(clearTimeout);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="ceremony" data-stage={stage} onClick={finish}>
      <div className="ceremony-scene">
        <div className="ticket">
          <div className="ticket-head">CURIA · {ticket.title} Nº {ticket.no}</div>
          {ticket.lines.map((l) => (
            <div className="ticket-line" key={l}>{l}</div>
          ))}
          <div className="ticket-seal">C</div>
        </div>
        <div className="envelope">
          <div className="envelope-flap" />
          <div className="envelope-body" />
          <div className="envelope-seal">C</div>
        </div>
      </div>
    </div>
  );
}
```

`frontend/src/styles/ceremony.css` (imported from `main.tsx` after the other styles):
```css
.ceremony { position: fixed; inset: 0; z-index: 40; background: rgba(31, 27, 18, 0.55); display: flex; align-items: center; justify-content: center; perspective: 900px; }
.ceremony-scene { position: relative; width: 290px; }

/* ---- the ticket ---- */
.ticket { position: relative; background: var(--parchment-card); border-radius: 4px; padding: 22px 20px 30px; box-shadow: 0 12px 30px rgba(0,0,0,.35); border-top: 2px dashed var(--rule); border-bottom: 2px dashed var(--rule); transform-origin: 50% 0%; }
.ticket-head { font-family: var(--font-display); font-weight: 800; font-size: 15px; letter-spacing: .06em; text-align: center; border-bottom: 1px solid var(--rule); padding-bottom: 8px; margin-bottom: 10px; }
.ticket-line { font-family: var(--font-mono); font-size: 14px; text-align: center; padding: 3px 0; }
.ticket-seal { position: absolute; right: 14px; bottom: -18px; width: 44px; height: 44px; border-radius: 50%; background: var(--maroon); color: var(--parchment); font-family: var(--font-display); font-weight: 800; font-size: 22px; display: flex; align-items: center; justify-content: center; box-shadow: 0 2px 6px rgba(0,0,0,.35); opacity: 0; }

/* ---- the envelope ---- */
.envelope { position: absolute; inset: 0; margin: auto; width: 290px; height: 170px; opacity: 0; }
.envelope-body { position: absolute; inset: 0; background: var(--parchment); border: 1px solid var(--rule); border-radius: 6px; box-shadow: 0 14px 34px rgba(0,0,0,.4); }
.envelope-body::after { content: ''; position: absolute; inset: 0; background: linear-gradient(to top left, transparent 49%, var(--rule) 49.5%, transparent 50%), linear-gradient(to top right, transparent 49%, var(--rule) 49.5%, transparent 50%); }
.envelope-flap { position: absolute; left: 0; right: 0; top: 0; height: 0; border-left: 145px solid transparent; border-right: 145px solid transparent; border-top: 88px solid var(--parchment-card); filter: drop-shadow(0 2px 2px rgba(0,0,0,.15)); transform-origin: 50% 0%; transform: rotateX(180deg); }
.envelope-seal { position: absolute; left: 50%; top: 74px; transform: translateX(-50%) scale(0); width: 40px; height: 40px; border-radius: 50%; background: var(--maroon); color: var(--parchment); font-family: var(--font-display); font-weight: 800; font-size: 20px; display: flex; align-items: center; justify-content: center; }

/* ---- stage: print ---- */
.ceremony[data-stage='print'] .ticket { animation: ticket-rise 1.2s var(--roll-ease) both; }
.ceremony[data-stage='print'] .ticket-seal { animation: seal-stamp 0.4s 1.2s ease-out both; }
@keyframes ticket-rise { from { transform: translateY(110vh); } to { transform: translateY(0); } }
@keyframes seal-stamp { 0% { opacity: 0; transform: scale(1.8); } 60% { opacity: 1; transform: scale(0.92); } 100% { opacity: 1; transform: scale(1); } }

/* ---- stage: fold ---- */
.ceremony[data-stage='fold'] .ticket { animation: ticket-fold 0.9s ease-in-out both; }
.ceremony[data-stage='fold'] .ticket-seal { opacity: 1; }
@keyframes ticket-fold { 0% { transform: rotateX(0) scaleY(1); } 55% { transform: rotateX(-72deg) scaleY(1); } 100% { transform: rotateX(-88deg) scaleY(0.42); opacity: 0.9; } }

/* ---- stage: envelope ---- */
.ceremony[data-stage='envelope'] .ticket { transform: rotateX(-88deg) scaleY(0.42); opacity: 0; transition: opacity .25s; }
.ceremony[data-stage='envelope'] .envelope { animation: env-appear 0.35s ease-out both; }
.ceremony[data-stage='envelope'] .envelope-flap { animation: flap-close 0.45s 0.25s ease-in both; }
.ceremony[data-stage='envelope'] .envelope-seal { animation: env-seal 0.3s 0.62s ease-out both; }
@keyframes env-appear { from { opacity: 0; transform: scale(0.7); } to { opacity: 1; transform: scale(1); } }
@keyframes flap-close { from { transform: rotateX(180deg); } to { transform: rotateX(0deg); } }
@keyframes env-seal { from { transform: translateX(-50%) scale(0); } to { transform: translateX(-50%) scale(1); } }

/* ---- stage: ship ---- */
.ceremony[data-stage='ship'] .ticket { opacity: 0; }
.ceremony[data-stage='ship'] .envelope { opacity: 1; }
.ceremony[data-stage='ship'] .envelope-flap { transform: rotateX(0deg); }
.ceremony[data-stage='ship'] .envelope-seal { transform: translateX(-50%) scale(1); }
.ceremony[data-stage='ship'] .envelope { animation: env-ship 0.9s ease-in both; }
.ceremony[data-stage='ship'] { animation: dim-out 0.9s ease-in both; }
@keyframes env-ship { 0% { transform: translateY(0) rotate(0); } 25% { transform: translateY(10px) rotate(-2deg); } 100% { transform: translateY(-120vh) rotate(8deg) scale(0.85); } }
@keyframes dim-out { from { background: rgba(31,27,18,.55); } to { background: rgba(31,27,18,0); } }

/* ---- stamp-in on the list + slow roll ---- */
.stamp-in { animation: stamp-in 0.5s var(--roll-ease) both; }
@keyframes stamp-in { 0% { opacity: 0; transform: scale(1.06); filter: brightness(0.55); } 60% { opacity: 1; transform: scale(0.99); } 100% { opacity: 1; transform: scale(1); filter: none; } }
```

Append to `frontend/src/styles/curia-tokens.css`:
```css
/* Ceremony landing: numbers wind slowly to their new totals for a few seconds. */
.roll-slow { --roll-hero: 2.2s; --roll-detail: 2.6s; }
```

Add to `frontend/src/main.tsx` after the existing style imports:
```ts
import './styles/ceremony.css';
```

- [ ] **Step 4: Wire it up**

`AddTradeSheet.tsx`: `onDone` prop type becomes `(ticket: TicketData) => Promise<void>`; submit builds the ticket from the server response:
```tsx
const fmtDate = (iso: string) => {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
};
// stock branch: const saved = trade ? await updateTrade({...}) : await createTrade(body);
// await onDone({ no: saved.id, title: 'TRADE TICKET', lines: [
//   `${body.side} ${body.qty} ${body.symbol}`, `@ ${formatMoney(body.price)} · ${fmtDate(body.executed_at)}` ] });
// option branch: const saved = option ? await updateOption(option.id, draft) : await createOption(draft);
// await onDone({ no: saved.id, title: 'OPTION TICKET', lines: [
//   `SELL TO OPEN ${draft.contracts}x`, `${draft.symbol} $${draft.strike} ${draft.opt_type} · exp ${fmtDate(draft.expiration)}`,
//   `${formatMoney(draft.premium * 100 * draft.contracts)} collected` ] });
```
(Real code, not comments, in the implementation — shown condensed here; both branches capture the server response into `saved` and pass a full TicketData.)

`App.tsx`:
```tsx
const [ceremony, setCeremony] = useState<TicketData | null>(null);
const [justAdded, setJustAdded] = useState<{ kind: 'trade' | 'option'; id: number } | null>(null);
const [landing, setLanding] = useState(false);
```
- AddTradeSheet render: `onDone={async (ticket) => { setSheet(null); setJustAdded({ kind: ticket.title === 'OPTION TICKET' ? 'option' : 'trade', id: ticket.no }); setCeremony(ticket); }}`
- Ceremony render (after the sheets):
```tsx
{ceremony && (
  <TradeCeremony
    ticket={ceremony}
    onDone={() => {
      setCeremony(null);
      setLanding(true);
      void refresh().then(() => {
        window.setTimeout(() => { setLanding(false); setJustAdded(null); }, 3000);
      });
    }}
  />
)}
```
- Shell div: `className={landing ? 'shell roll-slow' : 'shell'}`; `tabProps` gains `justAdded`.
- `TabProps` in PortfolioTab gains `justAdded: { kind: 'trade' | 'option'; id: number } | null`; position rows can't know trade ids (positions are derived), so stamp-in applies to: the Open Options row whose `o.id === justAdded.id && justAdded.kind === 'option'`, and for stocks the position row whose `symbol` matches the just-added trade — App resolves the symbol: store `justAdded` as `{ kind, id, symbol }` (AddTradeSheet includes `symbol` in TicketData? No — extend the onDone call in App: parse from ticket.lines[0]? Fragile). **Decision:** extend `TicketData` with `symbol: string` (set by AddTradeSheet from the submitted body) and `justAdded = { kind, id, symbol: ticket.symbol }`; Portfolio stamps the position row with matching `symbol` (stocks) or the option row with matching `id` (options). LedgerTab ignores `justAdded`.

- [ ] **Step 5: Full suite + build**

```bash
npx vitest run && npm run build
```
Expected: 43 passed (41 + 2 ceremony). Build clean. (AddTradeSheet tests updated: `onDone` now receives a TicketData — assertions change from `toHaveBeenCalledOnce()` to also checking `expect(onDone.mock.calls[0][0]).toMatchObject({ title: 'OPTION TICKET' })` where relevant.)

- [ ] **Step 6: Visual check — the whole ceremony**

Dev servers + seeded data; in the Browser pane (mobile size): add a stock trade → watch print/seal/fold/envelope/ship → row stamps in and the odometer winds slowly (~2.2s) to the new book value; add an option → OPTION TICKET variant; tap mid-ceremony → skips cleanly. Screenshot at the print stage (the most photogenic) for the report. Kill servers, remove `backend/curia.db`.

- [ ] **Step 7: Commit**

```bash
cd ~/curia-app && git add frontend/src && git commit -m "feat(ceremony): print-fold-envelope-ship overlay, stamp-in, slow landing roll"
```

---

### Task 6: Merge, deploy, phone verification

**Files:** none new (README touch-up).

- [ ] **Step 1: Full verification, merge to main**

```bash
cd ~/curia-app/backend && source .venv/bin/activate && python -m pytest -q   # 31 passed
cd ~/curia-app/frontend && export PATH="$HOME/.nvm/versions/node/v20.20.2/bin:$PATH" && npx vitest run && npm run build  # 43 passed
cd ~/curia-app && git checkout main && git merge dev --no-edit && git branch -d dev
```
Re-run both suites on main (same counts).

- [ ] **Step 2: Deploy + push**

```bash
cd ~/curia-app && git push origin main && railway up --service curia --detach
```
Poll `https://curia-production-5f0c.up.railway.app/api/health` until `{"ok":true}` and `GET /api/options` (with key) returns 200 `[]`-or-data. Prod smoke with the real passcode: create a throwaway option → settle ASSIGNED → confirm the stock trade appeared and `assigned_trade_id` links → export shows both → delete the throwaway trade and option rows via API (`DELETE /api/trades/{id}`, `DELETE /api/options/{id}` is 409-safe only for OPEN — settled test option is removed via the versioned-import wipe trick ONLY if the DB is otherwise empty; if Andrew already has real data, instead create the throwaway on a nonsense symbol like ZZTEST, and clean up: delete the booked trade by id, and leave... NO — settled options can't be deleted. **Therefore: prod smoke uses EXPIRED (books nothing), not ASSIGNED** — create ZZTEST option, settle EXPIRED, then the settled row CANNOT be deleted; so do NOT settle on prod either. Final prod smoke: create ZZTEST option (OPEN), confirm in GET, `DELETE /api/options/{id}` (allowed while OPEN), confirm gone. Assignment atomicity is already covered by backend tests + Task 5's local visual check; do not manufacture undeletable rows in Andrew's real database.)

- [ ] **Step 3: Update README + memory, final commit**

README feature list gains options + ceremony one-liners; memory note (`curia-deployment.md`) gains "options tracking + trade ceremony shipped <date>". Commit `docs: options + ceremony shipped`, push.

- [ ] **Step 4: Phone checklist (with Andrew)**

- Reopen the installed app (update applies) → add a real option → full ceremony plays, slow odometer wind on landing.
- Open Options section shows the countdown; settle flow when Friday comes (his real outcome).
- Ledger Premium Record appears after the first settlement.
- Export backup now contains options.
