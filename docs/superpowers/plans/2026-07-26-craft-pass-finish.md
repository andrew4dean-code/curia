# Craft Pass — Finish Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close the two items the craft pass shipped short — the ink strike-through covers only trade rows, and an assignment's share certificate is never filed away.

**Architecture:** Two independent tasks, no new design. Both were already agreed in `2026-07-25-craft-pass-design.md` (§4.2 "applies to trade rows, option records, and settled entries"; §3.4 "The sheet is then filed away as the trade ceremony's envelope does") and simply were not delivered. Nothing new is being decided here.

**Tech Stack:** React 19 + TypeScript + Vite 7 (Node 20), Vitest + Testing Library, CSS 3D transforms.

## Global Constraints

- **Node 20 only** — `export PATH="$HOME/.nvm/versions/node/v20.20.2/bin:$PATH"` before any frontend command.
- **No `prefers-reduced-motion` gating anywhere.** Repeated explicit instruction from the owner.
- **Animate `transform` and `opacity` only** on anything running per frame. The existing `box-shadow` / `filter` / `clip-path` uses are documented one-shot carve-outs; do not add new ones.
- Design tokens only, never raw hex.
- **No new backend endpoints, schema changes, or maths.**
- **Animation bugs are invisible to this test suite** — jsdom computes no animation. Four shipped-then-caught bugs on the previous branch were CSS shorthands silently resetting a sub-property another rule relied on, and two rules naming the same keyframe so an attribute toggle never restarted it. When you add a rule that could match an element another rule already animates, check the cascade by hand.
- **Spec:** `docs/superpowers/specs/2026-07-25-craft-pass-design.md`.

---

### Task 1: Strike every deletable row, not just trades

**Files:**
- Modify: `frontend/src/App.tsx`, `frontend/src/components/PortfolioTab.tsx` (shared `TabProps`), `frontend/src/components/LedgerTab.tsx`, `frontend/src/components/OptionsTab.tsx`, `frontend/src/components/OptionRecordSheet.tsx`, `frontend/src/components/SettleSheet.tsx`
- Test: `frontend/src/components/__tests__/LedgerTab.test.tsx`, `OptionsTab.test.tsx`

**Interfaces:**
- Consumes: the existing `strikingTradeId?: number | null` on `TabProps` and `App`'s `strikeTimer` ref / `clearStrikeTimer()` helper.
- Produces: `TabProps` gains `strikingOptionId?: number | null`. `App` gains `onOptionDeleted(id: number)`, mirroring the existing `onDeleted` exactly — set the id, wait 700ms, clear, refresh — and reusing the **same** timer ref so a trade strike and an option strike cannot run over each other.

Two option-delete paths exist today and neither strikes anything:
- `OptionRecordSheet` (`deleteOption(option.id)`) — reached from the board's settled chips and the Ledger's settled rows.
- `SettleSheet.remove` (`deleteOption(option.id)` then `onDeleted?.()` with no id) — deletes an open option.

Three surfaces render option rows that must strike: `LedgerTab`'s settled-option rows, and `OptionsTab`'s `.wk-chip` (open) and `.wk-settled` (settled).

- [ ] **Step 1: Write the failing tests**

Add to `frontend/src/components/__tests__/LedgerTab.test.tsx`:

```tsx
  it('marks a struck settled option and leaves its neighbours alone', () => {
    const { container } = render(<LedgerTab snap={snapWithSettledOptions} {...cbs} strikingOptionId={7} />);
    const struck = container.querySelectorAll('.striking');
    expect(struck).toHaveLength(1);
    expect(struck[0].getAttribute('data-opt-id')).toBe('7');
  });
```

Use the file's existing snapshot fixture; if it has no settled option with id 7, add one. Give each settled-option row a `data-opt-id={o.id}` attribute so the assertion targets the row rather than its text.

Add to `frontend/src/components/__tests__/OptionsTab.test.tsx`:

