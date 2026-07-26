// The platen is a cylinder, not a pill: the horizontal gradient runs dark at both
// ends to a lit band above centre, which is what reads as a curved surface. The
// arm is clipped to a narrow band starting at the strike line so it can only ever
// read as a typebar swinging up into the platen — never as a shaft lying across
// the ticket. The previous version clipped an open-ended region down to the
// bottom of the scene, which kept the arm off the header and typed text but still
// drew a long tapered shaft down the rest of the page.
//
// The head and arm shaft are authored once at the line-0 position, then the whole
// assembly is translated down by the same per-line offset that drives strikeY.
// That keeps the head locked just inside the top of the clip band at every line
// index, instead of sitting at a fixed y that the band clips away on later lines.
// The translate lives on an inner <g> (not on .press-arm itself) because the
// swing animation sets a CSS `transform` on .press-arm, and a CSS transform on an
// element overrides any SVG `transform` attribute on that same element — nesting
// keeps the two from fighting.
export function Press({ striking, line }: { striking: number; line: number }) {
  const strikeY = 96 + line * 21;
  const armOffset = line * 21;
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
          <rect className="press-head" x="146" y="112" width="24" height="20" rx="4" fill="#241f19" />
          <rect x="150" y="116" width="16" height="12" rx="2" fill="#3c352c" />
        </g>
      </g>

      <g className="press-platen">
        <rect x="-6" y="6" width="330" height="28" rx="14" fill="url(#platen-face)" />
        <rect x="6" y="9" width="306" height="11" rx="6" fill="url(#platen-spec)" />
      </g>
    </svg>
  );
}
