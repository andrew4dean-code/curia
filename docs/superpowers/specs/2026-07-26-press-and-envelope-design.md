# Curia — The Press, the Envelope, and Two Fixes — Design

**Date:** 2026-07-26
**Status:** Approved in brainstorming.

## Why this exists

The craft pass shipped a trade ceremony I never watched at full speed. Andrew watched it,
and it was bad in ways a still frame would have caught immediately:

- The **typebar renders on top of the ticket** — a black diagonal line scored across the
  header and the typed text. Andrew's words: "the type stick is literally just a black stick."
- The **platen floats detached** above the page rather than holding it.
- The **envelope is a rectangle with an X drawn corner to corner.** Real envelope backs have
  four flaps meeting near the middle; two full diagonals read as a crossed-out box.
- The **fold reads as cardboard**, because every panel is one flat fill rotating in space.

All four are built from CSS box tricks — 3px divs, border-triangles, gradient lines — at
375px wide. That is why they read as shapes rather than objects.

Two unrelated fixes ride along: the Options board's month total scrolls out of view, and the
number rolls are too fast.

## The decision

Andrew chose **SVG with shading that tracks the fold** over real 3D (Three.js) and over
cutting the typewriter entirely.

Real 3D was rejected on two grounds: ~150KB+ into an offline-first PWA, and a raytraced
envelope sitting next to flat letterpress parchment cards would read as a different app.

**Hand-posing the fold — drawing key poses as SVG paths and morphing between them rather than
simulating a rotation — is the agreed fallback** if shading alone still reads stiff. Reach
for it rather than continuing to tune gradients.

## The verification rule

**Every frame of every animation in this spec is watched before it is called done.** The
root cause of this rework was not a technique choice; it was shipping motion nobody looked
at. The working method is the clone-and-scrub probe: catch the ceremony at a stage, copy its
markup into an element mounted outside React's root so nothing unmounts it, pause
`getAnimations({subtree:true})`, and step `currentTime` through the animation.

A task that cannot be visually verified is not finished, and no test in this suite can
substitute — jsdom computes no animation.

---

## 1. The press

Drawn as one inline SVG inside the ceremony scene, replacing `.platen` and `.typebar`.

### Platen

A cylinder, not a pill: a rounded rect filled with a **horizontal** gradient running dark at
both ends to a lit band slightly above centre, plus a soft specular arc along the upper third.
Below it, a shadow falls onto the page — a blurred dark band, widest directly under the
roller, fading downward.

### The page meets the roller

The page's top edge **curls behind the platen** rather than butting against it: the sheet's
top is a shallow curve, and the top ~10px sits behind the cylinder in z-order. The roller must
look like it is gripping paper.

### Typebar

- A **tapered arm** — narrow at the pivot, thickening toward the head — not a constant-width
  bar.
- A **typehead** at the striking end: a small rounded block, angled to the arm, with a faint
  character face on its front.
- **Clipped to below the current text line.** This is the defect that made Andrew notice.
  The arm rises from the bottom of the scene and its head stops at the line being typed;
  no part of the arm may ever be drawn across the ticket's header or its typed text. Enforce
  it with an SVG clip path bounded at the baseline, not with z-order alone.
- The strike still fires on roughly every third character, for the reasons already
  established: at 48ms per character, striking every one is both expensive and frantic.

---

## 2. The envelope

Drawn as one inline SVG, replacing the `.envelope-body` / `.envelope-flap` divs.

Four flaps in correct back-of-envelope geometry:

- **Bottom flap** — a trapezoid rising from the bottom edge to just below centre.
- **Left and right side flaps** — triangles from each side edge meeting near the centre line.
- **Top flap** — a triangle descending from the top edge, drawn **last** so it overlaps the
  other three, which is what makes an envelope look closed.

Each flap carries its own gradient, angled to its own fold, so the four planes are
distinguishable. Seams are the flap edges themselves — there is no drawn X.

The top flap closes on its own hinge at the top edge. The wax seal presses at its point,
reusing the existing press-and-dent behaviour.

---

## 3. The fold reads as paper

The current fold rotates flat-filled panels. Three additions, in order of how much they matter:

1. **Shading that tracks the angle.** Each panel carries an overlay whose gradient runs from
   bright at the crease to shadow at the panel's free edge, and whose intensity rises as the
   panel approaches edge-on and eases off as it lands. A panel at 90° should be markedly
   darker than one at 0° or 180°.
2. **A contact shadow** cast onto the panel underneath, tightening and darkening as the
   folding panel comes down onto it.
3. **A visible paper edge** — a hairline lighter than the face along the folding edge, so the
   sheet has thickness rather than reading as a decal.

If the fold still looks stiff with all three in, **stop tuning and hand-pose it** per the
agreed fallback.

---

## 4. Sticky month header on the Options board

The month name, both chevrons, and the "collected this month" total pin to the top of the
Options tab and stay put while the week list scrolls. Andrew's ask was the total; the month
controls come along so months can still be changed from anywhere in the list.

The pinned block sits above the scrolling weeks, takes the page background so rows do not
show through, and carries a soft bottom edge so it reads as a layer rather than a seam. It
must not cover the first week card at rest, and must respect the safe-area inset already
established for this app.

---

## 5. Slower number rolls

Andrew asked for "more like Robinhood" — currently the digits snap.

- `--roll-hero`: `0.62s → 1.25s`
- `--roll-detail`: `1.15s → 1.9s`
- Per-digit stagger: `0.02s → 0.035s`, so the digits cascade left-to-right rather than
  landing together.

These are starting values, tuned by eye at the visual check, not fixed contract.

---

## Non-goals

- **No Three.js, no WebGL, no 3D library.** Explicitly rejected — bundle cost and aesthetic
  clash.
- No image, video, or Lottie assets. SVG, CSS and existing components only.
- **No `prefers-reduced-motion` gating anywhere**, and no setting to disable animation. This
  instruction has been given repeatedly.
- No change to ceremony *timings*. `STAGE_MS` still sums to 8000ms and the settle ceremony's
  assignment branch still totals 6400ms; both are asserted by tests.
- No change to what any ceremony means, and no change to any write path.
- No backend change of any kind.

## Testing

Shape and structure can be asserted; motion cannot.

**Unit-tested (Vitest):**
- The press SVG renders a platen, an arm and a typehead, and the typebar strike still
  alternates its restart attribute through printing (the existing regression guard, which
  must survive the rewrite).
- The envelope SVG renders four distinct flap paths.
- The sticky header renders the month controls and the total, and the total is still the
  Odometer carrying the correct `data-value`.
- Roll durations resolve from the tokens, so a future edit that drops one is caught.
- Existing timing assertions — 8000ms total, 6400ms assignment branch — pass unchanged.

**Verified visually, by scrubbing, at 375×667 — non-negotiable per the verification rule:**
the typebar never crossing the ticket, the platen gripping the page, the four envelope flaps,
the fold's shading through its full rotation, the sticky header while scrolling to week 4,
and the new roll speed.

## Risks

- **The fold may still read stiff.** This is the known-hard item and it already failed once.
  The fallback is agreed and specific: hand-pose it.
- **A convincing typewriter at 375px is hard.** If the press cannot be made to look like a
  machine rather than parts, say so plainly rather than shipping parts again — cutting it is
  a better outcome than a second bad version.
- **A sticky header eats vertical space** on a 667px-tall screen. If it costs more than about
  a fifth of the viewport, trim it rather than letting the week list become a slot.