```tsx
  it('strikes an open option chip on the board', () => {
    const { container } = render(<OptionsTab snap={snapWith([base])} {...cbs} onSellWeek={vi.fn()} strikingOptionId={base.id} />);
    expect(container.querySelectorAll('.striking')).toHaveLength(1);
  });

  it('strikes a settled option row on the board', () => {
    const settled = { ...base, id: 9, status: 'EXPIRED' as const, closed_at: '2026-08-07', expiration: '2026-08-07' };
    const { container } = render(<OptionsTab snap={snapWith([settled])} {...cbs} onSellWeek={vi.fn()} strikingOptionId={9} />);
    expect(container.querySelectorAll('.striking')).toHaveLength(1);
  });

  it('strikes nothing when no option is being deleted', () => {
    const { container } = render(<OptionsTab snap={snapWith([base])} {...cbs} onSellWeek={vi.fn()} />);
    expect(container.querySelectorAll('.striking')).toHaveLength(0);
  });
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd ~/curia-app/frontend && export PATH="$HOME/.nvm/versions/node/v20.20.2/bin:$PATH" && npx vitest run src/components/__tests__/LedgerTab.test.tsx src/components/__tests__/OptionsTab.test.tsx`
Expected: FAIL — `strikingOptionId` is not a prop; no `.striking` elements.

- [ ] **Step 3: Add the prop and the App handler**

In `PortfolioTab.tsx`, add beside `strikingTradeId`:

```tsx
  strikingOptionId?: number | null;
```

In `App.tsx`, add the state and a handler that mirrors `onDeleted` exactly, reusing the existing timer ref and `clearStrikeTimer()`:

```tsx
  const [strikingOptionId, setStrikingOptionId] = useState<number | null>(null);
```

```tsx
  // Same shape as onDeleted, and deliberately the same timer: a trade strike and
  // an option strike must never run over each other.
  const onOptionDeleted = async (id?: number) => {
    setSheet(null);
    if (id == null) { await refresh(); return; }
    clearStrikeTimer();
    setStrikingOptionId(id);
    strikeTimer.current = window.setTimeout(() => {
      setStrikingOptionId(null);
      void refresh();
    }, 700);
  };
```

`clearStrikeTimer()` must also clear `strikingTradeId` and `strikingOptionId` so a superseded strike does not leave a row struck. Read the existing helper and extend it rather than writing a second one.

Add `strikingOptionId` to the `tabProps` object.

- [ ] **Step 4: Route both option-delete paths through it**

`OptionRecordSheet` currently calls `deleteOption` itself. Give it an `onDeleted?: (id: number) => Promise<void>` prop and have it call that after a successful delete, exactly as `AddTradeSheet.remove` does. In `App.tsx`, pass `onDeleted={onOptionDeleted}` where `OptionRecordSheet` is rendered, replacing the current inline `async () => { setSheet(null); await refresh(); }`.

`SettleSheet`'s `onDeleted` is typed `() => Promise<void>` and called with no argument. Widen it to `(id?: number) => Promise<void>` and pass `option.id` at the call site in `remove()`. In `App.tsx`, point the settle sheet's `onDeleted` at `onOptionDeleted`.

**On a rejected delete neither handler runs**, so the row must stay untouched — the existing `catch` in each sheet already gives that. Verify it rather than assuming, in both sheets.

- [ ] **Step 5: Mark the three option row surfaces**

In `LedgerTab.tsx`, destructure `strikingOptionId` and on the settled-option row add `data-opt-id={o.id}` and the `striking` class when the ids match, following how the trade row already does it.

In `OptionsTab.tsx`, destructure `strikingOptionId` and add `striking` to both the open `.wk-chip` button and the `.wk-settled` button when the ids match.

- [ ] **Step 6: Make the strike readable on those rows**

The existing `.row.striking` rules assume a full-width ledger row. Append to `frontend/src/styles/app.css` so the board's chips strike too:

