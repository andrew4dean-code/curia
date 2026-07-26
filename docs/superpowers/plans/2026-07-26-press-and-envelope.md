# The Press and the Envelope — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the CSS-box press and envelope with real SVG objects, make the fold read as paper rather than cardboard, pin the Options month header, and slow the number rolls.

**Architecture:** Five tasks. The two cheap wins first (sticky header, roll speed), then the press SVG, then the envelope SVG, then the fold's shading. Nothing about ceremony *timing* changes — only what is drawn and how it is lit.

**Tech Stack:** React 19 + TypeScript + Vite 7 (Node 20), inline SVG, CSS animations, Vitest.

## Global Constraints

- **Node 20 only** — `export PATH="$HOME/.nvm/versions/node/v20.20.2/bin:$PATH"` before any frontend command.
- **No `prefers-reduced-motion` gating anywhere.** Given repeatedly by the owner.
- **No 3D library.** No Three.js, WebGL, canvas, Lottie, images or video. Inline SVG and CSS only.
- **No timing changes.** `STAGE_MS` still sums to 8000ms; the settle ceremony's assignment branch still totals 6400ms. Both are asserted by existing tests that must pass untouched.
- Design tokens only, never raw hex, **except** inside the press SVG where dark machine greys have no token (`--ink` is a warm brown, not a machine colour). Those are allowed and are noted where they appear.
- Animate `transform`/`opacity` per frame. Existing one-shot `box-shadow` / `filter` / `clip-path` uses are documented carve-outs; SVG attribute animation on a single element for one beat is equally acceptable.
- **Spec:** `docs/superpowers/specs/2026-07-26-press-and-envelope-design.md`.

## The verification rule — applies to every task

Shape can be tested; motion cannot. **Every task in this plan that changes something visible ends with the controller scrubbing it frame by frame** before it is called done. Implementers do not start dev servers; they report what they believe it will look like, and say plainly if they think it will look wrong.

The working scrub method, for reference:

```js
// catch a stage, clone it outside React's root so nothing unmounts it,
// pause every animation, then step currentTime by hand
const html = document.querySelector('.ceremony').outerHTML;
const p = document.createElement('div'); p.id = 'probe'; p.innerHTML = html;
document.body.appendChild(p);
p.getAnimations({ subtree: true }).forEach(a => { a.pause(); a.currentTime = T; });
```

---

### Task 1: Sticky month header and slower rolls

**Files:**
- Modify: `frontend/src/components/OptionsTab.tsx`, `frontend/src/styles/app.css`, `frontend/src/styles/curia-tokens.css`
- Test: `frontend/src/components/__tests__/OptionsTab.test.tsx`

**Interfaces:** no new exports. The month header block gains the class `board-head-sticky`.

- [ ] **Step 1: Write the failing test**

Add to `frontend/src/components/__tests__/OptionsTab.test.tsx`:

```tsx
  it('pins the month controls and the total together', () => {
    const { container } = render(<OptionsTab snap={snapWith([base])} {...cbs} onSellWeek={vi.fn()} />);
    const sticky = container.querySelector('.board-head-sticky');
    expect(sticky).not.toBeNull();
    expect(sticky!.querySelector('[aria-label="Previous month"]')).not.toBeNull();
    expect(sticky!.querySelector('[aria-label="Next month"]')).not.toBeNull();
    expect(sticky!.querySelector('[data-testid="month-score"]')).not.toBeNull();
  });
```

- [ ] **Step 2: Run it to verify it fails**

Run: `cd ~/curia-app/frontend && export PATH="$HOME/.nvm/versions/node/v20.20.2/bin:$PATH" && npx vitest run src/components/__tests__/OptionsTab.test.tsx`
Expected: FAIL — no `.board-head-sticky`.

- [ ] **Step 3: Wrap the header**

In `OptionsTab.tsx`, wrap the existing `<header className="board-head">` and the `board-score` div together in one element, leaving both untouched inside it:

```tsx
      <div className="board-head-sticky">
        <header className="board-head">
          {/* existing chevrons and month name, unchanged */}
        </header>
        <div className="board-score">
          {/* existing Odometer and label, unchanged */}
        </div>
      </div>
```

