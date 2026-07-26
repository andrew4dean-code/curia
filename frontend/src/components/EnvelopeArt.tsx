// The envelope is drawn in two flat SVG layers with the letter sandwiched between
// them, plus an HTML flap that is NOT in this file at all (see .env-flap in
// ceremony.css). That split is the whole point:
//
//   * The flap used to be an SVG <g> mirrored above y=0 inside viewBox="0 0 290 170".
//     SVG's default overflow:hidden clipped it, so the OPEN flap did not exist -- it
//     only became visible once it had already swung most of the way shut. Nothing
//     about the rotation was wrong; the open pose was simply never painted. An HTML
//     div has no such clip, so the flap now lives there.
//   * The letter has to be able to slide *between* the back wall and the front
//     pocket. One SVG cannot do that, because the letter is a DOM element outside it.
//     So: EnvelopeBack paints the cavity you see through the mouth, .fold (the folded
//     ticket) sits on top of it, and EnvelopeFront paints the pocket over the letter.
//
// Both use viewBox "0 0 300 170" and are stretched over a 300x170 box, so 1 SVG unit
// == 1px and every number here is directly comparable to the pixel geometry in
// ceremony.css. The shared landmarks: body y 44..164, throat y 62, floor y 158.
//
// The parchment hex values are deliberately not design tokens: SVG gradient stops
// cannot reliably read CSS custom properties across browsers, and each glued flap
// needs a *different* shade of the same paper or the folds do not read. They are all
// derived from the existing --parchment family.

// The pocket. One closed path from the throat down to the rounded bottom edge, and
// the only thing standing between the letter and the viewer. It is authored once and
// used three times: as the opaque fill, as the clip for the decorative glued flaps,
// and as the outline. Painting it BEFORE the glued flaps is what makes the occlusion
// unconditional -- the flaps are decoration on top of an already-opaque field, so no
// seam between them can ever leak a sliver of letter.
const POCKET = 'M0 62 H300 V158 Q300 164 294 164 H6 Q0 164 0 158 Z';

export function EnvelopeBack() {
  return (
    <svg className="env-art env-back env-part" viewBox="0 0 300 170" aria-hidden="true">
      <defs>
        <linearGradient id="env-cavity" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#B3A277" />
          <stop offset="0.22" stopColor="#CCBE99" />
          <stop offset="1" stopColor="#DBCFAD" />
        </linearGradient>
      </defs>
      {/* the inside back wall. Only its top strip (y 44..62, above the throat) is ever
          visible -- that strip is the open mouth, and it is dark at the top so the
          letter reads as descending into a cavity rather than onto a flat card. */}
      <rect x="0" y="44" width="300" height="120" rx="6" fill="url(#env-cavity)" />
      <rect x="0.5" y="44.5" width="299" height="119" rx="6" fill="none" stroke="#C9B687" />
    </svg>
  );
}

export function EnvelopeFront() {
  return (
    <svg className="env-art env-front env-part" viewBox="0 0 300 170" aria-hidden="true">
      <defs>
        <clipPath id="env-pocket-clip">
          <path d={POCKET} />
        </clipPath>
        <linearGradient id="env-left" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#E2D7BC" /><stop offset="1" stopColor="#EFE7D2" />
        </linearGradient>
        <linearGradient id="env-right" x1="1" y1="0" x2="0" y2="0">
          <stop offset="0" stopColor="#E2D7BC" /><stop offset="1" stopColor="#EFE7D2" />
        </linearGradient>
        <linearGradient id="env-bottom" x1="0" y1="1" x2="0" y2="0">
          <stop offset="0" stopColor="#DED2B4" /><stop offset="1" stopColor="#EDE4CD" />
        </linearGradient>
      </defs>

      {/* THE OCCLUDER, first and opaque. Everything at or below y=62 is covered. */}
      <path className="env-pocket" d={POCKET} fill="#E4D9BE" />

      {/* the three glued flaps, clipped to the pocket so they inherit its rounded
          bottom corners. They meet at (150,113); the plain triangle left above them
          -- (0,62) (300,62) (150,113) -- is the field the closed flap lands on. */}
      <g clipPath="url(#env-pocket-clip)">
        <path className="env-glue env-glue-left" d="M0 62 L150 113 L0 170 Z" fill="url(#env-left)" />
        <path className="env-glue env-glue-right" d="M300 62 L150 113 L300 170 Z" fill="url(#env-right)" />
        <path className="env-glue env-glue-bottom" d="M-8 176 L150 113 L308 176 Z" fill="url(#env-bottom)" />
      </g>

      {/* the throat lip: the near edge of the pocket, one shade darker than the paper
          so the mouth reads as an opening and not as a printed line. */}
      <path className="env-throat-lip" d="M0 62 H300" stroke="#B3A277" strokeWidth="1.5" fill="none" />
      <path d={POCKET} fill="none" stroke="#C9B687" />
    </svg>
  );
}
