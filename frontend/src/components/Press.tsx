// The platen is a cylinder, not a pill: the horizontal gradient runs dark at both
// ends to a lit band above centre, which is what reads as a curved surface. The
// arm is clipped to a narrow band starting at the strike line so it can only ever
// read as a typebar swinging up into the platen — never as a shaft lying across
// the ticket. The previous version clipped an open-ended region down to the
// bottom of the scene, which kept the arm off the header and typed text but still
// drew a long tapered shaft down the rest of the page.
//
// LINE_PITCH is the real rendered height of a `.ticket-line` (see ceremony.css),
// not a guess: font-size 14px with the inherited body line-height of 1.5 gives a
// 21px content line, plus the rule's own 3px top/bottom padding = 27px. (The
// rule's `min-height: 1.45em` — 20.3px — never wins: natural content height is
// taller, so it's a no-op here.) Confirmed by rendering three stacked
// `.ticket-line` elements in a real browser and reading their bounding rects:
// consecutive lines land exactly 27px apart. Using the wrong pitch (a guessed 21
// in an earlier pass) meant the strike point drifted further out of register
// with the text on every line after the first.
//
// LINE_GAP_OFFSET pushes the strike point from the *top* of the current line
// down past that line's own glyphs, landing in the gap before the next line
// starts: 3px padding-top + 21px line content = 24px is exactly where this
// line's text ends and its bottom padding begins. That's "just under the
// baseline" without yet touching the next line.
//
// BASE_STRIKE_Y (line 0's strike point) and the head's authored `y` are the same
// constant on purpose: the head's top edge and the clip band's top edge must be
// the same y at every line, so nothing is ever drawn above the strike line —
// enforced by the clip path, not by leaving a gap and hoping z-order cooperates.
//
// The head and arm shaft are authored once at the line-0 position, then the
// whole assembly is translated down by the same per-line offset that drives
// strikeY. That keeps the head locked to the top of the clip band at every line
// index, instead of sitting at a fixed y that the band clips away on later
// lines. The translate lives on an inner <g> (not on .press-arm itself) because
// the swing animation sets a CSS `transform` on .press-arm, and a CSS transform
// on an element overrides any SVG `transform` attribute on that same element —
// nesting keeps the two from fighting.
const LINE_PITCH = 27;
const LINE_GAP_OFFSET = 24;
const BASE_STRIKE_Y = 96 + LINE_GAP_OFFSET;

export function Press({ striking, line }: { striking: number; line: number }) {
  const strikeY = BASE_STRIKE_Y + line * LINE_PITCH;
  const armOffset = line * LINE_PITCH;
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
          <rect x="0" y={strikeY} width="318" height="70" />
        </clipPath>
      </defs>

      <rect className="press-cast" x="0" y="30" width="318" height="26" fill="url(#platen-cast)" />

      <g className="press-arm" data-strike={striking} clipPath="url(#press-clip)">
        <g transform={`translate(0, ${armOffset})`}>
          <path d="M155 258 L150 130 L166 130 L161 258 Z" fill="url(#arm-steel)" />
          <rect className="press-head" x="150" y={BASE_STRIKE_Y} width="16" height="12" rx="3" fill="#241f19" />
          <rect x="153" y={BASE_STRIKE_Y + 3} width="10" height="6" rx="1.5" fill="#3c352c" />
        </g>
      </g>

      <g className="press-platen">
        <rect x="-6" y="6" width="330" height="28" rx="14" fill="url(#platen-face)" />
        <rect x="6" y="9" width="306" height="11" rx="6" fill="url(#platen-spec)" />
      </g>
    </svg>
  );
}