- [ ] **Step 4: Pin it**

Append to `frontend/src/styles/app.css`:

```css
.board-head-sticky { position: sticky; top: 0; z-index: 12; margin: 0 -16px 4px; padding: 0 16px 10px; background: var(--parchment); box-shadow: 0 6px 10px -8px rgba(46,40,32,.45); }
```

The negative side margins let the pinned block span the full width while the tab keeps its padding; if the tab's horizontal padding is not 16px, match whatever it actually is — read `app.css` and check rather than assuming.

**The scene is 667px tall.** If the pinned block takes more than about a fifth of that, reduce the month type or the score's size until it does not. Report the measured height.

- [ ] **Step 5: Slow the rolls**

In `frontend/src/styles/curia-tokens.css`:

```css
  --roll-hero: 1.25s;
  --roll-detail: 1.9s;
```

In `frontend/src/components/Odometer.tsx`, change the per-digit stagger from `0.02` to `0.035`:

```tsx
                style={{ transform: `translateY(-${d * 10}%)`, transitionDelay: `${i * 0.035}s` }}
```

- [ ] **Step 6: Run the full suite**

Run: `npx vitest run && npx tsc --noEmit`
Expected: all PASS.

- [ ] **Step 7: Commit**

```bash
cd ~/curia-app && git add frontend/src && git commit -m "feat(board): pin the month header, slow the number rolls"
```

---

### Task 2: The press, in SVG

**Files:**
- Create: `frontend/src/components/Press.tsx`
- Modify: `frontend/src/components/TradeCeremony.tsx`, `frontend/src/styles/ceremony.css`
- Test: `frontend/src/components/__tests__/TradeCeremony.test.tsx`

**Interfaces:**
- Produces: `Press({ striking, line })` from `frontend/src/components/Press.tsx`, where `striking: number` is the alternating restart counter already computed in `TradeCeremony` (`strike % 2`) and `line: number` is the zero-based index of the line currently being typed.

**The defect this task exists to fix:** the current typebar is a 3px div at `top: 46%` with a `z-index` above the ticket, so it draws a black diagonal across the header and the typed text. Andrew saw it immediately. **No part of the arm may ever render across the ticket's content.** Enforce that with an SVG clip path bounded at the strike line — not with z-order, which is what failed.

- [ ] **Step 1: Write the failing tests**

Add to `frontend/src/components/__tests__/TradeCeremony.test.tsx`:

```tsx
  it('draws a press with a platen, an arm and a typehead', () => {
    const { container } = render(<TradeCeremony ticket={ticket} onDone={vi.fn()} />);
    expect(container.querySelector('.press-platen')).not.toBeNull();
    expect(container.querySelector('.press-arm')).not.toBeNull();
    expect(container.querySelector('.press-head')).not.toBeNull();
  });

  it('clips the arm so it can never cross the ticket', () => {
    const { container } = render(<TradeCeremony ticket={ticket} onDone={vi.fn()} />);
    const arm = container.querySelector('.press-arm')!;
    expect(arm.getAttribute('clip-path')).toMatch(/press-clip/);
    expect(container.querySelector('#press-clip')).not.toBeNull();
  });
```

