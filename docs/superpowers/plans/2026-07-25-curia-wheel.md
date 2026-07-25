# Curia — The Wheel — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development for Tasks 1–2. Tasks 3–5 are controller-executed visual work (browser-iterated) — do not dispatch them to subagents.

**Goal:** Wheel campaigns: manual open/close with ceremonies, hero-tab cards with an engraved cycle dial, true-basis/premium math, archive — per `docs/superpowers/specs/2026-07-25-curia-wheel-design.md`.

**Architecture:** tiny `wheels` table + CRUD; all math client-side in `lib/wheelMath.ts`; hero layout + dial + ceremonies in components, iterated visually.

## Global Constraints

- Branch `dev` off `main`. Node 20 PATH export before every npm command; backend venv Python 3.9 (`typing.Optional`).
- Wheel membership: symbol match AND `wheel.opened_at ≤ record date` AND (wheel closed → `record date ≤ closed_at`); record date = `executed_at` for trades, `opened_at` for options.
- Per-symbol wheel numbering server-side; one OPEN wheel per symbol (409 on second).
- Money formulas exactly as the spec's Membership + math section; stage names exactly `SELL_PUT | ASSIGNED | SELLING_CALLS | CALLED_AWAY | COMPLETED`.
- Backups gain optional `wheels` (no id remap needed); pre-wheels backups import clean; import return dict gains `"wheels": n`.
- No reduced-motion anywhere. Ceremonies tap-skip. Commit per task.

---

### Task 1: Backend — wheels table + endpoints + backup rows (TDD)

**Files:**
- Modify: `backend/app/models.py`, `backend/app/routes.py`
- Test: create `backend/tests/test_wheels.py`; extend `backend/tests/test_export_import.py`

**Interfaces (binding for Task 2):**
- `WheelOut = {id, symbol, no, opened_at, closed_at}`
- `GET /api/wheels` ordered (`symbol`,`no`) · `POST /api/wheels` `{symbol, opened_at?}` → 201 (defaults today; 409 if symbol has an open wheel) · `POST /api/wheels/{id}/close` `{closed_at?}` → 404/409 · `DELETE /api/wheels/{id}` → 204
- Export: `"wheels": [WheelOut]` by id; ImportBody gains `wheels: list[dict] = []`, validated `WheelRow` (same fields as WheelOut minus id, `no ≥ 1`, closed_at optional), deleted+inserted with the other tables, count in the return dict — and update the existing import-count assertions in test_export_import.py to include `"wheels": 0`.

- [ ] **Step 1: Failing tests** (`git checkout -b dev` first)

`backend/tests/test_wheels.py`:
```python
from tests.conftest import HEADERS


def _open(client, symbol="TQQQ", opened_at="2026-07-06"):
    r = client.post("/api/wheels", json={"symbol": symbol, "opened_at": opened_at}, headers=HEADERS)
    assert r.status_code == 201
    return r.json()


def test_open_assigns_per_symbol_sequence(client):
    w1 = _open(client)
    assert (w1["symbol"], w1["no"], w1["closed_at"]) == ("TQQQ", 1, None)
    client.post(f"/api/wheels/{w1['id']}/close", json={"closed_at": "2026-07-20"}, headers=HEADERS)
    w2 = _open(client, opened_at="2026-07-21")
    assert w2["no"] == 2
    other = _open(client, symbol="nvda")
    assert (other["symbol"], other["no"]) == ("NVDA", 1)  # upper-cased, own sequence


def test_second_open_wheel_same_symbol_409(client):
    _open(client)
    r = client.post("/api/wheels", json={"symbol": "TQQQ"}, headers=HEADERS)
    assert r.status_code == 409


def test_close_and_double_close(client):
    w = _open(client)
    r = client.post(f"/api/wheels/{w['id']}/close", json={"closed_at": "2026-07-20"}, headers=HEADERS)
    assert r.json()["closed_at"] == "2026-07-20"
    assert client.post(f"/api/wheels/{w['id']}/close", json={}, headers=HEADERS).status_code == 409
    assert client.post("/api/wheels/999/close", json={}, headers=HEADERS).status_code == 404


def test_delete_open_or_closed(client):
    w = _open(client)
    assert client.delete(f"/api/wheels/{w['id']}", headers=HEADERS).status_code == 204
    assert client.get("/api/wheels", headers=HEADERS).json() == []


def test_close_defaults_today(client):
    w = _open(client)
    closed = client.post(f"/api/wheels/{w['id']}/close", json={}, headers=HEADERS).json()
    assert closed["closed_at"] is not None
```

Append to `backend/tests/test_export_import.py`:
```python
def test_export_import_round_trip_with_wheels(client):
    w = client.post("/api/wheels", json={"symbol": "TQQQ", "opened_at": "2026-07-06"}, headers=HEADERS).json()
    client.post(f"/api/wheels/{w['id']}/close", json={"closed_at": "2026-07-20"}, headers=HEADERS)
    backup = client.get("/api/export", headers=HEADERS).json()
    assert len(backup["wheels"]) == 1
    client.post("/api/import", json={"confirm": True, "version": 1}, headers=HEADERS)
    result = client.post("/api/import", json={"confirm": True, **backup}, headers=HEADERS)
    assert result.json()["wheels"] == 1
    restored = client.get("/api/wheels", headers=HEADERS).json()[0]
    assert (restored["symbol"], restored["no"], restored["closed_at"]) == ("TQQQ", 1, "2026-07-20")


def test_pre_wheels_backup_still_imports(client):
    body = {"confirm": True, "version": 1, "trades": [], "marks": [], "options": []}
    assert client.post("/api/import", json=body, headers=HEADERS).status_code == 200
    assert client.get("/api/wheels", headers=HEADERS).json() == []
```

