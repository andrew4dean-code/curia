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
        <linearGradient id="env-backpaper" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#E1D6B8" />
          <stop offset="0.3" stopColor="#E5DBBE" />
          <stop offset="1" stopColor="#DBCFAD" />
        </linearGradient>
        <linearGradient id="env-cavity-shade" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#3A3428" stopOpacity="0.52" />
          <stop offset="0.55" stopColor="#3A3428" stopOpacity="0.20" />
          <stop offset="1" stopColor="#3A3428" stopOpacity="0" />
        </linearGradient>
      </defs>
      {/* THE BACK WALL IS PAPER, ALL THE WAY UP TO THE HINGE, at every x. Only its top
          strip (y 44..62, above the throat) is ever visible, and that strip is what
          shows through the mouth. It used to be painted with the cavity gradient
          itself -- a single rect running from #B3A277 down -- so the paper and the
          shadow inside it were the same object and could not be told apart. That cost
          the ceremony its last frame: the closed flap is a triangle based on the
          hinge, so at the two top corners the band 140..158 (scene) is lidded by
          nothing, and what showed there was the cavity, >100 levels darker than the
          pocket right below it. Two dark holes, held through the seal and the whole
          ship stage. */}
      <rect className="env-backpanel" x="0" y="44" width="300" height="120" rx="6" fill="url(#env-backpaper)" />
      {/* the shadow INSIDE the open mouth, dark at the hinge where you are looking
          deepest in. Separate from the paper precisely so it can be faded out as the
          flap comes down (mouth-shut in ceremony.css): a sealed envelope has no
          opening left to be dark, so the corners come back to paper. */}
      <rect className="env-cavity" x="0" y="44" width="300" height="24" fill="url(#env-cavity-shade)" />
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

      {/* THE SHOULDERS: the same sheet as the pocket, cut so its top edge rises from
          the throat (y 62) to the hinge (y 44) at each end. They are the reason the
          sealed envelope's top corners are paper.
          The band y 44..62 is the mouth, and the closed flap is a triangle based on
          the hinge -- so outside its slope the band was lidded by NOTHING and showed
          whatever lay behind it: the cavity, the throat gradient, and the posted
          letter's own box-shadow leaking up over the throat. Measured at t=900 that
          was rgb(117,107,82) against rgb(227,217,188) for the pocket 14px below --
          two holes punched in the final held image of the ceremony.
          52 IS NOT A GUESS. The closed flap's left edge runs from (0,44) to (150,96)
          in this viewBox, i.e. 150 units across for 52 down, so at the throat it has
          reached x = 150 * 18/52 = 51.9. The shoulder's hypotenuse is that same line,
          so flap and shoulder meet along their whole length with no seam and no gap
          at any y in the band. Being part of .env-front they sit at z-index 5, in
          front of the letter and everything it casts, so nothing can leak here again.
          This is also just what an envelope looks like: the flap's diagonals land on
          the front's paper, they do not stop in mid-air. */}
      <path className="env-shoulder" d="M0 44 L52 62 L0 62 Z" fill="#E4D9BE" />
      <path className="env-shoulder" d="M300 44 L248 62 L300 62 Z" fill="#E4D9BE" />

      {/* the three glued flaps, clipped to the pocket so they inherit its rounded
          bottom corners. They meet at (150,113); the plain triangle left above them
          -- (0,62) (300,62) (150,113) -- is the field the closed flap lands on. */}
      <g clipPath="url(#env-pocket-clip)">
        <path className="env-glue env-glue-left" d="M0 62 L150 113 L0 170 Z" fill="url(#env-left)" />
        <path className="env-glue env-glue-right" d="M300 62 L150 113 L300 170 Z" fill="url(#env-right)" />
        <path className="env-glue env-glue-bottom" d="M-8 176 L150 113 L308 176 Z" fill="url(#env-bottom)" />
      </g>

      {/* the throat lip: the near edge of the front paper, one shade darker than the
          paper so the mouth reads as an opening and not as a printed line. It follows
          the shoulders rather than running straight across at y=62, because that IS
          the cut edge of the front now -- a straight line here would draw a rule
          through the middle of the shoulders. */}
      <path className="env-throat-lip" d="M0 44 L52 62 H248 L300 44" stroke="#B3A277" strokeWidth="1.5" fill="none" />
      <path d={POCKET} fill="none" stroke="#C9B687" />
    </svg>
  );
}
