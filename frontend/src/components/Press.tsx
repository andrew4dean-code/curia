// THE PRESS -- and the whole point of this file is that the machine is the RIGHT WAY UP.
//
// It used to sit at the top of the scene with the sheet hanging DOWN out of it. That put the
// strike point and the printed text in two different places and forced two requirements that
// cannot both be met: "don't draw across the ticket" (so the arm was clipped, and became a
// severed stub floating in mid-page attached to nothing) versus "show a bar swinging from the
// machine" (so it had to reach the machine, and then it lay across the type). Every round
// traded one for the other. The owner rejected it three times.
//
// A REAL TYPEWRITER. The platen is at the BOTTOM. The sheet wraps around it and stands UP out
// of the machine. Where the paper meets the roller is the NIP, and the nip is at ONE FIXED
// SCENE Y forever. The line being typed sits AT the nip; everything already typed has rolled
// UP above it; nothing is ever typed above it. When a line finishes, the whole sheet steps up
// by exactly one line pitch and the next line arrives at the nip. The bar swings up from
// inside the machine, strikes at the nip, and drops back into the basket.
//
// WHAT THAT BUYS, AND WHAT MUST NOT BE UNDONE BY ACCIDENT:
//   * The arm strikes at ONE constant y for every line index, so there is no per-line vertical
//     registration to drift. BASE_STRIKE_Y, the 24-per-line offsets, the measured-y feed into
//     the arm and the per-line pivot tracking are all GONE. The arm has no vertical term left.
//   * The arm can never cross finished text, because finished text is above the nip and the
//     arm lives below it. THERE IS NO CLIP AND NO MASK ANYWHERE IN THIS FILE. #press-clip and
//     #arm-fade are deleted, not weakened. If a clip ever looks necessary again, the geometry
//     has gone wrong -- fix the geometry.
//   * Everything below the nip is the machine, painted opaque over the sheet (`.press` is
//     z-index 3 over `.ticket-wrap`), so the part of the sheet still wrapped round the platen
//     is hidden by the machine rather than by a clip on the paper. That is why the body has to
//     be as tall as it is: see MACHINE_H.
//   * The arm is painted ON the machine at every frame of its swing, so it is never a severed
//     stub in mid-air and there is never a gap between arm and body.
//
// COORDINATES. `.press` is `left:-30px; right:-30px; top: NIP_Y; height: PRESS_VIEW_H` over the
// 290px scene, with a viewBox of the same numbers, so ONE USER UNIT IS ONE CSS PIXEL IN BOTH
// AXES and svg y 0 IS THE NIP:
//
//       scene x = svg x - PRESS_OVERHANG        scene y = svg y + NIP_Y
//
//   svg y   0        THE NIP. Nothing above this line is ever painted by this file.
//   svg y   0..46    the platen cylinder, its top edge tangent to the paper
//   svg y   2..46    the two end knobs, projecting past the paper on both sides
//   svg y  44..56    the ribbon
//   svg y  30..148   the type basket well, where the bars live
//   svg y 146..210   the front shell, with the comb the bars rise through and the key tops
//
// NIP_Y is duplicated in ceremony.css as `.press { top: ... }` and the test suite pins the two
// together; there is no way to write a CSS `top` from a TS constant without an inline style,
// and an inline style on `.press` would fight the withdraw animation's transform.
export const NIP_Y = 170;

// The machine has to cover the sheet from the nip down to the sheet's own bottom edge, or the
// part of the page that is supposed to be wrapped around the platen shows below the machine.
// That distance is NOT a free choice: at the moment line 0 is at the nip the sheet extends
// (sheet height - line 0's drop) below it, i.e. 288 - 89.5 = 198.5px, MEASURED in headless
// Chrome (the ticket is pinned to 288px so the fold packet is a third of it; line 0's box
// bottoms out 89.5px below the ticket's top edge: 2px border + 22 padding + 28.5 head +
// 10 margin + 27 line). It does not depend on NIP_Y -- moving the nip moves the sheet with it.
// 210 leaves 11.5px of margin, and the margin can only grow: a taller header pushes line 0 down,
// which REDUCES the feed and lifts the sheet's bottom edge.
export const PRESS_VIEW_W = 350;
export const PRESS_VIEW_H = 210;
export const PRESS_OVERHANG = 30;
export const PRESS_HOME_X = PRESS_VIEW_W / 2; // 175 == the scene's centre line
const SCENE_W = PRESS_VIEW_W - PRESS_OVERHANG * 2; // 290, and .ceremony-scene agrees

