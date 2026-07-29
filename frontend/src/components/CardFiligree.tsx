/** Engraved corner scrollwork for the wheel card, drawn in while the dial's hand travels
 *  and faded once it lands.
 *
 *  It lives on the CARD, not on the dial. The dial face is already dense — sixty
 *  graduations, guilloché, three bezel rules, four labels — and every attempt to ornament
 *  it read as dirt, because there is nowhere on it for a line to be that isn't already
 *  occupied. The card's margins are empty, which is where ornament belongs, and it is the
 *  way a share certificate is actually laid out: plain instrument, ornamented border.
 *
 *  Everything here is stroked, not filled. A stroked path can draw itself on via
 *  stroke-dashoffset; a tapered fill cannot, and being drawn is the whole effect. The
 *  weight varies between paths instead of within them, which is also how engraved
 *  scrollwork reads: a heavier spine with hairlines around it.
 *
 *  pathLength="100" normalises every path so one dash rule covers all of them regardless
 *  of their true arc length — otherwise each would need its own measured dasharray and
 *  they would draw at wildly different speeds.
 */

/** One corner, authored in a 100x100 box anchored top-left. The other three are this,
 *  mirrored — a corner that differs from its opposite reads as a mistake, not variety. */
const STROKES: Array<{ d: string; w: number; delay: number }> = [
  // the spine: a quarter sweep from the left edge up to the top edge
  { d: 'M 6 78 C 6 34 34 6 78 6', w: 1.5, delay: 0 },
  // hairline running inside it
  { d: 'M 14 80 C 14 42 42 14 80 14', w: 0.6, delay: 140 },
  // scrolled terminal at the lower end
  { d: 'M 6 78 C -3 88 3 99 13 96 C 20 94 20 85 13 84', w: 1.1, delay: 320 },
  // flick at the upper end
  { d: 'M 78 6 C 90 6 97 11 99 19', w: 1.1, delay: 400 },
  // three leaves off the spine, each a closed lens drawn as a stroke
  { d: 'M 22 52 C 12 44 12 32 24 30 C 22 42 26 46 24 52 Z', w: 0.7, delay: 520 },
  { d: 'M 38 30 C 32 18 38 8 49 10 C 41 19 42 25 40 31 Z', w: 0.7, delay: 640 },
  { d: 'M 57 17 C 55 7 63 1 71 4 C 64 9 62 13 60 18 Z', w: 0.7, delay: 760 },
  // a fine tendril curling inward
  { d: 'M 30 66 C 42 62 50 52 52 40', w: 0.5, delay: 880 },
];

/* Four separate square SVGs, one pinned to each corner — NOT one stretched box.
   Stretching a single 100x100 viewBox across a card that is twice as tall as it is wide
   does not put small scrolls in the corners; it inflates them into enormous elongated
   arcs that run over the title and straight through the dial. It looked like the card had
   been scribbled on. Each corner now keeps its own square and its own proportions, and is
   mirrored into place. */
const CORNERS = [
  { key: 'tl', className: 'fil-tl' },
  { key: 'tr', className: 'fil-tr' },
  { key: 'bl', className: 'fil-bl' },
  { key: 'br', className: 'fil-br' },
];

export function CardFiligree({ drawMs, holdMs, fadeMs }: { drawMs: number; holdMs: number; fadeMs: number }) {
  return (
    <div className="card-filigree" aria-hidden="true" data-testid="card-filigree">
      {CORNERS.map((c) => (
        <svg key={c.key} className={`fil-corner ${c.className}`} viewBox="0 0 100 100" data-corner={c.key}>
          <g>
            {STROKES.map((s, i) => (
              <path
                key={i}
                d={s.d}
                pathLength={100}
                strokeWidth={s.w}
                style={{
                  // Each stroke draws over what is left of the sweep after its own delay,
                  // so the last one still lands as the hand does rather than after it.
                  animationDuration: `${Math.max(200, drawMs - s.delay)}ms, ${fadeMs}ms`,
                  animationDelay: `${s.delay}ms, ${drawMs + holdMs}ms`,
                }}
              />
            ))}
          </g>
        </svg>
      ))}
    </div>
  );
}
