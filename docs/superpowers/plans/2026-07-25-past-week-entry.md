# Past-Week Entry Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let Andrew log trades into weeks that have already passed, mark weeks he deliberately sat out, see at a glance which logged trades still need an outcome, and stop being asked for fees.

**Architecture:** Six changes over the existing stack, no new patterns. A `quiet_weeks` table keyed by the week's Friday gets the same CRUD-plus-backup treatment as `wheels`. Everything else is derived at render time from data already in the snapshot — the unfinished mark, the quiet-week display rule, the settle-date default, and the wheel-window note are all pure functions living beside the maths they belong to, tested in isolation before any component touches them.

**Tech Stack:** FastAPI + SQLAlchemy 2 (Python 3.9 venv at `backend/.venv`), React 19 + TypeScript + Vite 7 (Node 20), Vitest + Testing Library, pytest.

## Global Constraints

- **Node 20 only** — `export PATH="$HOME/.nvm/versions/node/v20.20.2/bin:$PATH"` before any frontend command. Node 24 + Vite 8 hangs builds on this Mac.
- **Python 3.9 backend venv** — use `typing.Optional`, never PEP 604 `X | None`. Run pytest as `backend/.venv/bin/pytest`.
- **No reduced-motion anywhere.** The ceremony plays in full for backdated entries exactly as for live ones. Do not add any motion gating.
- **Dates are local-calendar strings** `YYYY-MM-DD`, compared lexicographically. Never `new Date().toISOString().slice(0,10)` — that is UTC and shifts the day.
- **Fees are removed from forms only.** The `fees` / `close_fees` columns, API fields, backup keys, and P/L maths all stay exactly as they are.
- **Spec:** `docs/superpowers/specs/2026-07-25-past-week-entry-design.md`.

### One deliberate deviation from the spec

The spec describes `quiet_weeks` as `id` pk + `friday` unique. This plan makes **`friday` itself the primary key** — the `marks` table already uses its natural key (`symbol`) as pk, so this matches the established pattern, removes a redundant column, and makes `s.get(QuietWeek, friday)` the natural lookup. Behaviour is identical.

---

### Task 1: Backend — quiet weeks table, CRUD, and backup

**Files:**
- Modify: `backend/app/models.py` (append after `Wheel`)
- Modify: `backend/app/routes.py` (imports, schema, three routes, export, import)
- Test: `backend/tests/test_quiet_weeks.py` (create)
- Test: `backend/tests/test_export_import.py` (extend)

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces: `GET /api/quiet-weeks` → `list[str]` ascending; `POST /api/quiet-weeks` body `{"friday": "YYYY-MM-DD"}` → `{"friday": str}` with status 201 on first mark and 200 when already marked; `DELETE /api/quiet-weeks/{friday}` → 204, or 404 when not marked. Export/import gain the `quiet_weeks` key holding a `list[str]`.

- [ ] **Step 1: Write the failing tests**

Create `backend/tests/test_quiet_weeks.py`:

```python
from tests.conftest import HEADERS


def test_mark_then_list(client):
    r = client.post("/api/quiet-weeks", json={"friday": "2026-07-17"}, headers=HEADERS)
    assert r.status_code == 201
    assert r.json() == {"friday": "2026-07-17"}
    assert client.get("/api/quiet-weeks", headers=HEADERS).json() == ["2026-07-17"]


def test_list_is_ascending(client):
    for f in ("2026-07-24", "2026-07-10", "2026-07-17"):
        client.post("/api/quiet-weeks", json={"friday": f}, headers=HEADERS)
    assert client.get("/api/quiet-weeks", headers=HEADERS).json() == [
        "2026-07-10", "2026-07-17", "2026-07-24",
    ]


def test_remarking_is_idempotent_not_an_error(client):
    client.post("/api/quiet-weeks", json={"friday": "2026-07-17"}, headers=HEADERS)
    again = client.post("/api/quiet-weeks", json={"friday": "2026-07-17"}, headers=HEADERS)
    assert again.status_code == 200
    assert again.json() == {"friday": "2026-07-17"}
    assert client.get("/api/quiet-weeks", headers=HEADERS).json() == ["2026-07-17"]


def test_clear(client):
    client.post("/api/quiet-weeks", json={"friday": "2026-07-17"}, headers=HEADERS)
    assert client.delete("/api/quiet-weeks/2026-07-17", headers=HEADERS).status_code == 204
    assert client.get("/api/quiet-weeks", headers=HEADERS).json() == []


def test_clearing_an_unmarked_week_is_404(client):
    assert client.delete("/api/quiet-weeks/2026-07-17", headers=HEADERS).status_code == 404


def test_rejects_a_non_date(client):
    r = client.post("/api/quiet-weeks", json={"friday": "last week"}, headers=HEADERS)
    assert r.status_code == 422


def test_requires_the_passcode(client):
    assert client.get("/api/quiet-weeks").status_code == 401
```

Append to `backend/tests/test_export_import.py`:

```python
def test_export_import_round_trips_quiet_weeks(client):
    client.post("/api/quiet-weeks", json={"friday": "2026-07-17"}, headers=HEADERS)
    dump = client.get("/api/export", headers=HEADERS).json()
    assert dump["quiet_weeks"] == ["2026-07-17"]

    client.delete("/api/quiet-weeks/2026-07-17", headers=HEADERS)
    r = client.post("/api/import", json={**dump, "confirm": True}, headers=HEADERS)
    assert r.status_code == 200
    assert r.json()["quiet_weeks"] == 1
    assert client.get("/api/quiet-weeks", headers=HEADERS).json() == ["2026-07-17"]


def test_import_without_quiet_weeks_key_still_works(client):
    # Backups taken before this feature must keep restoring.
    client.post("/api/quiet-weeks", json={"friday": "2026-07-17"}, headers=HEADERS)
    r = client.post("/api/import",
                    json={"version": 1, "confirm": True, "trades": [], "marks": [],
                          "options": [], "wheels": []},
                    headers=HEADERS)
    assert r.status_code == 200
    assert client.get("/api/quiet-weeks", headers=HEADERS).json() == []
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd ~/curia-app/backend && .venv/bin/pytest tests/test_quiet_weeks.py tests/test_export_import.py -v`
Expected: FAIL — 404s on the unknown `/api/quiet-weeks` routes, `KeyError: 'quiet_weeks'` in the export test.