```css
.wk-chip.striking, .wk-settled.striking { position: relative; animation: row-fold .3s .4s cubic-bezier(.5,0,.75,0) both; }
.wk-chip.striking::after, .wk-settled.striking::after { content: ''; position: absolute; left: 0; top: 50%; height: 2px; width: 100%; background: var(--ink); transform-origin: 0 50%; transform: scaleX(0); animation: strike .34s cubic-bezier(.3,.7,.4,1) both; }
```

`row-fold` and `strike` already exist — reuse them, do not redefine them.

- [ ] **Step 7: Run the full suite**

Run: `cd ~/curia-app/frontend && export PATH="$HOME/.nvm/versions/node/v20.20.2/bin:$PATH" && npx vitest run && npx tsc --noEmit`
Expected: all PASS, tsc clean.

- [ ] **Step 8: Commit**

```bash
cd ~/curia-app && git add frontend/src && git commit -m "feat(ledger): option records and settled entries strike through too"
```

---

### Task 2: File the share certificate away

**Files:**
- Modify: `frontend/src/components/SettleCeremony.tsx`, `frontend/src/styles/ceremony.css`
- Test: `frontend/src/components/__tests__/SettleCeremony.test.tsx`

**Interfaces:**
- Consumes: the existing `Stage` union and stage timings in `SettleCeremony.tsx`.
- Produces: `Stage` gains `'file'`. **The assignment branch's total stays exactly 6400ms** — the filing is carved out of the existing certificate window, not added after it, so the existing test asserting an assignment runs longer than an expiry keeps passing unchanged.

New assignment timeline: `swing` 0 → `hit` 620 → `count` 1250 → `certificate` 3800 → **`file` 5300** → finish 6400. The expiry branch is untouched and still finishes at 3800.

- [ ] **Step 1: Write the failing test**

Add to `frontend/src/components/__tests__/SettleCeremony.test.tsx`:

```tsx
  it('files the certificate away before finishing', () => {
    vi.useFakeTimers();
    const onDone = vi.fn();
    const { container } = render(
      <SettleCeremony data={{ ...data, word: 'ASSIGNED', tone: 'assign', shares: '400 SHARES · TQQQ @ $62.00' }} onDone={onDone} />,
    );
    act(() => { vi.advanceTimersByTime(5400); });
    expect(container.querySelector('.settle-ceremony')?.getAttribute('data-stage')).toBe('file');
    expect(container.querySelector('.settle-file')).not.toBeNull();
    expect(onDone).not.toHaveBeenCalled();
    act(() => { vi.advanceTimersByTime(1100); });
    expect(onDone).toHaveBeenCalledOnce();
  });

  it('an expiry never reaches the filing stage', () => {
    vi.useFakeTimers();
    const { container } = render(<SettleCeremony data={data} onDone={vi.fn()} />);
    act(() => { vi.advanceTimersByTime(3700); });
    expect(container.querySelector('.settle-ceremony')?.getAttribute('data-stage')).not.toBe('file');
  });
```

Follow the file's existing conventions — it wraps timer advances in `act()` and imports `act` from `@testing-library/react`.

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/components/__tests__/SettleCeremony.test.tsx`
Expected: FAIL — stage never becomes `file`, no `.settle-file`.

- [ ] **Step 3: Add the stage**

In `SettleCeremony.tsx`, extend the union and the assignment branch:

```tsx
type Stage = 'swing' | 'hit' | 'count' | 'certificate' | 'file';
```

```tsx
    if (data.shares) {
      at(3800, () => setStage('certificate'));
      at(5300, () => setStage('file'));
      at(6400, finish);
    } else {
      at(3800, finish);
    }
```

Render a filing sleeve as the last child of `.ceremony-scene`, only from the `file` stage:

```tsx
        {stage === 'file' && <div className="settle-file" aria-hidden="true" />}