The existing regression test asserting `data-strike` alternates through printing **must survive this rewrite** — the attribute moves onto the new SVG element but must keep alternating. Do not delete or weaken it; update its selector if the element changes.

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run src/components/__tests__/TradeCeremony.test.tsx`
Expected: FAIL — no `.press-platen`.

- [ ] **Step 3: Build the press**

Create `frontend/src/components/Press.tsx`. The dark greys here are deliberate raw hex — a machine is not parchment and no token covers it.

```tsx
// The platen is a cylinder, not a pill: the horizontal gradient runs dark at both
// ends to a lit band above centre, which is what reads as a curved surface. The
// arm is clipped at the strike line so it can never be drawn across the ticket —
// the previous version relied on z-order for that and rendered a black diagonal
// across the owner's typed text.
export function Press({ striking, line }: { striking: number; line: number }) {
  const strikeY = 96 + line * 21;
  return (
    <svg className="press" viewBox="0 0 318 260" preserveAspectRatio="none" aria-hidden="true">
      <defs>
        <linearGradient id="platen-face" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#14110e" />
          <stop offset="0.18" stopColor="#3b342b" />
          <stop offset="0.46" stopColor="#4e4639" />
          <stop offset="0.78" stopColor="#2a251e" />
          <stop offset="1" stopColor="#14110e" />
        </linearGradient>
        <linearGradient id="platen-spec" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#ffffff" stopOpacity="0.30" />
          <stop offset="0.55" stopColor="#ffffff" stopOpacity="0.04" />
          <stop offset="1" stopColor="#ffffff" stopOpacity="0" />
        </linearGradient>
        <linearGradient id="platen-cast" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#2E2820" stopOpacity="0.34" />
          <stop offset="1" stopColor="#2E2820" stopOpacity="0" />
        </linearGradient>
        <linearGradient id="arm-steel" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#171410" />
          <stop offset="0.45" stopColor="#5a5245" />
          <stop offset="1" stopColor="#171410" />
        </linearGradient>
        <clipPath id="press-clip">
          <rect x="0" y={strikeY} width="318" height={260 - strikeY} />
        </clipPath>
      </defs>

      <rect className="press-cast" x="0" y="30" width="318" height="26" fill="url(#platen-cast)" />

      <g className="press-arm" data-strike={striking} clipPath="url(#press-clip)">
        <path d="M155 258 L150 130 L166 130 L161 258 Z" fill="url(#arm-steel)" />
        <rect className="press-head" x="146" y="112" width="24" height="20" rx="4" fill="#241f19" />
        <rect x="150" y="116" width="16" height="12" rx="2" fill="#3c352c" />
      </g>

      <g className="press-platen">
        <rect x="-6" y="6" width="330" height="28" rx="14" fill="url(#platen-face)" />
        <rect x="6" y="9" width="306" height="11" rx="6" fill="url(#platen-spec)" />
      </g>
    </svg>
  );
}
```

The arm group is rendered **before** the platen so the roller sits over it, and the clip path starts at the strike line so nothing above it is ever painted.

- [ ] **Step 4: Swap it into the ceremony**

In `TradeCeremony.tsx`, import `Press` and replace the `.platen` and `.typebar` divs with:

```tsx
        <Press striking={strike % 2} line={Math.max(0, typedLines.length - 1)} />
