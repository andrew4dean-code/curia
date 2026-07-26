// THE PRESS: platen roller, paper rail, and one swinging typebar.
//
// SILHOUETTE FIRST. The owner's complaint has twice been about a "stick": a bare
// tapered shaft with nothing around it reads as an abstract line, not as a
// typewriter. So the machine is now drawn wider than the card it prints on --
// the platen's end knobs and the rail both project past the paper, which is the
// single strongest cue that there is a machine behind the page. The scene is
// 290px inside a 375px viewport, i.e. 42.5px of margin each side, so PRESS_OVERHANG
// of 30px each side fits with room to spare.
//
//   viewBox 0 0 350 260, drawn into a box that is `left:-30px; right:-30px` over the
//   290px scene and 260px tall (see ceremony.css), so 1 user unit == 1px in BOTH
//   axes and nothing is stretched. `top:-34px` puts svg y=34 on the card's top edge.
//
//       scene x = svg x - PRESS_OVERHANG        scene y = svg y - 34
//
//   svg y  5..35   the platen body            (scene -29..1, above the card)
//   svg y  1..39   the end knobs              (scene x -29..9 and 281..319: past the card)
//   svg y 33..43   the nip, where paper meets roller
//   svg y 44..49   the rail + its two margin stops (full width, also past the card)
//
// LINE_PITCH is the real rendered height of a `.ticket-line` (see ceremony.css),
// not a guess: font-size 14px with the inherited body line-height of 1.5 gives a
// 21px content line, plus the rule's own 3px top/bottom padding = 27px. Confirmed
// by rendering three stacked `.ticket-line` elements in a real browser and reading
// their bounding rects: consecutive lines land exactly 27px apart. (Every line now
// holds its final width from frame 0 via the hidden ghost span in TradeCeremony, so
// a partly-typed line is exactly as tall as a finished one -- before that, an empty
// line fell back to `min-height: 1.45em` = 20.3px and every line below it shifted
// 0.7px the moment it got its first character.)
//
// LINE_GAP_OFFSET pushes the strike point from the *top* of the current line down
// past that line's own glyphs, landing in the gap before the next line starts:
// 3px padding-top + 21px line content = 24px is exactly where this line's text ends
// and its bottom padding begins. That's "just under the baseline" without yet
// touching the next line.
//
// FEED_ROLL is the other half of that sum, and leaving it out cost 3px of registration
// per line. The page does not sit still while it is typed: ceremony.css rolls .ticket
// up by `var(--feed) * -3px` at every line break, and --feed IS this `line` index. So
// line n is PAINTED 3n px above where it is laid out, and the strike point has to come
// down 27 - 3 = 24px per line, not 27. At 27 the head sat 3px low on line two and 6px
// low on line three -- a fifth of a line pitch, on the very ticket shape (three lines:
// option sells, closing trades) the app emits most.
//
// The arm is clipped to a narrow band starting at the strike line so it can only
// ever read as a typebar swinging up into the paper -- never as a shaft lying
// across the ticket. The head is authored 2px BELOW the top of that band, not flush
// with it: the per-character tilt rotates the head about its own contact point, and
// a head sitting flush on the clip edge would have a corner shaved off by the clip
// at every non-zero tilt.
//
// The whole assembly is translated down by the same per-line offset that drives
// strikeY, so the head stays locked to the top of the clip band at every line index.
// That translate lives on an inner <g> (.press-carrier), not on .press-arm itself,
// because the swing animation sets a CSS `transform` on .press-arm and a CSS
// transform on an element overrides any SVG `transform` attribute on that same
// element -- nesting keeps the two from fighting.
//
// REGISTRATION. .press-carrier also carries the horizontal carriage offset, so the
// head lands on the column the text is actually at. The x it is given is MEASURED
// from the live DOM (TradeCeremony reads the struck glyph's own box against the
// scene's) and never computed from a character pitch: Space Mono is fetched from
// Google Fonts and this is an offline-first PWA, so on a cold or offline first run
// the fallback monospace has a completely different advance and every hardcoded
// pitch would put the hammer visibly off the text. `x === null` means "nothing
// measured yet" and parks the arm on the scene's centre line.
//
// Because .press-carrier is INSIDE .press-arm, .press-arm's own rotation origin has
// to follow it, or the bar would swing about a pivot the shaft no longer stands on.
// That is the inline transform-origin below: .press-arm is a direct child of <svg>
// with no ancestor transform, so `transform-box: view-box` resolves those lengths
// straight into viewBox units.
const LINE_PITCH = 27;
const FEED_ROLL = 3; // keep in step with `--feed * -3px` in ceremony.css
const LINE_STEP = LINE_PITCH - FEED_ROLL;
const LINE_GAP_OFFSET = 24;
const BASE_STRIKE_Y = 96 + LINE_GAP_OFFSET;
const HEAD_Y = BASE_STRIKE_Y + 2;
const PIVOT_Y = 258;