- [ ] **Step 2: verify failure** — `python -m pytest tests/test_wheels.py -q` → 404/405 errors.

- [ ] **Step 3: Implement**

`models.py` append:
```python
class Wheel(Base):
    __tablename__ = "wheels"
    id: Mapped[int] = mapped_column(primary_key=True)
    symbol: Mapped[str]
    no: Mapped[int]
    opened_at: Mapped[str]  # YYYY-MM-DD
    closed_at: Mapped[Optional[str]] = mapped_column(default=None)
    created_at: Mapped[str] = mapped_column(default=utcnow)
    updated_at: Mapped[str] = mapped_column(default=utcnow)
```

`routes.py` (import `Wheel`; follow the file's existing style exactly):
```python
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


def _wheel_out(w: Wheel) -> dict:
    return {"id": w.id, "symbol": w.symbol, "no": w.no,
            "opened_at": w.opened_at, "closed_at": w.closed_at}


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
        w = Wheel(symbol=sym, no=len(existing) + 1,
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
```
Weave export (`"wheels"` by id) + import (validate `WheelRow` in the pre-delete try — `no` comes from the backup verbatim; delete Wheel alongside the others; insert; add count) exactly like options were woven in.

- [ ] **Step 4:** `python -m pytest -q` → 40 passed (33 + 5 wheels + 2 export; existing count-dict assertions updated).
- [ ] **Step 5:** `git add backend && git commit -m "feat(backend): wheels table, open/close/delete, backup rows, test-first"`

---

### Task 2: wheelMath + api client + types (TDD)

**Files:**
- Create: `frontend/src/lib/wheelMath.ts`, `frontend/src/lib/__tests__/wheelMath.test.ts`
- Modify: `frontend/src/lib/types.ts`, `frontend/src/lib/api.ts` (+ Snapshot fixtures across existing tests gain `wheels: []`; cache key → `curia-cache-v3`)

**Interfaces (binding for Tasks 3–4):**
- `types.ts`: `Wheel { id, symbol, no, opened_at, closed_at: string | null }`; `WheelStage = 'SELL_PUT' | 'ASSIGNED' | 'SELLING_CALLS' | 'CALLED_AWAY' | 'COMPLETED'`; `WheelSummary { wheel: Wheel; stage: WheelStage; sharesHeld: number; rawBasis: number | null; premiumBanked: number; trueBasis: number | null; closeToday: number; markMissing: boolean; callsSold: number; weeks: number }`
- `wheelMath.ts`: `memberTrades(w, trades)`, `memberOptions(w, options)`, `summarizeWheel(w, trades, options, marks): WheelSummary` (formulas + stage rules verbatim from the spec; weeks = `max(1, ceil((today − opened_at)/7d))` local; for a COMPLETED wheel `closeToday` is the final total: realized member share P/L + premiumBanked).
- `api.ts`: Snapshot gains `wheels: Wheel[]` (fetch in the same Promise.all; cache `curia-cache-v3`); `openWheel(symbol: string, opened_at?: string)`, `closeWheel(id: number, closed_at?: string)`, `deleteWheel(id: number)`.
- Fixture sweep: every `Snapshot` literal in existing tests gains `wheels: []` (TypeScript enforces); api.test cache-key string bumps to v3.

- [ ] **Step 1: Failing tests** — `wheelMath.test.ts` with fake timers pinned (Sat 2026-07-25): membership window in/before/after + closed cap; rawBasis excludes fees and honors FIFO within the window; premiumBanked settled+open mix; trueBasis null when flat; closeToday with mark, with missing mark (`markMissing: true`, share leg at rawBasis); the five stages (craft fixtures per spec rules); callsSold counts CALLs only; weeks ≥ 1; completed-wheel final total = member closed-trade P/L + premiums. Write exact `expect` values computed by hand in comments.
- [ ] **Step 2:** verify failure.
- [ ] **Step 3:** implement (pure functions; reuse `sortForFifo`/`groupBySymbol`/`computeClosedTrades` on the filtered member trades; no new date libs).
- [ ] **Step 4:** full suite + build clean; state exact count (67 baseline + ~10 new, minus nothing).
- [ ] **Step 5:** `git add frontend/src && git commit -m "feat(wheel-math): membership windows, true basis, close-today, stages, test-first"`

---

### Task 3 (controller, visual): WheelDial + WheelCard + hero layout + Archive

Contracts: `WheelDial { stage, callsSold, no, weeks }` SVG per the mockup (stations, ✓ greens, maroon hand + station, gold spokes, hub); `WheelCard { summary, mark, onComplete, onAbandon }` with tiles/basis-walk/closeToday odometer + Complete gating on stage `CALLED_AWAY`; PortfolioTab hero layout (wheel cards first; Holdings excludes active-wheel symbols; fresh-wheel panel/link; collapsible Archive with record-sheet delete). Iterate in the browser at mobile size; keep all existing tests green; add component tests for dial stations/spokes, card numbers/gating, holdings exclusion, archive render (~6).

### Task 4 (controller, visual): FreshWheelSheet + crest & completion ceremonies

FreshWheelSheet (symbol + backdatable start) → `openWheel` → crest ceremony (rim/spoke stroke-draw, slow spin-up, typewriter caption, stamp; tap-skip; timers cleaned); Complete flow → confirm sheet with final numbers → `closeWheel` → completion variant (COMPLETED banner press + final total) → archive stamp-in. Component tests for both sheets' API calls + ceremony stage machine/tap-skip (~5).

### Task 5: Merge, deploy, phone

Full suites → merge dev→main → re-run → push → `railway up` → poll → prod smoke (open ZZTEST wheel, list, delete — never close it) → README/ledger/memory → Andrew: update on phone, fresh-wheel his real TQQQ campaign (backdated), watch the dial.