- [ ] **Step 3: Add the model**

Append to `backend/app/models.py`:

```python
class QuietWeek(Base):
    """A week Andrew deliberately sat out — so an empty week on the board reads
    as 'quiet on purpose' rather than 'not caught up yet'."""
    __tablename__ = "quiet_weeks"
    friday: Mapped[str] = mapped_column(primary_key=True)  # YYYY-MM-DD, the week's Friday
    created_at: Mapped[str] = mapped_column(default=utcnow)
```

`init_db()` calls `Base.metadata.create_all`, so the table appears on deploy with no migration.

- [ ] **Step 4: Add the routes**

In `backend/app/routes.py`, change the two import lines:

```python
from fastapi import APIRouter, Depends, HTTPException, Response
from app.models import Mark, Option, QuietWeek, Trade, Wheel, utcnow
```

Add the schema next to the other `*In` models:

```python
class QuietWeekIn(BaseModel):
    friday: str = Field(pattern=r"^\d{4}-\d{2}-\d{2}$")
```

Add the three routes after `delete_wheel`:

```python
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
```

- [ ] **Step 5: Add quiet weeks to export and import**

In `export_all`, add the query and the key:

```python
        quiet = [q.friday for q in s.scalars(select(QuietWeek).order_by(QuietWeek.friday)).all()]
        return {"version": 1, "trades": trades, "marks": marks, "options": options,
                "wheels": wheels, "quiet_weeks": quiet}
```

In `ImportBody`, add the optional key so pre-feature backups still validate:

```python
    quiet_weeks: list[str] = []
```

In `import_all`, add the collection beside the other row lists:

```python
    quiet_rows: list = []
```

inside the same `try:` block that validates the other rows:

```python
        for row in body.quiet_weeks:
            quiet_rows.append(QuietWeekIn(friday=row).friday)
```

in the replace block, beside the other deletes:

```python
        s.execute(delete(QuietWeek))
```

after the wheel loop:

```python
        for friday in quiet_rows:
            s.add(QuietWeek(friday=friday))
```

and in the returned counts:

```python
        return {"trades": len(trades), "marks": len(marks), "options": len(option_rows),
                "wheels": len(wheel_rows), "quiet_weeks": len(quiet_rows)}
```

- [ ] **Step 6: Run the tests to verify they pass**

Run: `cd ~/curia-app/backend && .venv/bin/pytest -q`
Expected: PASS — 41 prior tests plus 9 new = 50 passed.

- [ ] **Step 7: Commit**

```bash
cd ~/curia-app && git add backend/app/models.py backend/app/routes.py backend/tests/test_quiet_weeks.py backend/tests/test_export_import.py && git commit -m "feat(backend): quiet_weeks table, CRUD, backup round-trip, test-first"
```

---

### Task 2: Frontend — the four pure helpers

**Files:**
- Modify: `frontend/src/lib/board.ts`
- Modify: `frontend/src/lib/optionsMath.ts`
- Modify: `frontend/src/lib/time.ts`
- Modify: `frontend/src/lib/wheelMath.ts`
- Test: `frontend/src/lib/__tests__/board.test.ts`, `optionsMath.test.ts`, `time.test.ts`, `wheelMath.test.ts`

**Interfaces:**
- Consumes: existing `weekFridayFor(dateStr: string): string` from `board.ts`; existing module-private `inWindow(w: Wheel, date: string): boolean` from `wheelMath.ts`.
- Produces, all pure and all taking `today` as an explicit argument so tests never touch the clock:
  - `canMarkQuiet(friday: string, today: string): boolean` — `board.ts`
  - `needsSettling(o: OptionPosition, today: string): boolean` — `optionsMath.ts`
  - `todayIso(): string` and `settleDateDefault(expiration: string, today: string): string` — `time.ts`
  - `wheelWindowNote(symbol: string, date: string, wheels: Wheel[]): string | null` — `wheelMath.ts`

- [ ] **Step 1: Write the failing tests**

Append to `frontend/src/lib/__tests__/board.test.ts` (add `canMarkQuiet` to the existing import from `../board`):

```ts
describe('canMarkQuiet', () => {
  // Thu Jul 23 2026 sits in the week of Fri Jul 24.
  it('allows this week and every week before it', () => {
    expect(canMarkQuiet('2026-07-24', '2026-07-23')).toBe(true); // this week
    expect(canMarkQuiet('2026-07-17', '2026-07-23')).toBe(true); // last week
    expect(canMarkQuiet('2026-06-26', '2026-07-23')).toBe(true); // a month back
  });

  it('refuses weeks that have not started', () => {
    expect(canMarkQuiet('2026-07-31', '2026-07-23')).toBe(false);
    expect(canMarkQuiet('2026-08-07', '2026-07-23')).toBe(false);
  });

  it('still allows this week when today is its Friday', () => {
    expect(canMarkQuiet('2026-07-24', '2026-07-24')).toBe(true);
  });
});
```

