import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { EnvelopeBack, EnvelopeFront } from './EnvelopeArt';
import { Press } from './Press';

export interface TicketData {
  no: number;
  title: string;
  symbol: string;
  lines: string[];
}

type Stage = 'print' | 'fold' | 'envelope' | 'ship';

export const STAGE_MS: [Stage, number][] = [
  ['print', 4200], // 0.8s rise, typewriter from 0.6s, seal stamps after the last character
  ['fold', 1600],
  ['envelope', 1100],
  ['ship', 1100],
];

export const TYPE_START_MS = 600;
export const TYPE_CHAR_MS = 48;
// There is no STRIKE_EVERY any more, and its absence is the point. It was 3, which
// meant TWO OF EVERY THREE CHARACTERS APPEARED WITH NO STRIKE AT ALL: the bar swung
// for one glyph and then two more glyphs printed themselves out of nowhere while it
// hung mid-air. That, more than any pose or angle, is what read as "random". One
// beat, one glyph, one strike -- see `glyphs` below.

export function TradeCeremony({ ticket, onDone }: { ticket: TicketData; onDone: () => void }) {
  const [stage, setStage] = useState<Stage>('print');
  const [typedCount, setTypedCount] = useState(0);
  // ONE BEAT OF GRACE AFTER THE LAST CHARACTER, and it is the whole fix for the most
  // watched moment of the stage. `typing` used to be `typedCount < fullText.length`,
  // which goes false on the SAME render that prints the final glyph -- so on that one
  // render the strike rules stopped matching (the last letter appeared under a bar
  // standing still), .press-arm began its 200ms fade, and `active` unmounted
  // .tl-strike so the layout effect had no target and the carriage froze one cell to
  // the left. Measured before the fix: "beat 60: strike=0 typing=yes / beat 61:
  // strike=1 typing=no", carriage x identical for the last two beats. The final glyph
  // is the one the eye is on; it got no strike, no carriage move and a dissolving arm.
  // The typing flag is now stage-gated and released one beat LATER, by the tick that
  // finds nothing left to print -- so the last glyph gets a full 48ms beat with the
  // arm lit, the 44ms strike keyframe restarted, and the head measured onto it.
  const [printDone, setPrintDone] = useState(false);
  // the measured strike point, in scene pixels: x is the column, y is where the
  // struck line's glyphs actually bottom out. null = nothing measured yet, which
  // parks the bar on the centre line at the base register rather than guessing.
  const [strike, setStrike] = useState<{ x: number; y: number } | null>(null);
  const done = useRef(false);
  const timers = useRef<number[]>([]);
  const sceneRef = useRef<HTMLDivElement | null>(null);
  const glyphRef = useRef<HTMLSpanElement | null>(null);
  const columnRef = useRef<HTMLSpanElement | null>(null);

  const fullText = ticket.lines.join('\n');

  function finish() {
    if (done.current) return;
    done.current = true;
    timers.current.forEach((t) => {
      clearTimeout(t);
      clearInterval(t);
    });
    onDone();
  }

  useEffect(() => {
    let at = 0;
    for (let i = 1; i < STAGE_MS.length; i++) {
      at += STAGE_MS[i - 1][1];
      const next = STAGE_MS[i][0];
      timers.current.push(window.setTimeout(() => setStage(next), at));
    }
    at += STAGE_MS[STAGE_MS.length - 1][1];
    timers.current.push(window.setTimeout(finish, at));

    // the press types the trade onto the ticket one character at a time
    timers.current.push(
      window.setTimeout(() => {
        // the count lives in the closure, not in a functional updater: the tick that
        // finds the text finished has to release `printDone`, and a state updater is
        // not the place for that side effect.
        let count = 0;
        const interval = window.setInterval(() => {
          if (count >= fullText.length) {
            // ONE BEAT AFTER THE LAST GLYPH, not on it. See printDone above.
            clearInterval(interval);
            setPrintDone(true);
            return;
          }
          // A CARRIAGE RETURN COSTS NO BEAT. '\n' prints nothing, so if it ate a
          // tick the rhythm gained a silent gap at every line break and the strike
          // that belonged to the first letter of the new line landed one beat late
          // -- a visible phase shift, exactly the kind of thing that reads as the
          // machine losing the plot. Swallow the newline and print the first
          // character of the new line on the SAME tick.
          while (count < fullText.length && fullText[count] === '\n') count++;
          if (count < fullText.length) count++;
          setTypedCount(count);
        }, TYPE_CHAR_MS);
        timers.current.push(interval);
      }, TYPE_START_MS),
    );

    const cleanupTimers = timers.current;
    return () =>
      cleanupTimers.forEach((t) => {
        clearTimeout(t);
        clearInterval(t);
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const typedText = fullText.slice(0, typedCount);
  const typing = stage === 'print' && !printDone;
  const typedLines = typedText.split('\n');
  const shownLines = stage === 'print' ? typedLines : ticket.lines;
  // one strike per PRINTED character. Newlines are free, so this counts glyphs, not
  // characters: derive it from typedCount and it would fail to advance across a line
  // break (two characters consumed in one tick), the strike keyframe name would not
  // change, and the browser would not restart the animation -- the first letter of
  // every line would print with the bar standing still.
  const glyphs = typedCount - (typedLines.length - 1);
  const lastGlyph = typedText.length > 0 ? typedText[typedText.length - 1] : '';

  // REGISTRATION: measure, never compute — IN BOTH AXES. The bar has to land where
  // the letter actually appears, and the only thing that knows that is layout --
  // Space Mono arrives from Google Fonts, so on a cold or offline first run (this is
  // an offline-first PWA) the fallback face has a different advance and any hardcoded
  // character pitch puts the hammer visibly off the text. A layout effect, so the
  // head has moved by the time the browser paints the new glyph, not a frame later.
  // The boxes are read against each other rather than via offsetLeft/offsetParent so
  // no assumption is made about which ancestor happens to be positioned.
  //
  // Y IS MEASURED FOR EXACTLY THE SAME REASON X IS, and computing it while arguing
  // that x could not be computed was the defect. The old constant (96 + 24) assumed
  // .ticket-head was one 22.5px line box; measured in Chrome against the real 250px
  // content box, EVERY ticket title wrapped to two lines in Georgia Bold -- the
  // declared fallback in --font-display, and therefore the FIRST PAINT of every
  // ceremony on this offline-first PWA, since Playfair is fetched with display=swap.
  // "CURIA · TRADE TICKET Nº 47" 257.6px, "CURIA · OPTION TICKET Nº 47" 266.3px,
  // "CURIA · POSITION CLOSED Nº 47" 289.8px, all in a 250px box. Every .ticket-line
  // then sits 22.5px lower than the constant says while the head does not move, so
  // the clip band opens ABOVE the text and the masked shaft draws straight down
  // through the printed line -- the exact "shaft across the ticket" the band exists
  // to prevent -- and the text jumps again mid-ceremony when the webfont swaps in.
  // The header no longer wraps (see .ticket-head in ceremony.css) AND the register is
  // read from the DOM, so neither end of that failure can come back.
  //
  // The element measured is the glyph JUST STRUCK, wrapped in its own span, and the
  // head is centred on it. The print-position anchor after it (a zero-width span, so
  // its centre is its left edge) is the fallback for the one frame before anything
  // has been typed. Measuring the anchor for every character would sit the head on
  // the boundary of the NEXT cell -- half a character to the right of the letter it
  // is supposed to have just hit, for the whole beat that letter is on screen. Half
  // a character off is exactly the complaint, so the hammer is put on the letter.
  // Its BOTTOM edge is the strike point: the glyph's own inline box bottoms out just
  // under the baseline, which is where a typebar meets the paper. Being a live box it
  // already carries the page feed (.ticket is translated up 3px per line), so the
  // press needs no feed term of its own.
  useLayoutEffect(() => {
    const target = glyphRef.current ?? columnRef.current;
    const scene = sceneRef.current;
    if (!target || !scene) return;
    const sceneBox = scene.getBoundingClientRect();
    if (sceneBox.width === 0) return; // nothing laid out yet: keep the centred fallback
    const box = target.getBoundingClientRect();
    const x = box.left + box.width / 2 - sceneBox.left;
    const y = box.bottom - sceneBox.top;
    // A POINT THAT IS NOT ON THE PAGE IS NOT A MEASUREMENT. The layout effect first
    // runs at mount, and at mount the ticket is at translateY(110vh) -- the bottom of
    // ticket-rise -- so the anchor's box is ~800px below the scene. Taking that as the
    // register parked the bar at the very bottom of its clamp for the whole 600ms
    // before the first character (measured: strike band y 232 instead of 120). There
    // is no re-render in that window to correct it. Anything outside the scene is
    // discarded and the base register stands until the paper is actually in the
    // machine; from the first glyph on, the box is real and the head tracks it,
    // including through the last 200ms of the rise as the sheet seats.
    if (x < 0 || x > sceneBox.width || y < 0 || y > sceneBox.height) return;
    setStrike((prev) =>
      prev !== null && Math.abs(prev.x - x) < 0.25 && Math.abs(prev.y - y) < 0.25 ? prev : { x, y },
    );
  });

  return (
    <div className="ceremony" data-stage={stage} data-typing={typing ? 'yes' : 'no'} onClick={finish}>
      <div className="ceremony-scene" ref={sceneRef}>
        <Press
          striking={glyphs === 0 ? 'idle' : glyphs % 2}
          line={Math.max(0, typedLines.length - 1)}
          glyph={lastGlyph}
          x={strike?.x ?? null}
          y={strike?.y ?? null}
        />
        <div className="ticket-wrap">
          <div className="ticket" style={{ ['--feed' as string]: typedLines.length - 1 }}>
            <div className="ticket-head">CURIA · {ticket.title} Nº {ticket.no}</div>
            {ticket.lines.map((full, i) => {
              const isRealised = full.includes('realised');
              const sign = isRealised ? (full.startsWith('−') || full.startsWith('-') ? 'down' : 'up') : undefined;
              const ink = shownLines[i] ?? '';
              const active = typing && i === typedLines.length - 1;
              const struck = active && ink.length > 0;
              // EVERY LINE HOLDS ITS FINAL WIDTH FROM FRAME 0. .ticket-line is
              // centre-aligned, so a line that grows a character at a time used to
              // slide left under the hammer as it went -- paper cannot do that, and
              // it is why the text seemed to swim. The ghost is the rest of the line,
              // laid out but not painted, so the line box is full width before the
              // first character is struck and never moves again. (It also fixes the
              // vertical: an empty .ticket-line fell back to min-height 1.45em =
              // 20.3px and jumped to 21px on its first character, nudging every line
              // below it.)
              return (
                <div className="ticket-line" key={full} data-sign={sign}>
                  <span className="tl-ink">
                    {struck ? ink.slice(0, -1) : ink}
                    {struck && <span className="tl-strike" ref={glyphRef}>{ink[ink.length - 1]}</span>}
                  </span>
                  {active && <span className="print-column" ref={columnRef} />}
                  <span className="tl-ghost" style={{ visibility: 'hidden' }}>{full.slice(ink.length)}</span>
                </div>
              );
            })}
            <div className="ticket-seal">C</div>
          </div>
        </div>
        {/* The letter is a SIBLING of the two envelope halves, sandwiched between
            them by z-index (see the ladder in ceremony.css). That is the only way a
            DOM element can be swallowed by an SVG envelope: the back wall paints
            behind it, the pocket paints over it. .envelope-stack is the shared
            perspective ancestor and must stay free of `filter`, which would flatten
            the flap's rotation back into a squash. */}
        <div className="envelope-stack" aria-hidden="true">
          <EnvelopeBack />
          {stage !== 'print' && (
            <div className="fold">
              {/* EACH FOLDING PANEL IS A SHEET WITH TWO FACES, not a printed decal.
                  The front carries the thirds of the ticket; the back is blank
                  parchment with the shadow of the crease on it, and it is a REAL
                  ELEMENT. It has to be: the flip lives on .fold-panel, and the old
                  fail-safe (backface-visibility on .fold-inner) could never fire
                  through it. Without a back face a correctly-signed fold shows the
                  printed side in reverse -- mirrored, upside-down type on a letter
                  that is supposed to have been folded shut. p1 is the middle panel
                  and never turns over, so it needs no reverse. */}
              {[0, 1, 2].map((n) => (
                <div className={`fold-panel fold-p${n}`} key={n}>
                  <div className="fold-face fold-face-front">
                    <div className="fold-inner" style={{ transform: `translateY(-${n * 33.333}%)` }}>
                      <div className="ticket-head">CURIA · {ticket.title} Nº {ticket.no}</div>
                      {ticket.lines.map((l) => (
                        <div className="ticket-line" key={l}>{l}</div>
                      ))}
                    </div>
                    <div className="fold-shade" />
                    {n !== 1 && <div className="fold-edge" />}
                  </div>
                  {n !== 1 && (
                    <div className="fold-face fold-face-back">
                      <div className="fold-back-shade" />
                      <div className="fold-edge" />
                    </div>
                  )}
                </div>
              ))}
              <div className="fold-contact" />
            </div>
          )}
          {/* not an .env-part: it needs a second animation on top of the arrival
              (mouth-shut), and `animation` is a shorthand -- see ceremony.css. */}
          <div className="env-throat" />
          <EnvelopeFront />
          <div className="env-flap-shadow" />
          {/* the flap is a div, not SVG: as an SVG <g> mirrored above the viewBox it
              was clipped away by overflow:hidden and the open pose never rendered. */}
          <div className="env-flap">
            <div className="env-flap-face env-flap-in" />
            <div className="env-flap-face env-flap-out" />
          </div>
          <div className="envelope-seal">C</div>
        </div>
      </div>
    </div>
  );
}