// The bar. Authored AT CONTACT -- the untransformed pose is the strike -- so the head's top
// edge is the one number that matters and it is 1.5px BELOW the nip, not flush with it: the
// per-character tilt rotates the slug about its own contact point, and at the largest tilt
// (8 degrees, see tiltForChar) a 16px-wide head lifts a corner 16/2 * sin(8deg) = 1.11px. 1.5
// keeps even that corner below the nip, so no part of the arm is ever painted on the page.
const HEAD_TOP = 1.5;
const HEAD_W = 16;
const HEAD_H = 14;
// The bar's rotation centre. It is NOT a real lever pivot: a type bar swings in a plane
// perpendicular to the front view, so from the front it mostly RISES. A pure rotation big
// enough to drop the head into the basket would swing it 116px sideways. The rest pose is
// therefore a large translateY with a small rotation about this point (see press-hit in
// ceremony.css), which puts the head at svg y ~58 -- inside the basket, clear of the platen.
const PIVOT_Y = 152;
const SHAFT_TOP = HEAD_TOP + HEAD_H; // the shaft starts where the head ends

// Per-character tilt of the type slug, derived from the character code, so the same letter
// always presents the same face. This is what used to be a two-keyframe alternation (one
// leaning each way) -- and alternating the ARM's rest angle is precisely what made the machine
// look random: it never came back to the same place twice. The swing is identical for every
// character now and only the slug at the tip differs. It rotates about its own contact point,
// so a tilt can never move the print position.
export function tiltForChar(glyph: string): number {
  const code = glyph.charCodeAt(0);
  if (!Number.isFinite(code)) return 0;
  const mag = 4 + (code % 5); // 4..8 degrees; never 0, or that character would show no face
  return code % 2 === 0 ? mag : -mag;
}

function Knob({ cx }: { cx: number }) {
  return (
    <g className="press-knob">
      <circle cx={cx} cy="24" r="22" fill="url(#platen-knob)" />
      <circle cx={cx} cy="24" r="21" fill="none" stroke="#0d0b09" strokeWidth="1.6" opacity=".8" />
      <circle cx={cx} cy="24" r="8.5" fill="#191510" />
      <circle cx={cx} cy="24" r="3" fill="#5f5648" />
    </g>
  );
}

// The rest of the type bars, at rest, low in the basket. They are short tips rather than whole
// bars on purpose: the ACTIVE bar tracks the carriage horizontally (the column is measured off
// the live DOM), so a fan of full-length bars fixed at the centre would visibly disagree with
// it every time the carriage moved. Tips read as "the other bars, down in the basket" and have
// no angle to disagree about. The arc is lowest in the middle, as a real basket is.
function BasketBars() {
  const bars = [];
  for (let i = -6; i <= 6; i++) {
    const x = PRESS_HOME_X + i * 18.5;
    const lift = Math.abs(i) * 2.6; // the outer bars sit higher, following the basket's curve
    bars.push(
      <rect
        key={i}
        className="press-rest-bar"
        x={x - 3.4}
        y={124 - lift}
        width="6.8"
        height={26 + lift}
        rx="2.4"
        fill="url(#arm-steel)"
        opacity=".92"
      />,
    );
  }
  return <g className="press-basket-bars">{bars}</g>;
}

