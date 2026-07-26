// A real envelope back: bottom trapezoid, two side triangles, and a top triangle
// drawn LAST so it overlaps the others — that overlap is what reads as "closed".
// The previous version drew two corner-to-corner diagonals, which reads as an X
// on a box rather than as folded paper.
//
// The parchment hex values below are deliberate and intentionally not design
// tokens: SVG gradient stops cannot reliably read CSS custom properties across
// browsers, and each flap needs a *different* shade of the same paper or the
// folds won't read. They are all derived from the existing `--parchment` family.
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