```

- [ ] **Step 4: Animate the filing**

Append to `frontend/src/styles/ceremony.css`:

```css
.settle-file { position: absolute; left: -6px; right: -6px; bottom: -10px; height: 62px; border-radius: 6px 6px 3px 3px; background: linear-gradient(var(--parchment) 0%, var(--parchment-card) 55%); border: 1px solid var(--rule); box-shadow: 0 -3px 10px rgba(46,40,32,.18); transform-origin: 50% 100%; animation: sleeve-rise .42s cubic-bezier(.3,.9,.35,1) both; z-index: 4; }
@keyframes sleeve-rise { from { transform: translateY(46px); opacity: 0; } to { transform: translateY(0); opacity: 1; } }
.settle-ceremony[data-stage='file'] .settle-ticket { animation: cert-file 1.1s cubic-bezier(.45,0,.3,1) both; }
@keyframes cert-file { 0% { transform: translateY(0) scale(1); opacity: 1; } 45% { transform: translateY(-8px) scale(1.02); opacity: 1; } 100% { transform: translateY(74px) scale(.86); opacity: 0; } }
```

The ticket lifts slightly, then slides down behind the sleeve and out of sight — the same beat as the trade ceremony's envelope taking the folded ticket.

**Check the cascade before you finish.** `.settle-ticket` is already animated at the `hit` stage (`ticket-jolt`). Confirm that adding `cert-file` at a different stage cannot leave both matching at once, and that neither rule resets a property the other relies on. This exact class of bug shipped four times on the previous branch.

- [ ] **Step 5: Run the full suite**

Run: `npx vitest run && npx tsc --noEmit`
Expected: all PASS. The existing test asserting an assignment runs longer than an expiry must still pass **unchanged** — if it fails, your timings drifted from the 6400ms total.

- [ ] **Step 6: Commit**

```bash
cd ~/curia-app && git add frontend/src && git commit -m "feat(settle): the share certificate is filed away"
```

---

### Task 3: Verify and ship

- [ ] **Step 1: Both suites and the motion-gating check**

```bash
cd ~/curia-app/backend && .venv/bin/pytest -q
```

```bash
cd ~/curia-app/frontend && export PATH="$HOME/.nvm/versions/node/v20.20.2/bin:$PATH" && npx vitest run && npx tsc --noEmit
```

```bash
cd ~/curia-app/frontend && grep -rn "prefers-reduced-motion" src/ || echo "CLEAN"
```

Expected: 50 pytest, frontend green, tsc clean, `CLEAN`.

- [ ] **Step 2: Merge, deploy, verify, push**

```bash
cd ~/curia-app && git checkout main && git merge --no-ff feat/finish-craft-pass
```

```bash
cd ~/curia-app && export PATH="$HOME/.nvm/versions/node/v20.20.2/bin:$PATH" && railway up --service curia
```

Confirm the deployed bundle carries `settle-file`, then `git push origin main` and append the outcome to `.superpowers/sdd/progress.md`.

---

## Self-Review

**Spec coverage:** §4.2's "trade rows, option records, and settled entries" → Task 1, which covers both option-delete paths and all three option row surfaces. §3.4's "filed away as the trade ceremony's envelope does" → Task 2.

**Placeholders:** none — every code step carries its code, every run step its command and expected result.

**Type consistency:** `strikingOptionId` and `onOptionDeleted` are named identically where defined and consumed. `Stage` gains exactly `'file'`, matching the `[data-stage='file']` selector and the test's assertion.

**Deliberate constraint:** Task 2 carves the filing out of the existing certificate window rather than extending the ceremony, so the assignment total stays 6400ms and the existing longer-than-an-expiry test passes untouched. Flagged inline at Step 5.

**Known ripple:** Task 1 widens `SettleSheet`'s `onDeleted` signature and gives `OptionRecordSheet` a new prop; both are optional or additive, but existing renders of those sheets in tests may need the new prop. That is expected collateral, not a defect.
