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
  // the measured print column, in scene pixels. null = nothing measured yet, which
  // parks the bar on the centre line rather than guessing.
  const [strikeX, setStrikeX] = useState<number | null>(null);
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
        const interval = window.setInterval(() => {
          setTypedCount((c) => {
            if (c >= fullText.length) {
              clearInterval(interval);
              return c;
            }
            // A CARRIAGE RETURN COSTS NO BEAT. '\n' prints nothing, so if it ate a
            // tick the rhythm gained a silent gap at every line break and the strike
            // that belonged to the first letter of the new line landed one beat late
            // -- a visible phase shift, exactly the kind of thing that reads as the
            // machine losing the plot. Swallow the newline and print the first
            // character of the new line on the SAME tick.
            let n = c;
            while (n < fullText.length && fullText[n] === '\n') n++;
            if (n < fullText.length) n++;
            return n;
          });
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
  const typing = stage === 'print' && typedCount < fullText.length;
  const typedLines = typedText.split('\n');
  const shownLines = stage === 'print' ? typedLines : ticket.lines;
  // one strike per PRINTED character. Newlines are free, so this counts glyphs, not
  // characters: derive it from typedCount and it would fail to advance across a line
  // break (two characters consumed in one tick), the strike keyframe name would not
  // change, and the browser would not restart the animation -- the first letter of
  // every line would print with the bar standing still.
  const glyphs = typedCount - (typedLines.length - 1);
  const lastGlyph = typedText.length > 0 ? typedText[typedText.length - 1] : '';

  // REGISTRATION: measure, never compute. The bar has to land where the letter
  // actually appears, and the only thing that knows that is layout -- Space Mono
  // arrives from Google Fonts, so on a cold or offline first run (this is an
  // offline-first PWA) the fallback face has a different advance and any hardcoded
  // character pitch puts the hammer visibly off the text. A layout effect, so the
  // head has moved by the time the browser paints the new glyph, not a frame later.
  // The boxes are read against each other rather than via offsetLeft/offsetParent so
  // no assumption is made about which ancestor happens to be positioned.
  //
  // The element measured is the glyph JUST STRUCK, wrapped in its own span, and the
  // head is centred on it. The print-position anchor after it (a zero-width span, so
  // its centre is its left edge) is the fallback for the one frame before anything
  // has been typed. Measuring the anchor for every character would sit the head on
  // the boundary of the NEXT cell -- half a character to the right of the letter it
  // is supposed to have just hit, for the whole beat that letter is on screen. Half
  // a character off is exactly the complaint, so the hammer is put on the letter.
  useLayoutEffect(() => {
    const target = glyphRef.current ?? columnRef.current;
    const scene = sceneRef.current;
    if (!target || !scene) return;
    const sceneBox = scene.getBoundingClientRect();
    if (sceneBox.width === 0) return; // nothing laid out yet: keep the centred fallback
    const box = target.getBoundingClientRect();
    const x = box.left + box.width / 2 - sceneBox.left;
    setStrikeX((prev) => (prev !== null && Math.abs(prev - x) < 0.25 ? prev : x));
  });

  return (
    <div className="ceremony" data-stage={stage} data-typing={typing ? 'yes' : 'no'} onClick={finish}>
      <div className="ceremony-scene" ref={sceneRef}>
        <Press
          striking={glyphs === 0 ? 'idle' : glyphs % 2}
          line={Math.max(0, typedLines.length - 1)}
          glyph={lastGlyph}
          x={strikeX}
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
              {[0, 1, 2].map((n) => (
                <div className={`fold-panel fold-p${n}`} key={n}>
                  <div className="fold-inner" style={{ transform: `translateY(-${n * 33.333}%)` }}>
                    <div className="ticket-head">CURIA · {ticket.title} Nº {ticket.no}</div>
                    {ticket.lines.map((l) => (
                      <div className="ticket-line" key={l}>{l}</div>
                    ))}
                  </div>
                  <div className="fold-shade" />
                  {n !== 1 && <div className="fold-edge" />}
                </div>
              ))}
              <div className="fold-contact" />
            </div>
          )}
          <div className="env-throat env-part" />
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