Append to `frontend/src/lib/__tests__/optionsMath.test.ts` (import `needsSettling`; reuse or copy the file's existing `OptionPosition` fixture — name it `base` if the file has none):

```ts
describe('needsSettling', () => {
  const open = { ...base, status: 'OPEN' as const, expiration: '2026-07-17' };

  it('marks an open option whose expiration has passed', () => {
    expect(needsSettling(open, '2026-07-23')).toBe(true);
  });

  it('leaves an option expiring today alone', () => {
    expect(needsSettling(open, '2026-07-17')).toBe(false);
  });

  it('leaves a live option alone', () => {
    expect(needsSettling({ ...open, expiration: '2026-07-31' }, '2026-07-23')).toBe(false);
  });

  it('never marks an option that is already settled', () => {
    expect(needsSettling({ ...open, status: 'EXPIRED', closed_at: '2026-07-17' }, '2026-07-23')).toBe(false);
  });
});
```

Append to `frontend/src/lib/__tests__/time.test.ts` (import `settleDateDefault`):

```ts
describe('settleDateDefault', () => {
  it('uses the expiration when it has already passed', () => {
    expect(settleDateDefault('2026-07-17', '2026-07-23')).toBe('2026-07-17');
  });

  it('uses today when the option has not expired yet', () => {
    expect(settleDateDefault('2026-07-31', '2026-07-23')).toBe('2026-07-23');
  });

  it('uses today on expiration day itself', () => {
    expect(settleDateDefault('2026-07-23', '2026-07-23')).toBe('2026-07-23');
  });
});
```

Append to `frontend/src/lib/__tests__/wheelMath.test.ts` (import `wheelWindowNote`):

```ts
describe('wheelWindowNote', () => {
  const open = { id: 1, symbol: 'TQQQ', no: 1, opened_at: '2026-07-20', closed_at: null };
  const done = { id: 2, symbol: 'TQQQ', no: 2, opened_at: '2026-05-01', closed_at: '2026-05-29' };

  it('says nothing when the symbol has no wheel at all', () => {
    expect(wheelWindowNote('NVDA', '2026-07-18', [open])).toBeNull();
  });

  it('says nothing when the date sits inside the wheel', () => {
    expect(wheelWindowNote('TQQQ', '2026-07-22', [open])).toBeNull();
  });

  it('warns, naming the start date, when the date is before the wheel began', () => {
    expect(wheelWindowNote('TQQQ', '2026-07-18', [open])).toBe(
      "This is before your TQQQ wheel started (2026-07-20) — it won't count toward it.",
    );
  });

  it('warns, naming the end date, when the date is after a completed wheel', () => {
    expect(wheelWindowNote('TQQQ', '2026-06-05', [done])).toBe(
      "This is after your TQQQ wheel completed (2026-05-29) — it won't count toward it.",
    );
  });

  it('stays silent when the date is inside any one of several wheels', () => {
    expect(wheelWindowNote('TQQQ', '2026-05-10', [open, done])).toBeNull();
  });

  it('warns when the date falls outside every wheel for the symbol', () => {
    expect(wheelWindowNote('TQQQ', '2026-06-15', [open, done])).toBe(
      "This is before your TQQQ wheel started (2026-07-20) — it won't count toward it.",
    );
  });

  it('matches the symbol case-insensitively so it works mid-typing', () => {
    expect(wheelWindowNote('tqqq', '2026-07-18', [open])).toBe(
      "This is before your TQQQ wheel started (2026-07-20) — it won't count toward it.",
    );
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd ~/curia-app/frontend && export PATH="$HOME/.nvm/versions/node/v20.20.2/bin:$PATH" && npx vitest run src/lib`
Expected: FAIL — TypeScript/import errors, `canMarkQuiet is not a function` and the three siblings.

- [ ] **Step 3: Implement the four helpers**

Append to `frontend/src/lib/board.ts`:

```ts
// A week can be marked quiet once it has begun: this week, or any earlier one.
// Future weeks haven't had the chance to be quiet yet.
export function canMarkQuiet(friday: string, today: string): boolean {
  return friday <= weekFridayFor(today);
}
```

Append to `frontend/src/lib/optionsMath.ts` (add `OptionPosition` to the existing type import if absent):

```ts
// An option still OPEN past its expiration is unfinished bookkeeping — the world
// knows how it ended, this app doesn't yet. Left unsettled it also drags wheel
// stage, since deriveStage reads any open PUT as SELL_PUT however old it is.
export function needsSettling(o: OptionPosition, today: string): boolean {
  return o.status === 'OPEN' && o.expiration < today;
}
```

Append to `frontend/src/lib/time.ts` (`localDateString` already exists in this file):

```ts
export function todayIso(): string {
  return localDateString(new Date());
}

// An already-expired option almost always ended on its expiration day — expired
// worthless, or assigned at expiry. Defaulting to today would misdate the stock
// the backend books on ASSIGNED, and reorder FIFO lots against that week.
export function settleDateDefault(expiration: string, today: string): string {
  return expiration < today ? expiration : today;
}
```

Append to `frontend/src/lib/wheelMath.ts`:

```ts
// Backfilling a record dated outside its wheel's window means the premium or
// shares silently never count toward it. Report the mismatch; never widen a
// wheel's window automatically — the window is Andrew's declaration, not ours.
export function wheelWindowNote(symbol: string, date: string, wheels: Wheel[]): string | null {
  const sym = symbol.trim().toUpperCase();
  const mine = wheels.filter((w) => w.symbol === sym);
  if (mine.length === 0) return null;
  if (mine.some((w) => inWindow(w, date))) return null;

  const before = mine
    .filter((w) => date < w.opened_at)
    .sort((a, b) => a.opened_at.localeCompare(b.opened_at))[0];
  if (before) {
    return `This is before your ${sym} wheel started (${before.opened_at}) — it won't count toward it.`;
  }
  const after = mine
    .filter((w) => w.closed_at !== null && w.closed_at < date)
    .sort((a, b) => (b.closed_at ?? '').localeCompare(a.closed_at ?? ''))[0];
  return after
    ? `This is after your ${sym} wheel completed (${after.closed_at}) — it won't count toward it.`
    : null;
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd ~/curia-app/frontend && export PATH="$HOME/.nvm/versions/node/v20.20.2/bin:$PATH" && npx vitest run src/lib`
Expected: PASS, ~20 new assertions across the four files.

- [ ] **Step 5: Commit**

```bash
cd ~/curia-app && git add frontend/src/lib && git commit -m "feat(lib): canMarkQuiet, needsSettling, settleDateDefault, wheelWindowNote — test-first"
```

---

### Task 3: Frontend — quiet weeks in the API client and snapshot

**Files:**
- Modify: `frontend/src/lib/api.ts`
- Test: `frontend/src/lib/__tests__/api.test.ts`

**Interfaces:**
- Consumes: Task 1's three endpoints.
- Produces: `Snapshot.quietWeeks: string[]`; `markQuietWeek(friday: string): Promise<{friday: string}>`; `clearQuietWeek(friday: string): Promise<void>`.

- [ ] **Step 1: Write the failing tests**

Append to `frontend/src/lib/__tests__/api.test.ts`, following the file's existing fetch-mock style:

```ts
describe('quiet weeks', () => {
  it('fetchSnapshot pulls quiet weeks alongside everything else', async () => {
    const fetchMock = vi.fn(async (url: string) => ({
      ok: true,
      status: 200,
      json: async () =>
        url === '/api/quiet-weeks' ? ['2026-07-17'] : [],
    }));
    vi.stubGlobal('fetch', fetchMock);
    const snap = await fetchSnapshot();
    expect(snap.quietWeeks).toEqual(['2026-07-17']);
    expect(fetchMock).toHaveBeenCalledWith('/api/quiet-weeks', expect.anything());
  });

  it('a cache written before this feature reads back with no quiet weeks', () => {
    localStorage.setItem(
      'curia-cache-v3',
      JSON.stringify({ trades: [], marks: [], options: [], wheels: [], fetchedAt: 'x' }),
    );
    expect(cachedSnapshot()?.quietWeeks).toEqual([]);
  });

  it('marks and clears a week', async () => {
    const fetchMock = vi.fn(async () => ({ ok: true, status: 200, json: async () => ({ friday: '2026-07-17' }) }));
    vi.stubGlobal('fetch', fetchMock);
    await markQuietWeek('2026-07-17');
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/quiet-weeks',
      expect.objectContaining({ method: 'POST', body: JSON.stringify({ friday: '2026-07-17' }) }),
    );
    await clearQuietWeek('2026-07-17');
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/quiet-weeks/2026-07-17',
      expect.objectContaining({ method: 'DELETE' }),
    );
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd ~/curia-app/frontend && export PATH="$HOME/.nvm/versions/node/v20.20.2/bin:$PATH" && npx vitest run src/lib/__tests__/api.test.ts`
Expected: FAIL — `markQuietWeek is not a function`, `snap.quietWeeks` undefined.

- [ ] **Step 3: Extend the snapshot**

In `frontend/src/lib/api.ts`, add the field to the interface:

```ts
export interface Snapshot {
  trades: Trade[];
  marks: Mark[];
  options: OptionPosition[];
  wheels: Wheel[];
  quietWeeks: string[];
  fetchedAt: string;
}
```

Extend the parallel fetch:

```ts
export async function fetchSnapshot(): Promise<Snapshot> {
  const [trades, marks, options, wheels, quietWeeks] = await Promise.all([
    request<Trade[]>('/api/trades'),
    request<Mark[]>('/api/marks'),
    request<OptionPosition[]>('/api/options'),
    request<Wheel[]>('/api/wheels'),
    request<string[]>('/api/quiet-weeks'),
  ]);
  const snap: Snapshot = { trades, marks, options, wheels, quietWeeks, fetchedAt: new Date().toISOString() };
  localStorage.setItem(CACHE_STORAGE, JSON.stringify(snap));
  return snap;
}
```

Guard the cache read — caches written before this feature have no `quietWeeks`, and the board would crash mapping over `undefined` while offline:

```ts
export function cachedSnapshot(): Snapshot | null {
  const raw = localStorage.getItem(CACHE_STORAGE);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Snapshot;
    return { ...parsed, quietWeeks: parsed.quietWeeks ?? [] };
  } catch {
    localStorage.removeItem(CACHE_STORAGE);
    return null;
  }
}
```

Add the two mutations beside `deleteWheel`:

```ts
export const markQuietWeek = (friday: string) =>
  request<{ friday: string }>('/api/quiet-weeks', { method: 'POST', body: JSON.stringify({ friday }) });
export const clearQuietWeek = (friday: string) =>
  request<void>(`/api/quiet-weeks/${friday}`, { method: 'DELETE' });
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd ~/curia-app/frontend && export PATH="$HOME/.nvm/versions/node/v20.20.2/bin:$PATH" && npx vitest run`
Expected: PASS. Other suites build `Snapshot` literals; if TypeScript flags a missing `quietWeeks` in a test fixture, add `quietWeeks: []` to that fixture.

- [ ] **Step 5: Commit**

```bash
cd ~/curia-app && git add frontend/src && git commit -m "feat(api): quietWeeks in the snapshot, mark/clear client calls, legacy-cache guard"
```

---

### Task 4: Options board — past-week entry, unfinished marks, quiet weeks

**Files:**
- Modify: `frontend/src/components/OptionsTab.tsx`
- Modify: `frontend/src/components/PortfolioTab.tsx` (the shared `TabProps`)
- Modify: `frontend/src/styles/app.css`
- Test: `frontend/src/components/__tests__/OptionsTab.test.tsx`

**Interfaces:**
- Consumes: `canMarkQuiet`, `needsSettling`, `todayIso` (Tasks 2–3); `Snapshot.quietWeeks`.
- Produces: two new optional `TabProps` callbacks, wired in Task 6 —
  `onMarkQuiet?: (friday: string) => void` and `onClearQuiet?: (friday: string) => void`.

**Note:** the existing test `'tapping an empty future week sells into that Friday; past weeks are inert'` asserts the behaviour this task deliberately removes. Rewrite it as shown — do not delete it.

- [ ] **Step 1: Write the failing tests**

In `frontend/src/components/__tests__/OptionsTab.test.tsx`, update `snapWith` to include the new field and accept quiet weeks:

```ts
function snapWith(options: OptionPosition[], quietWeeks: string[] = []): Snapshot {
  return { trades: [], marks: [], options, wheels: [], quietWeeks, fetchedAt: new Date().toISOString() };
}
```

Replace the `'past weeks are inert'` test with:

```ts
  it('logs into past weeks as readily as future ones', () => {
    const onSellWeek = vi.fn();
    render(<OptionsTab snap={snapWith([])} {...cbs} onSellWeek={onSellWeek} />);
    fireEvent.click(screen.getByRole('button', { name: /sell the week of Aug 21/i }));
    expect(onSellWeek).toHaveBeenCalledWith('2026-08-21');
    fireEvent.click(screen.getByRole('button', { name: /log a trade for the week of Aug 7/i }));
    expect(onSellWeek).toHaveBeenCalledWith('2026-08-07');
  });
```

Add:

```ts
  it('flags an open option whose expiration has passed', () => {
    const stale = { ...base, expiration: '2026-08-07', opened_at: '2026-08-03' };
    render(<OptionsTab snap={snapWith([stale])} {...cbs} onSellWeek={vi.fn()} />);
    expect(screen.getByText(/needs settling/i)).toBeInTheDocument();
  });

  it('does not flag a live option or a settled one', () => {
    const settled = { ...base, id: 4, expiration: '2026-08-07', status: 'EXPIRED' as const, closed_at: '2026-08-07' };
    render(<OptionsTab snap={snapWith([base, settled])} {...cbs} onSellWeek={vi.fn()} />);
    expect(screen.queryByText(/needs settling/i)).toBeNull();
  });

  it('offers the quiet mark on this week and earlier, never on a future week', () => {
    render(<OptionsTab snap={snapWith([])} {...cbs} onSellWeek={vi.fn()} onMarkQuiet={vi.fn()} />);
    // System time is Wed Aug 12 2026, so the live week is Fri Aug 14.
    expect(screen.getByRole('button', { name: /didn't trade the week of Aug 7/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /didn't trade the week of Aug 14/i })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /didn't trade the week of Aug 21/i })).toBeNull();
  });

  it('marking a week calls back with its Friday', () => {
    const onMarkQuiet = vi.fn();
    render(<OptionsTab snap={snapWith([])} {...cbs} onSellWeek={vi.fn()} onMarkQuiet={onMarkQuiet} />);
    fireEvent.click(screen.getByRole('button', { name: /didn't trade the week of Aug 7/i }));
    expect(onMarkQuiet).toHaveBeenCalledWith('2026-08-07');
  });

  it('a marked week shows as quiet and offers to undo', () => {
    const onClearQuiet = vi.fn();
    render(<OptionsTab snap={snapWith([], ['2026-08-07'])} {...cbs} onSellWeek={vi.fn()} onMarkQuiet={vi.fn()} onClearQuiet={onClearQuiet} />);
    expect(screen.getByText(/no trades this week/i)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /undo the quiet mark on Aug 7/i }));
    expect(onClearQuiet).toHaveBeenCalledWith('2026-08-07');
  });

  it('a marked week holding a trade is not quiet — the trade wins, with no extra write', () => {
    const inThatWeek = { ...base, expiration: '2026-08-07', opened_at: '2026-08-03' };
    render(<OptionsTab snap={snapWith([inThatWeek], ['2026-08-07'])} {...cbs} onSellWeek={vi.fn()} onMarkQuiet={vi.fn()} />);
    expect(screen.queryByText(/no trades this week/i)).toBeNull();
  });
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd ~/curia-app/frontend && export PATH="$HOME/.nvm/versions/node/v20.20.2/bin:$PATH" && npx vitest run src/components/__tests__/OptionsTab.test.tsx`
Expected: FAIL — no "log a trade for the week of Aug 7" button, no "needs settling", no quiet controls.

- [ ] **Step 3: Extend TabProps**

In `frontend/src/components/PortfolioTab.tsx`, add to `TabProps` after `onViewRecord`:

```ts
  onMarkQuiet?: (friday: string) => void;
  onClearQuiet?: (friday: string) => void;
```

- [ ] **Step 4: Rewrite the week line**

In `frontend/src/components/OptionsTab.tsx`, replace the imports and the `localTodayIso` helper (it duplicates `time.ts`; use the shared one):

```tsx
import { useState } from 'react';
import type { TabProps } from './PortfolioTab';
import { canMarkQuiet, fridaysOfMonth, monthScore, weekFridayFor } from '../lib/board';
import { needsSettling, optionRealizedPl, premiumCollected } from '../lib/optionsMath';
import { expiryLabel, nextFriday, todayIso } from '../lib/time';
import { formatMoney, formatSignedMoney } from '../lib/format';
```

Delete the local `localTodayIso` function entirely.

Change the signature and the `today` binding:

```tsx
export function OptionsTab({ snap, onSettleOption, onSellWeek, onViewRecord, onMarkQuiet, onClearQuiet }: TabProps) {
  const now = new Date();
  const [ym, setYm] = useState<[number, number]>([now.getFullYear(), now.getMonth() + 1]);
  const [year, month] = ym;
  const fridays = fridaysOfMonth(year, month);
  const today = todayIso();
```

Inside the `fridays.map` callback, after `const isLive = friday === liveFriday;`, add:

```tsx
          const isQuiet = rows.length === 0 && snap.quietWeeks.includes(friday);
          const canQuiet = rows.length === 0 && !isQuiet && canMarkQuiet(friday, today);
```

Give the open chip its unfinished mark — replace the `wk-chip-text` span with:

```tsx
                    <span className="wk-chip-text">
                      {o.symbol} ${o.strike} {o.opt_type} · {o.contracts}x · {formatMoney(premiumCollected(o))}
                      {needsSettling(o, today) && <span className="wk-todo">needs settling</span>}
                    </span>
```

Replace the trailing `{!isPast && onSellWeek && (...)}` block with:

```tsx
              {isQuiet ? (
                <div className="wk-quiet">
                  <span>No trades this week.</span>
                  {onClearQuiet && (
                    <button
                      type="button"
                      className="wk-quiet-undo"
                      aria-label={`undo the quiet mark on ${fmtShort(friday)}`}
                      onClick={() => onClearQuiet(friday)}
                    >
                      undo
                    </button>
                  )}
                </div>
              ) : (
                <>
                  {onSellWeek && (
                    <button
                      className="wk-sell"
                      aria-label={
                        isPast
                          ? `log a trade for the week of ${fmtShort(friday)}`
                          : `sell the week of ${fmtShort(friday)}`
                      }
                      onClick={() => onSellWeek(friday)}
                    >
                      {isPast
                        ? rows.length > 0
                          ? '＋ log another for this week'
                          : '＋ log a trade for this week'
                        : rows.length > 0
                          ? '＋ sell another this week'
                          : '＋ tap to sell this week'}
                    </button>
                  )}
                  {canQuiet && onMarkQuiet && (
                    <button
                      type="button"
                      className="wk-quiet-set"
                      aria-label={`didn't trade the week of ${fmtShort(friday)}`}
                      onClick={() => onMarkQuiet(friday)}
                    >
                      didn't trade this week
                    </button>
                  )}
                </>
              )}
```

- [ ] **Step 5: Add the styles**

Append to `frontend/src/styles/app.css` beside the other `.wk-` rules:

```css
.wk-todo { display: inline-block; margin-left: 8px; padding: 2px 7px; border: 1px solid var(--maroon); border-radius: 999px; font-family: var(--font-mono); font-size: 11px; letter-spacing: .04em; color: var(--maroon); white-space: nowrap; }
.wk-quiet { display: flex; align-items: center; justify-content: space-between; gap: 10px; min-height: 44px; margin-top: 6px; border-top: 2px dashed var(--rule); padding: 14px 0 8px; font-family: var(--font-mono); font-size: 13px; color: var(--ink-soft); font-style: italic; }
.wk-quiet-undo { min-height: 44px; padding: 0 6px; background: none; border: none; font-family: var(--font-mono); font-size: 13px; color: var(--gold-label); text-decoration: underline; }
.wk-quiet-set { display: block; width: 100%; min-height: 44px; text-align: left; background: none; border: none; padding: 10px 0 8px; font-family: var(--font-mono); font-size: 13px; color: var(--ink-soft); }
.wk:not(.past) .wk-quiet-set:active, .wk:not(.past) .wk-quiet-undo:active { color: var(--maroon); }
```

- [ ] **Step 6: Run the tests to verify they pass**

Run: `cd ~/curia-app/frontend && export PATH="$HOME/.nvm/versions/node/v20.20.2/bin:$PATH" && npx vitest run`
Expected: PASS, all suites.

- [ ] **Step 7: Commit**

```bash
cd ~/curia-app && git add frontend/src && git commit -m "feat(board): past weeks accept entry, unfinished marks, quiet weeks"
```

---

### Task 5: Sheets — settle-date default, wheel note, fees gone

**Files:**
- Modify: `frontend/src/components/SettleSheet.tsx`
- Modify: `frontend/src/components/OptionSellSheet.tsx`
- Modify: `frontend/src/components/AddTradeSheet.tsx`
- Test: `frontend/src/components/__tests__/SettleSheet.test.tsx`, `OptionSellSheet.test.tsx`, `AddTradeSheet.test.tsx`

**Interfaces:**
- Consumes: `settleDateDefault`, `todayIso` (Task 2), `wheelWindowNote` (Task 2).
- Produces: `OptionSellSheet` and `AddTradeSheet` each gain a required `wheels: Wheel[]` prop, passed in Task 6.

- [ ] **Step 1: Write the failing tests**

Add to `frontend/src/components/__tests__/SettleSheet.test.tsx` (the file already fakes timers; match its existing fixture names):

```ts
  it('defaults the settle date to the expiration once it has passed', () => {
    vi.setSystemTime(new Date(2026, 6, 23, 9, 0, 0)); // Thu Jul 23 2026
    const stale = { ...base, expiration: '2026-07-17', status: 'OPEN' as const };
    render(<SettleSheet option={stale} onDone={vi.fn()} onEdit={vi.fn()} onCancel={vi.fn()} />);
    expect((screen.getByLabelText(/settle date/i) as HTMLInputElement).value).toBe('2026-07-17');
  });

  it('defaults to today while the option is still live', () => {
    vi.setSystemTime(new Date(2026, 6, 23, 9, 0, 0));
    const live = { ...base, expiration: '2026-07-31', status: 'OPEN' as const };
    render(<SettleSheet option={live} onDone={vi.fn()} onEdit={vi.fn()} onCancel={vi.fn()} />);
    expect((screen.getByLabelText(/settle date/i) as HTMLInputElement).value).toBe('2026-07-23');
  });

  it('asks nothing about fees when buying back', () => {
    render(<SettleSheet option={base} onDone={vi.fn()} onEdit={vi.fn()} onCancel={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: /bought back/i }));
    expect(screen.queryByLabelText(/fees/i)).toBeNull();
  });

  it('settles a buyback with zero fees', async () => {
    const settle = vi.mocked(api.settleOption);
    render(<SettleSheet option={base} onDone={vi.fn()} onEdit={vi.fn()} onCancel={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: /bought back/i }));
    fireEvent.change(screen.getByLabelText(/buyback \/ share/i), { target: { value: '0.20' } });
    fireEvent.click(screen.getByRole('button', { name: /^settle$/i }));
    await waitFor(() =>
      expect(settle).toHaveBeenCalledWith(base.id, expect.objectContaining({ buyback_price: 0.2, close_fees: 0 })),
    );
  });
```

Add to `frontend/src/components/__tests__/OptionSellSheet.test.tsx` (every existing render in this file needs `wheels={[]}` added):

```ts
  it('asks nothing about fees', () => {
    render(<OptionSellSheet expiration="2026-08-14" wheels={[]} onDone={vi.fn()} onCancel={vi.fn()} />);
    expect(screen.queryByLabelText(/fees/i)).toBeNull();
  });

  it('sends zero fees', async () => {
    const create = vi.mocked(api.createOption);
    render(<OptionSellSheet expiration="2026-08-14" wheels={[]} onDone={vi.fn()} onCancel={vi.fn()} />);
    fireEvent.change(screen.getByLabelText(/symbol/i), { target: { value: 'tqqq' } });
    fireEvent.change(screen.getByLabelText(/strike/i), { target: { value: '62' } });
    fireEvent.change(screen.getByLabelText(/premium/i), { target: { value: '0.74' } });
    fireEvent.click(screen.getByRole('button', { name: /sell to open/i }));
    await waitFor(() => expect(create).toHaveBeenCalledWith(expect.objectContaining({ fees: 0 })));
  });

  it('warns when the sale date falls before its wheel started', () => {
    const wheel = { id: 1, symbol: 'TQQQ', no: 1, opened_at: '2026-08-10', closed_at: null };
    render(<OptionSellSheet expiration="2026-08-14" wheels={[wheel]} onDone={vi.fn()} onCancel={vi.fn()} />);
    fireEvent.change(screen.getByLabelText(/symbol/i), { target: { value: 'TQQQ' } });
    fireEvent.change(screen.getByLabelText(/date sold/i), { target: { value: '2026-08-03' } });
    expect(screen.getByText(/before your TQQQ wheel started \(2026-08-10\)/i)).toBeInTheDocument();
  });

  it('stays quiet once the date is inside the wheel', () => {
    const wheel = { id: 1, symbol: 'TQQQ', no: 1, opened_at: '2026-08-10', closed_at: null };
    render(<OptionSellSheet expiration="2026-08-14" wheels={[wheel]} onDone={vi.fn()} onCancel={vi.fn()} />);
    fireEvent.change(screen.getByLabelText(/symbol/i), { target: { value: 'TQQQ' } });
    fireEvent.change(screen.getByLabelText(/date sold/i), { target: { value: '2026-08-12' } });
    expect(screen.queryByText(/won't count toward it/i)).toBeNull();
  });
```

Add to `frontend/src/components/__tests__/AddTradeSheet.test.tsx` (every existing render needs `wheels={[]}`):

```ts
  it('asks nothing about fees and sends zero', async () => {
    const create = vi.mocked(api.createTrade);
    render(<AddTradeSheet trade={null} wheels={[]} onDone={vi.fn()} onCancel={vi.fn()} />);
    expect(screen.queryByLabelText(/fees/i)).toBeNull();
    fireEvent.change(screen.getByLabelText(/symbol/i), { target: { value: 'tqqq' } });
    fireEvent.change(screen.getByLabelText(/shares/i), { target: { value: '100' } });
    fireEvent.change(screen.getByLabelText(/price/i), { target: { value: '62' } });
    fireEvent.click(screen.getByRole('button', { name: /add trade/i }));
    await waitFor(() => expect(create).toHaveBeenCalledWith(expect.objectContaining({ fees: 0 })));
  });

  it('warns when the trade date falls before its wheel started', () => {
    const wheel = { id: 1, symbol: 'TQQQ', no: 1, opened_at: '2026-08-10', closed_at: null };
    render(<AddTradeSheet trade={null} wheels={[wheel]} onDone={vi.fn()} onCancel={vi.fn()} />);
    fireEvent.change(screen.getByLabelText(/symbol/i), { target: { value: 'TQQQ' } });
    fireEvent.change(screen.getByLabelText(/^date$/i), { target: { value: '2026-08-03' } });
    expect(screen.getByText(/before your TQQQ wheel started/i)).toBeInTheDocument();
  });
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd ~/curia-app/frontend && export PATH="$HOME/.nvm/versions/node/v20.20.2/bin:$PATH" && npx vitest run src/components`
Expected: FAIL — fee fields still present, no wheel note, settle date still today, `wheels` prop unknown.

- [ ] **Step 3: Update SettleSheet**

In `frontend/src/components/SettleSheet.tsx`: delete the local `today` helper, import the shared ones, seed the date from the new default, and drop the fee field.

```tsx
import { settleDateDefault, todayIso } from '../lib/time';
```

```tsx
  const [date, setDate] = useState(settleDateDefault(option.expiration, todayIso()));
```

Remove the `closeFees` state (`const [closeFees, setCloseFees] = useState('0');`) and send a constant instead:

```tsx
        ...(outcome === 'BOUGHT_BACK'
          ? { buyback_price: Number(buyback), close_fees: 0 }
          : {}),
```

Delete the whole `<div className="field">` block containing `close-fees`.

- [ ] **Step 4: Update OptionSellSheet**

In `frontend/src/components/OptionSellSheet.tsx`: delete the local `today` helper, take `wheels`, drop fees, show the note.

```tsx
import { todayIso } from '../lib/time';
import { wheelWindowNote } from '../lib/wheelMath';
import type { OptionDraft, OptionPosition, OptionType, Wheel } from '../lib/types';
```

Add `wheels` to the props type and destructuring:

```tsx
export function OptionSellSheet({
  expiration,
  option,
  wheels,
  onDone,
  onCancel,
}: {
  expiration: string;
  option?: OptionPosition | null;
  wheels: Wheel[];
  onDone: (ticket: TicketData) => Promise<void>;
  onCancel: () => void;
}) {
```

Remove `const [fees, setFees] = useState(...)`, seed the date with `todayIso()`, and compute the note:

```tsx
  const [date, setDate] = useState(option?.opened_at ?? todayIso());
```

```tsx
  const wheelNote = wheelWindowNote(symbol, date, wheels);
```

Send zero fees in the draft:

```tsx
      fees: 0, opened_at: date, note,
```

Delete the `os-fees` field block. Directly below the `os-date` field block, add:

```tsx
        {wheelNote && <div className="sheet-note">{wheelNote}</div>}
```

- [ ] **Step 5: Update AddTradeSheet**

In `frontend/src/components/AddTradeSheet.tsx`: same three moves.

```tsx
import { todayIso } from '../lib/time';
import { wheelWindowNote } from '../lib/wheelMath';
import type { Side, Trade, Wheel } from '../lib/types';
```

```tsx
export function AddTradeSheet({
  trade,
  wheels,
  onDone,
  onDeleted,
  onCancel,
}: {
  trade: Trade | null;
  wheels: Wheel[];
  onDone: (ticket: TicketData) => Promise<void>;
  onDeleted?: () => Promise<void>;
  onCancel: () => void;
}) {
```

Delete the local `today` helper and `const [fees, setFees] = useState(...)`. Seed the date and compute the note:

```tsx
  const [date, setDate] = useState(trade?.executed_at ?? todayIso());
```

```tsx
  const wheelNote = wheelWindowNote(symbol, date, wheels);
```

Send zero fees:

```tsx
        fees: 0,
```

Delete the `fees` field block. Below the `date` field block, add:

```tsx
        {wheelNote && <div className="sheet-note">{wheelNote}</div>}
```

- [ ] **Step 6: Add the note style**

Append to `frontend/src/styles/app.css`:

```css
.sheet-note { margin: -4px 0 12px; padding: 8px 10px; border-left: 3px solid var(--gold-label); background: var(--parchment); font-family: var(--font-mono); font-size: 12px; line-height: 1.45; color: var(--ink-soft); }
```

- [ ] **Step 7: Run the tests to verify they pass**

Run: `cd ~/curia-app/frontend && export PATH="$HOME/.nvm/versions/node/v20.20.2/bin:$PATH" && npx vitest run src/components`
Expected: PASS. Compile errors about a missing `wheels` prop point at renders in existing tests — add `wheels={[]}`.

- [ ] **Step 8: Commit**

```bash
cd ~/curia-app && git add frontend/src && git commit -m "feat(sheets): settle date defaults to expiry, wheel-window note, fee inputs removed"
```

---

### Task 6: App wiring

**Files:**
- Modify: `frontend/src/App.tsx`

**Interfaces:**
- Consumes: `markQuietWeek` / `clearQuietWeek` (Task 3); `onMarkQuiet` / `onClearQuiet` (Task 4); the `wheels` prop (Task 5).
- Produces: the finished feature.

- [ ] **Step 1: Wire the quiet-week callbacks**

In `frontend/src/App.tsx`, add to the `api` import list: `markQuietWeek, clearQuietWeek`.

In the `tabProps` object, after `onViewRecord`:

```tsx
    onMarkQuiet: (friday: string) => { void markQuietWeek(friday).then(() => refresh()); },
    onClearQuiet: (friday: string) => { void clearQuietWeek(friday).then(() => refresh()); },
```

- [ ] **Step 2: Pass wheels into the three sheet renders**

```tsx
        <AddTradeSheet trade={sheet.trade} wheels={snap.wheels} onDone={onTicket} onDeleted={onDeleted} onCancel={() => setSheet(null)} />
```

```tsx
        <OptionSellSheet option={sheet.option} expiration={sheet.option.expiration} wheels={snap.wheels} onDone={onTicket} onCancel={() => setSheet(null)} />
```

```tsx
        <OptionSellSheet expiration={sheet.expiration} wheels={snap.wheels} onDone={onTicket} onCancel={() => setSheet(null)} />
```

- [ ] **Step 3: Typecheck and run the full suite**

Run: `cd ~/curia-app/frontend && export PATH="$HOME/.nvm/versions/node/v20.20.2/bin:$PATH" && npx tsc --noEmit && npx vitest run`
Expected: no type errors; all suites PASS.

- [ ] **Step 4: Commit**

```bash
cd ~/curia-app && git add frontend/src/App.tsx && git commit -m "feat(app): wire quiet weeks and pass wheels into the entry sheets"
```

---

### Task 7: Verify and ship

**Files:** none changed unless verification turns something up.

- [ ] **Step 1: Run both suites**

```bash
cd ~/curia-app/backend && .venv/bin/pytest -q
```

```bash
cd ~/curia-app/frontend && export PATH="$HOME/.nvm/versions/node/v20.20.2/bin:$PATH" && npx vitest run
```

Expected: 50 pytest, ~125 Vitest, zero failures.

- [ ] **Step 2: Audit for stored non-zero fees**

The fee inputs are gone, so any non-zero fee already recorded would keep moving totals with no way left to see or edit it. Ask Andrew for the passcode, then:

```bash
curl -s -H "X-Curia-Key: $CURIA_PASSCODE" https://curia-production-5f0c.up.railway.app/api/export | python3 -c "import json,sys; d=json.load(sys.stdin); print([(t['id'],t['fees']) for t in d['trades'] if t['fees']], [(o['id'],o['fees'],o['close_fees']) for o in d['options'] if o['fees'] or o['close_fees']])"
```

Expected `[] []`. If anything prints, stop and show Andrew before shipping — do not silently hide it.

- [ ] **Step 3: Verify in the browser**

Start the dev server via `preview_start`, then check, at 375×667:
- a past week offers "＋ log a trade for this week"; logging one runs the full ceremony
- the logged option shows "needs settling"; settling it clears the flag and defaults the date to its expiration
- an empty past week offers "didn't trade this week"; marking shows "No trades this week." with undo
- the future week offers neither the log copy nor the quiet mark
- no Fees field on any sheet
- backdating a sale before its wheel's start shows the note

Deliver screenshots in-chat — artifact links are unreliable on Andrew's phone.

- [ ] **Step 4: Deploy and smoke-test production**

```bash
cd ~/curia-app && railway up --service curia
```

Then confirm against production: `/api/quiet-weeks` returns 200, a mark/clear round-trips on a throwaway date, and the real data is untouched (trade, option, and wheel counts unchanged from before the deploy).

- [ ] **Step 5: Push and log**

```bash
cd ~/curia-app && git push origin main
```

Append the outcome to `.superpowers/sdd/progress.md` under a new `## Past-week entry build` heading and commit it.

---

## Self-Review

**Spec coverage:** (1) past-week entry → T4. (2) unfinished mark → T2 `needsSettling` + T4. (3) quiet weeks → T1 storage, T3 client, T4 UI. (4) settle-date default → T2 + T5. (5) wheel note → T2 + T5. (6) fees off forms → T5. Backup round-trip → T1. Legacy-cache guard → T3, an addition the spec did not anticipate but the change requires.

**Placeholders:** none — every code step carries its code, every run step its command and expected result.

**Type consistency:** `canMarkQuiet`, `needsSettling`, `settleDateDefault`, `todayIso`, `wheelWindowNote`, `markQuietWeek`, `clearQuietWeek`, `onMarkQuiet`, `onClearQuiet`, and the `wheels: Wheel[]` prop are each named identically in the task that defines them and every task that consumes them. `Snapshot.quietWeeks` is `string[]` throughout.

**Known ripple:** adding `quietWeeks` to `Snapshot` and `wheels` to two sheets breaks compilation in existing test fixtures. Flagged inline at T3 Step 4, T4 Step 1, and T5 Steps 1 and 7 rather than left as a surprise.