```

Delete the old `.platen` / `.typebar` divs entirely.

- [ ] **Step 5: Style and animate**

In `frontend/src/styles/ceremony.css`, delete the `.platen` and `.typebar` rules and their `bar-hit-a` / `bar-hit-b` keyframes, and add:

```css
.press { position: absolute; left: -14px; right: -14px; top: -34px; height: 260px; overflow: visible; pointer-events: none; z-index: 3; }
.press-arm { opacity: 0; transform-origin: 158px 258px; }
.ceremony[data-typing='yes'] .press-arm { opacity: 1; }
.ceremony[data-typing='yes'] .press-arm[data-strike='0'] { animation: press-hit-a 110ms cubic-bezier(.3,0,.2,1) both; }
.ceremony[data-typing='yes'] .press-arm[data-strike='1'] { animation: press-hit-b 110ms cubic-bezier(.3,0,.2,1) both; }
@keyframes press-hit-a { 0% { transform: rotate(9deg) translateY(16px); } 52% { transform: rotate(0deg) translateY(0); } 100% { transform: rotate(7deg) translateY(13px); } }
@keyframes press-hit-b { 0% { transform: rotate(-9deg) translateY(16px); } 52% { transform: rotate(0deg) translateY(0); } 100% { transform: rotate(-7deg) translateY(13px); } }
.ceremony:not([data-stage='print']) .press { opacity: 0; transition: opacity .3s ease-out; }
```

The two keyframes are **not** identical this time — the arm alternates its approach angle, which reads as different typebars striking rather than one bar twitching. They must still carry different names, for the reason already learned on this codebase: two rules naming the same keyframe do not restart on an attribute toggle.

- [ ] **Step 6: Curl the page behind the roller**

The page must look gripped. In `ceremony.css`, give the ticket a curved top edge that tucks under the platen:

```css
.ticket { border-radius: 10px 10px 4px 4px; }
.ticket::before { content: ''; position: absolute; left: 0; right: 0; top: 0; height: 16px; border-radius: 10px 10px 0 0; background: linear-gradient(rgba(46,40,32,.16), rgba(46,40,32,0)); pointer-events: none; }
```

- [ ] **Step 7: Run the full suite**

Run: `npx vitest run && npx tsc --noEmit`
Expected: all PASS, including the surviving `data-strike` regression test.

- [ ] **Step 8: Commit**

```bash
cd ~/curia-app && git add frontend/src && git commit -m "feat(ceremony): the press is a real machine, and the arm can no longer cross the page"
```

---

### Task 3: The envelope, in SVG

**Files:**
- Create: `frontend/src/components/EnvelopeArt.tsx`
- Modify: `frontend/src/components/TradeCeremony.tsx`, `frontend/src/styles/ceremony.css`
- Test: `frontend/src/components/__tests__/TradeCeremony.test.tsx`

**Interfaces:** produces `EnvelopeArt()` from `frontend/src/components/EnvelopeArt.tsx`, taking no props.

**The defect:** the current envelope is a rectangle with two corner-to-corner diagonals — an X, which reads as a crossed-out box. A real envelope back has four flaps meeting near the centre, with the top flap overlapping the other three.

- [ ] **Step 1: Write the failing test**

```tsx
  it('draws an envelope with four distinct flaps', () => {
    const { container } = render(<TradeCeremony ticket={ticket} onDone={vi.fn()} />);
    expect(container.querySelectorAll('.env-flap')).toHaveLength(4);
    expect(container.querySelector('.env-flap-top')).not.toBeNull();
  });
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run src/components/__tests__/TradeCeremony.test.tsx`
Expected: FAIL — no `.env-flap` elements.

- [ ] **Step 3: Build the envelope**

Create `frontend/src/components/EnvelopeArt.tsx`. Geometry on a 290×170 box: the side flaps meet at the vertical centre line, the bottom flap rises to just under it, and the top flap descends over all three.

```tsx
// A real envelope back: bottom trapezoid, two side triangles, and a top triangle
// drawn LAST so it overlaps the others — that overlap is what reads as "closed".
// The previous version drew two corner-to-corner diagonals, which reads as an X
// on a box rather than as folded paper.
export function EnvelopeArt() {
  return (
    <svg className="env-art" viewBox="0 0 290 170" aria-hidden="true">
      <defs>
        <linearGradient id="env-left" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#E2D7BC" /><stop offset="1" stopColor="#EFE7D2" />
        </linearGradient>
        <linearGradient id="env-right" x1="1" y1="0" x2="0" y2="0">
          <stop offset="0" stopColor="#E2D7BC" /><stop offset="1" stopColor="#EFE7D2" />
        </linearGradient>
        <linearGradient id="env-bottom" x1="0" y1="1" x2="0" y2="0">
          <stop offset="0" stopColor="#DED2B4" /><stop offset="1" stopColor="#EDE4CD" />
        </linearGradient>
        <linearGradient id="env-top" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#F3ECDA" /><stop offset="1" stopColor="#DFD4B8" />
        </linearGradient>
      </defs>

      <rect x="0" y="0" width="290" height="170" rx="6" fill="#E7DDC4" />
      <path className="env-flap env-flap-left"   d="M0 0 L145 88 L0 170 Z"      fill="url(#env-left)" />
      <path className="env-flap env-flap-right"  d="M290 0 L145 88 L290 170 Z"  fill="url(#env-right)" />
      <path className="env-flap env-flap-bottom" d="M0 170 L145 88 L290 170 Z"  fill="url(#env-bottom)" />
      <g className="env-flap-hinge">
        <path className="env-flap env-flap-top"  d="M0 0 L145 96 L290 0 Z"      fill="url(#env-top)" />
      </g>
      <rect x="0.5" y="0.5" width="289" height="169" rx="6" fill="none" stroke="#C9B687" />
    </svg>
  );
}
```

Those parchment hex values are deliberate: SVG gradient stops cannot read CSS custom properties reliably across browsers, and each flap needs a *different* shade of the same paper. They are all derived from the existing `--parchment` family.

- [ ] **Step 4: Swap it in**

In `TradeCeremony.tsx`, replace the `.envelope-body` and `.envelope-flap` divs with `<EnvelopeArt />`, keeping `.envelope` and `.envelope-seal` as they are. Import the component.

- [ ] **Step 5: Hinge the top flap**

In `ceremony.css`, delete the `.envelope-body`, `.envelope-body::after` and `.envelope-flap` rules and add:

```css
.env-art { position: absolute; inset: 0; width: 100%; height: 100%; filter: drop-shadow(0 14px 30px rgba(0,0,0,.38)); }
.env-flap-hinge { transform-origin: 145px 0px; transform: rotateX(180deg); transform-style: preserve-3d; }
.ceremony[data-stage='envelope'] .env-flap-hinge { animation: env-flap-close .46s .26s cubic-bezier(.5,0,.3,1) both; }
@keyframes env-flap-close { from { transform: rotateX(180deg); } to { transform: rotateX(0deg); } }
.ceremony[data-stage='ship'] .env-flap-hinge { transform: rotateX(0deg); }
```

- [ ] **Step 6: Run the full suite**

Run: `npx vitest run && npx tsc --noEmit`
Expected: all PASS.

- [ ] **Step 7: Commit**

```bash
cd ~/curia-app && git add frontend/src && git commit -m "feat(ceremony): a real envelope with four flaps, not an X on a box"
```

---

### Task 4: Make the fold read as paper

**Files:**
- Modify: `frontend/src/components/TradeCeremony.tsx`, `frontend/src/styles/ceremony.css`
- Test: `frontend/src/components/__tests__/TradeCeremony.test.tsx`

Three additions, in order of how much each matters: shading that tracks the fold angle, a contact shadow on the panel beneath, and a visible paper edge.

**The agreed fallback:** if the fold still reads stiff with all three in, **stop tuning gradients and hand-pose it** — draw the key poses as SVG paths and morph between them. Say so in your report rather than iterating.

- [ ] **Step 1: Write the failing test**

```tsx
  it('gives each folding panel a shading overlay and a contact shadow', () => {
    vi.useFakeTimers();
    const { container } = render(<TradeCeremony ticket={ticket} onDone={vi.fn()} />);
    act(() => { vi.advanceTimersByTime(4300); });
    expect(container.querySelectorAll('.fold-shade').length).toBeGreaterThanOrEqual(2);
    expect(container.querySelector('.fold-contact')).not.toBeNull();
    vi.useRealTimers();
  });
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run src/components/__tests__/TradeCeremony.test.tsx`
Expected: FAIL — no `.fold-shade`.

- [ ] **Step 3: Add the elements**

In `TradeCeremony.tsx`, inside each `.fold-panel`, after `.fold-inner`, add a shading overlay; and add one contact shadow inside `.fold`:

```tsx
                <div className="fold-shade" />