export function Press({
  striking,
  glyph,
  x,
}: {
  // 'idle' before the first character: it matches neither strike rule, so the bar holds its
  // base rest pose -- down in the basket -- instead of firing a strike at a page that has not
  // arrived yet. The arm is VISIBLE the whole time either way; it is a part of the machine,
  // parked inside it, not something that appears out of nowhere at the first keystroke.
  striking: number | 'idle';
  glyph: string;
  // the carriage column, in scene pixels, measured off the live DOM. null = nothing measured
  // yet, which parks the bar on the scene's centre line.
  x: number | null;
}) {
  // clamped so a wild measurement can never walk the bar off the machine
  const column = x === null ? SCENE_W / 2 : Math.min(SCENE_W - 8, Math.max(8, x));
  const dx = Math.round((column + PRESS_OVERHANG - PRESS_HOME_X) * 100) / 100;
  const tilt = tiltForChar(glyph);

  return (
    <svg
      className="press"
      viewBox={`0 0 ${PRESS_VIEW_W} ${PRESS_VIEW_H}`}
      preserveAspectRatio="none"
      aria-hidden="true"
    >
      <defs>
        <linearGradient id="platen-face" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#14110e" />
          <stop offset="0.16" stopColor="#3b342b" />
          <stop offset="0.46" stopColor="#4e4639" />
          <stop offset="0.8" stopColor="#2a251e" />
          <stop offset="1" stopColor="#14110e" />
        </linearGradient>
        {/* the roll of the cylinder: bright along the top edge where the paper leaves it,
            falling away to black underneath. Without this the platen is a flat bar. */}
        <linearGradient id="platen-roll" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#ffffff" stopOpacity="0.30" />
          <stop offset="0.14" stopColor="#ffffff" stopOpacity="0.10" />
          <stop offset="0.55" stopColor="#000000" stopOpacity="0.10" />
          <stop offset="1" stopColor="#000000" stopOpacity="0.46" />
        </linearGradient>
        <radialGradient id="platen-knob" cx="0.36" cy="0.3" r="0.84">
          <stop offset="0" stopColor="#6f6557" />
          <stop offset="0.5" stopColor="#3a332a" />
          <stop offset="1" stopColor="#100e0b" />
        </radialGradient>
        <linearGradient id="press-shell" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#3a332a" />
          <stop offset="0.42" stopColor="#241f19" />
          <stop offset="1" stopColor="#12100c" />
        </linearGradient>
        <linearGradient id="press-front-face" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#4a4237" />
          <stop offset="0.3" stopColor="#332c24" />
          <stop offset="1" stopColor="#17140f" />
        </linearGradient>
        {/* the well the bars live in: dark at the bottom, so the basket has depth and the
            raised bar reads against it */}
        <linearGradient id="press-well" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#0b0a08" stopOpacity="0.72" />
          <stop offset="0.62" stopColor="#0b0a08" stopOpacity="0.34" />
          <stop offset="1" stopColor="#0b0a08" stopOpacity="0" />
        </linearGradient>
        <linearGradient id="arm-steel" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#171410" />
          <stop offset="0.42" stopColor="#665c4c" />
          <stop offset="0.62" stopColor="#4a4237" />
          <stop offset="1" stopColor="#171410" />
        </linearGradient>
        <linearGradient id="ribbon-ink" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#241f19" />
          <stop offset="0.5" stopColor="#0e0c09" />
          <stop offset="1" stopColor="#2a241c" />
        </linearGradient>
      </defs>

      {/* 1. THE BODY. Opaque, and wider than the paper on both sides -- that overhang is the
             single strongest cue that there is a machine behind the page rather than a stick
             behind a card. It covers every pixel from the nip down, which is what keeps the
             wrapped part of the sheet out of sight without clipping the paper. */}
      <g className="press-body">
        <rect x="-8" y="22" width={PRESS_VIEW_W + 16} height={PRESS_VIEW_H - 22} rx="16" fill="url(#press-shell)" />
        <rect className="press-well" x="34" y="26" width="282" height="122" rx="10" fill="url(#press-well)" />
      </g>

      {/* 2. THE PLATEN. Its top edge IS the nip: the sheet stands up out of it and, at that
             line, curves away behind it. Drawn AFTER the body so the cylinder sits proud. */}
      <g className="press-platen">
        <rect x="18" y="0" width="314" height="46" rx="23" fill="url(#platen-face)" />
        <rect x="18" y="0" width="314" height="46" rx="23" fill="url(#platen-roll)" />
        {/* the hard bright line along the tangent, where paper leaves rubber */}
        <rect className="press-nip-line" x="22" y="0" width="306" height="1.6" fill="#b9ad92" opacity=".5" />
        <Knob cx={18} />
        <Knob cx={332} />
      </g>

      {/* 3. THE RIBBON, sitting just under the strike point where a real one does. */}
      <rect className="press-ribbon" x="40" y="44" width="270" height="11" rx="2" fill="url(#ribbon-ink)" opacity=".9" />

      {/* 4. the other bars, at rest in the basket */}
      <BasketBars />

      {/* 5. THE STRIKING BAR. Authored at contact; ceremony.css swings it back to rest and
             fires it forward again. The carriage offset is the ONLY transform attribute it
             carries -- there is no vertical term any more, because the nip does not move.
             The translate lives on an inner <g> rather than on .press-arm itself because the
             swing sets a CSS `transform` on .press-arm, and a CSS transform overrides an SVG
             transform ATTRIBUTE on the same element. The rotation origin follows the carriage
             in x for the same reason it always did: the bar must swing about the point its
             own shaft stands on. In y it is a constant now -- PIVOT_Y -- so the lever is the
             same length on every line by construction, not by tracking. */}
      <g
        className="press-arm"
        data-strike={striking}
        style={{ transformOrigin: `${PRESS_HOME_X + dx}px ${PIVOT_Y}px` }}
      >
        <g className="press-carrier" transform={`translate(${dx}, 0)`}>
          <path
            className="press-shaft"
            d={`M${PRESS_HOME_X - 3.6} ${PIVOT_Y} L${PRESS_HOME_X - 7} ${SHAFT_TOP} L${PRESS_HOME_X + 7} ${SHAFT_TOP} L${PRESS_HOME_X + 3.6} ${PIVOT_Y} Z`}
            fill="url(#arm-steel)"
          />
          <g className="press-tilt" transform={`rotate(${tilt} ${PRESS_HOME_X} ${HEAD_TOP})`}>
            <rect
              className="press-head"
              x={PRESS_HOME_X - HEAD_W / 2}
              y={HEAD_TOP}
              width={HEAD_W}
              height={HEAD_H}
              rx="3"
              fill="#241f19"
            />
            <rect x={PRESS_HOME_X - 5} y={HEAD_TOP + 3.5} width="10" height="6.5" rx="1.5" fill="#4a4237" />
          </g>
        </g>
      </g>

      {/* 6. THE FRONT SHELL, painted last so the bar rises THROUGH the comb rather than
             standing on top of the machine. The bar's base at full rest reaches svg y ~208,
             which is behind this, so the shaft never ends in mid-air at either extreme. */}
      <g className="press-front">
        <path
          className="press-front-face"
          d={`M-8 158 Q-8 146 8 146 L${PRESS_VIEW_W - 8} 146 Q${PRESS_VIEW_W + 8} 146 ${PRESS_VIEW_W + 8} 158 L${PRESS_VIEW_W + 8} ${PRESS_VIEW_H} L-8 ${PRESS_VIEW_H} Z`}
          fill="url(#press-front-face)"
        />
        <rect x="-8" y="146" width={PRESS_VIEW_W + 16} height="1.6" fill="#7a6f5c" opacity=".45" />
        {/* the comb: the slots the bars pass through */}
        <g className="press-comb">
          {Array.from({ length: 21 }, (_, i) => (
            <rect key={i} x={PRESS_HOME_X - 150 + i * 15} y="147" width="4" height="9" rx="1.6" fill="#0a0907" opacity=".72" />
          ))}
        </g>
        {/* two rows of key tops. Nothing here is functional -- it is the silhouette, and the
            silhouette is what the owner has been telling us is missing. */}
        <g className="press-keys">
          {Array.from({ length: 11 }, (_, i) => (
            <circle key={`a${i}`} cx={PRESS_HOME_X - 140 + i * 28} cy="176" r="8.5" fill="#2b251e" stroke="#6b6152" strokeWidth="1.1" />
          ))}
          {Array.from({ length: 10 }, (_, i) => (
            <circle key={`b${i}`} cx={PRESS_HOME_X - 126 + i * 28} cy="196" r="8.5" fill="#2b251e" stroke="#6b6152" strokeWidth="1.1" />
          ))}
        </g>
      </g>
    </svg>
  );
}