export const PRESS_VIEW_W = 350;
export const PRESS_OVERHANG = 30;
export const PRESS_HOME_X = PRESS_VIEW_W / 2; // 175 == the scene's centre line
const SCENE_W = PRESS_VIEW_W - PRESS_OVERHANG * 2; // 290, and .ceremony-scene agrees

// Per-character tilt of the type slug, derived from the character code, so the same
// letter always presents the same face. This is what used to be a two-keyframe
// alternation (press-hit-a leaned one way, press-hit-b the other) -- and alternating
// the ARM's rest angle is precisely what made the machine look random: the arm never
// came back to the same place twice. The arm's swing is now identical for every
// character and only the slug at the tip differs. It rotates about its own contact
// point, so a tilt can never move the print position.
export function tiltForChar(glyph: string): number {
  const code = glyph.charCodeAt(0);
  if (!Number.isFinite(code)) return 0;
  const mag = 4 + (code % 5); // 4..8 degrees; never 0, or that character would show no face at all
  return code % 2 === 0 ? mag : -mag;
}

function Knob({ cx }: { cx: number }) {
  return (
    <g className="press-knob">
      <circle cx={cx} cy="20" r="19" fill="url(#platen-knob)" />
      <circle cx={cx} cy="20" r="18.2" fill="none" stroke="#0d0b09" strokeWidth="1.4" opacity=".75" />
      <circle cx={cx} cy="20" r="7.5" fill="#191510" />
      <circle cx={cx} cy="20" r="2.6" fill="#5a5245" />
    </g>
  );
}