```

```tsx
            <div className="fold-contact" aria-hidden="true" />
```

- [ ] **Step 4: Light it**

Append to `ceremony.css`:

```css
.fold-shade { position: absolute; inset: 0; pointer-events: none; opacity: 0; background: linear-gradient(rgba(255,255,255,.34) 0%, rgba(255,255,255,.05) 26%, rgba(46,40,32,.22) 78%, rgba(46,40,32,.44) 100%); }
.fold-p2 .fold-shade { transform: scaleY(-1); }
.ceremony[data-stage='fold'] .fold-p2 .fold-shade { animation: shade-roll .62s cubic-bezier(.45,0,.2,1) both; }
.ceremony[data-stage='fold'] .fold-p0 .fold-shade { animation: shade-roll .62s .70s cubic-bezier(.45,0,.2,1) both; }
@keyframes shade-roll { 0% { opacity: 0; } 50% { opacity: 1; } 100% { opacity: .34; } }
.fold-edge, .fold-panel { position: relative; }
.fold-p0::after, .fold-p2::after { content: ''; position: absolute; left: 0; right: 0; height: 1px; background: rgba(255,255,255,.6); }
.fold-p0::after { bottom: 0; }
.fold-p2::after { top: 0; }
.fold-contact { position: absolute; left: 6%; right: 6%; top: 33.333%; height: 33.334%; pointer-events: none; opacity: 0; background: radial-gradient(120% 70% at 50% 0%, rgba(46,40,32,.42), rgba(46,40,32,0) 72%); z-index: 2; }
.ceremony[data-stage='fold'] .fold-contact { animation: contact-drop .62s .70s cubic-bezier(.45,0,.2,1) both; }
@keyframes contact-drop { 0% { opacity: 0; transform: scaleY(.4); } 100% { opacity: 1; transform: scaleY(1); } }
```

`.fold-p2`'s overlay is flipped because that panel folds upward — its crease is at its top edge, not its bottom, so the bright end has to be on the opposite side.

**Check the cascade.** `.fold-panel::after` may already be used for the existing crease highlight. Read `ceremony.css` before adding the `::after` rules above; if the pseudo-element is taken, use a real element instead of fighting it. Two rules claiming one pseudo-element silently drops one.

- [ ] **Step 5: Run the full suite**

Run: `npx vitest run && npx tsc --noEmit`
Expected: all PASS. Timing assertions must be untouched.

- [ ] **Step 6: Commit**

```bash
cd ~/curia-app && git add frontend/src && git commit -m "feat(ceremony): light the fold so it reads as paper"
```

---

### Task 5: Watch it, then ship

This task is the controller's, not an implementer's.

- [ ] **Step 1: Suites and the motion-gating check**

```bash
cd ~/curia-app/backend && .venv/bin/pytest -q
```

```bash
cd ~/curia-app/frontend && export PATH="$HOME/.nvm/versions/node/v20.20.2/bin:$PATH" && npx vitest run && npx tsc --noEmit
```

```bash
cd ~/curia-app/frontend && grep -rn "prefers-reduced-motion" src/ || echo "CLEAN"
```

- [ ] **Step 2: Scrub every frame**

At 375×667, using the clone-and-scrub probe:
- **The press** — confirm the arm never appears above the strike line, that the head is visible and reads as a typehead, that the platen looks like a cylinder holding the page, and that the arm alternates its approach angle.
- **The fold** — step through the full rotation and judge whether shading makes it read as paper. **If it reads stiff, invoke the hand-pose fallback rather than tuning.**
- **The envelope** — four flaps, the top one overlapping, the seal at its point.
- **The sticky header** — scroll to week 4 and confirm the total is still visible, and measure the pinned block's height against 667px.
- **The rolls** — confirm the new pace and that digits cascade.

- [ ] **Step 3: Merge, deploy, verify, push**

```bash
cd ~/curia-app && git checkout main && git merge --no-ff feat/press-and-envelope
```

```bash
cd ~/curia-app && export PATH="$HOME/.nvm/versions/node/v20.20.2/bin:$PATH" && railway up --service curia
```

Poll until the **bundle hash changes** — not just until a marker appears; Railway reports Online against the old deployment while building. Then confirm the new bundle carries `press-platen` and `env-flap`, push `main`, and append the outcome to `.superpowers/sdd/progress.md`.

---

## Self-Review

**Spec coverage:** §1 press → T2 · §2 envelope → T3 · §3 fold shading → T4 · §4 sticky header → T1 · §5 roll speed → T1. The verification rule is T5 Step 2, and is also stated at the top of the plan so no task can treat it as optional.

**Placeholders:** none — every code step carries its code, every run step its command and expected result. Three steps deliberately send the implementer to read existing CSS first (T1's tab padding, T4's `::after` collision, T2's surviving regression test) rather than guessing at contents this plan cannot see.

**Type consistency:** `Press({ striking, line })` and `EnvelopeArt()` are named identically where defined and consumed. Class names used in tests (`press-platen`, `press-arm`, `press-head`, `press-clip`, `env-flap`, `env-flap-top`, `fold-shade`, `fold-contact`, `board-head-sticky`) match the markup exactly.

**Known ripples, flagged inline:** T2 deletes `bar-hit-a`/`bar-hit-b` and must keep the `data-strike` regression test alive on a new element. T3 deletes three envelope rules. T4 may collide with an existing `.fold-panel::after`. Raw hex is permitted in two specific places and the reason is stated in the code comments, so a reviewer does not flag it as a token violation.