export function Press({
  striking,
  line,
  glyph,
  x,
}: {
  // 'idle' before the first character: it matches neither strike rule, so the bar
  // holds .press-arm's base rest pose instead of firing a strike at mount, at a page
  // that is still flying up into the platen with nothing printed on it yet.
  striking: number | 'idle';
  line: number;
  glyph: string;
  x: number | null;
}) {
  const strikeY = BASE_STRIKE_Y + line * LINE_STEP;
  const armOffset = line * LINE_STEP;
  // clamped so a wild measurement can never walk the bar off the machine
  const column = x === null ? SCENE_W / 2 : Math.min(SCENE_W - 8, Math.max(8, x));
  const dx = Math.round((column + PRESS_OVERHANG - PRESS_HOME_X) * 100) / 100;
  const tilt = tiltForChar(glyph);

  return (
    <svg className="press" viewBox={`0 0 ${PRESS_VIEW_W} 260`} preserveAspectRatio="none" aria-hidden="true">
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
        {/* the nip: the hard, tight line of shadow where the sheet passes under the
            roller. Without it the platen floats above the page instead of gripping it. */}
        <linearGradient id="platen-nip" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#17130f" stopOpacity="0.52" />
          <stop offset="0.35" stopColor="#17130f" stopOpacity="0.22" />
          <stop offset="1" stopColor="#17130f" stopOpacity="0" />
        </linearGradient>
        <radialGradient id="platen-knob" cx="0.36" cy="0.3" r="0.82">
          <stop offset="0" stopColor="#6f6557" />
          <stop offset="0.5" stopColor="#3a332a" />
          <stop offset="1" stopColor="#100e0b" />
        </radialGradient>
        <linearGradient id="rail-steel" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#6a6153" />
          <stop offset="0.45" stopColor="#2f2a22" />
          <stop offset="1" stopColor="#14110e" />
        </linearGradient>
        <linearGradient id="arm-steel" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#171410" />
          <stop offset="0.45" stopColor="#5a5245" />
          <stop offset="1" stopColor="#171410" />
        </linearGradient>
        <clipPath id="press-clip">
          <rect x="0" y={strikeY} width={PRESS_VIEW_W} height="70" />
        </clipPath>
        {/* The clip band keeps the bar off the page, but on its own it ends the shaft
            in a hard horizontal cut -- a guillotined line across the ticket, which is
            precisely what reads as "a stick". The shaft is masked to fade out well
            before that edge instead, so the bar recedes into the machine rather than
            stopping. Authored in the CARRIER's local space (the mask is on the shaft,
            inside the per-line translate), so these are the base constants and carry
            no line term -- unlike the clip above, which sits outside it. */}
        <linearGradient id="arm-fade-g" gradientUnits="userSpaceOnUse" x1="0" y1={BASE_STRIKE_Y + 16} x2="0" y2={BASE_STRIKE_Y + 62}>
          <stop offset="0" stopColor="#ffffff" />
          <stop offset="1" stopColor="#000000" />
        </linearGradient>
        <mask id="arm-fade" maskUnits="userSpaceOnUse" x="-260" y="0" width="870" height="320">
          <rect x="-260" y="0" width="870" height="320" fill="url(#arm-fade-g)" />
        </mask>
      </defs>

      <rect className="press-cast" x="0" y="35" width={PRESS_VIEW_W} height="26" fill="url(#platen-cast)" />
      <rect className="press-nip" x="22" y="33" width="306" height="10" fill="url(#platen-nip)" />

      {/* the bar is painted before the machine, so the roller and the rail always
          pass in front of it -- a typebar disappears under the platen, it never
          crosses it. */}
      <g
        className="press-arm"
        data-strike={striking}
        clipPath="url(#press-clip)"
        style={{ transformOrigin: `${PRESS_HOME_X + dx}px ${PIVOT_Y}px` }}
      >
        <g className="press-carrier" transform={`translate(${dx}, ${armOffset})`}>
          <path
            className="press-shaft"
            mask="url(#arm-fade)"
            d={`M${PRESS_HOME_X - 3} ${PIVOT_Y} L${PRESS_HOME_X - 8} 130 L${PRESS_HOME_X + 8} 130 L${PRESS_HOME_X + 3} ${PIVOT_Y} Z`}
            fill="url(#arm-steel)"
          />
          <g className="press-tilt" transform={`rotate(${tilt} ${PRESS_HOME_X} ${HEAD_Y})`}>
            <rect className="press-head" x={PRESS_HOME_X - 8} y={HEAD_Y} width="16" height="12" rx="3" fill="#241f19" />
            <rect x={PRESS_HOME_X - 5} y={HEAD_Y + 3} width="10" height="6" rx="1.5" fill="#3c352c" />
          </g>
        </g>
      </g>

      <g className="press-platen">
        <rect x="20" y="5" width="310" height="30" rx="15" fill="url(#platen-face)" />
        <rect x="34" y="8" width="282" height="11" rx="5.5" fill="url(#platen-spec)" />
        {/* the end knobs: the platen's hubs, sticking out past the paper on both
            sides. This is the silhouette. */}
        <Knob cx={20} />
        <Knob cx={330} />
      </g>

      {/* the paper rail, edge to edge and past the card on both sides, with the two
          margin stops sitting on it where the text block begins and ends. */}
      <g className="press-rail">
        <rect x="0" y="44" width={PRESS_VIEW_W} height="5" rx="2.5" fill="url(#rail-steel)" />
        <rect x="0" y="49" width={PRESS_VIEW_W} height="3" fill="#2E2820" opacity=".16" />
        <rect className="press-stop" x="52" y="40" width="7" height="13" rx="2" fill="#241f19" />
        <rect className="press-stop" x="291" y="40" width="7" height="13" rx="2" fill="#241f19" />
      </g>
    </svg>
  );
}
