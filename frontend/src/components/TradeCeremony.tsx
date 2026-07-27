import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { EnvelopeBack, EnvelopeFront } from './EnvelopeArt';
import { NIP_Y, Press } from './Press';

export interface TicketData {
  no: number;
  title: string;
  symbol: string;
  lines: string[];
}

type Stage = 'print' | 'fold' | 'envelope' | 'ship';

// What the sheet is doing inside the print stage, which is a separate clock from the stage
// machine because it depends on how long the ticket takes to type.
//   'type'  the sheet is in the machine, ratcheting up one line pitch at a time
//   'eject' the last character is struck: the platen rolls the sheet clear and the press
//           withdraws, so the finished page stands alone
//   'clear' the sheet is out and at rest at translateY(0), where the fold stage expects it,
//           and the seal presses into it
type Print = 'type' | 'eject' | 'clear';

export const STAGE_MS: [Stage, number][] = [
  ['print', 4200], // 0.8s rise, typewriter from 0.6s, seal stamps after the last character
  ['fold', 1600],
  ['envelope', 1100],
  ['ship', 1100],
];

export const TYPE_START_MS = 600;
export const TYPE_CHAR_MS = 48;
// how long the platen takes to roll the finished sheet clear of the machine
export const EJECT_MS = 200;
// The seal will not press before this, so a short two-line trade keeps the unhurried beat it
// has always had between the last character and the wax. A LONG ticket overrides it: the seal
// is scheduled off the eject, never off the clock, so it can no longer stamp before the final
// character the way a fixed 3.72s delay did on a full three-line option ticket.
export const SEAL_FLOOR_MS = 3500;
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
  const [print, setPrint] = useState<Print>('type');
  // The carriage column, in scene pixels, measured off the live DOM. There is no `y` beside it
  // any more and that absence is the whole fix: the strike point does not move, so there is no
  // vertical register to measure. What is measured instead is the SHEET's own offset (`feed`
  // below), which is what puts the line being typed onto the fixed nip.
  const [column, setColumn] = useState<number | null>(null);
  // How far down the sheet is sitting, in scene pixels, so that the line currently being typed
  // lands exactly on the nip. null = nothing measured yet.
  const [feed, setFeed] = useState<number | null>(null);
  const done = useRef(false);
  const timers = useRef<number[]>([]);
  const sceneRef = useRef<HTMLDivElement | null>(null);
  const ticketRef = useRef<HTMLDivElement | null>(null);
  const lineRef = useRef<HTMLDivElement | null>(null);
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

  // THE SHEET COMES OUT OF THE MACHINE WHEN THE TYPING STOPS, and the seal follows it -- not a
  // stopwatch. The old build stamped at a hardcoded 3.72s, which was tuned against one ticket
  // shape; a full three-line option ticket types until ~3720ms, so the wax pressed onto the
  // page *before* its last character. Hanging both off `printDone` makes "the seal lands after
  // the final character" true by construction for every ticket length.
  useEffect(() => {
    if (!printDone) return;
    setPrint('eject');
    // glyphs, not characters: newlines cost no beat (see the interval above)
    const printDoneAt = TYPE_START_MS + (ticket.lines.join('').length + 1) * TYPE_CHAR_MS;
    const wait = Math.max(EJECT_MS, SEAL_FLOOR_MS - printDoneAt);
    const t = window.setTimeout(() => setPrint('clear'), wait);
    timers.current.push(t);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [printDone]);

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

  // REGISTRATION, AFTER THE FLIP. There are still two things to measure, but only one of them
  // is about the bar.
  //
  // 1. THE COLUMN (x). Unchanged, and it was the half that always worked: the head has to land
  //    where the letter actually appears, and the only thing that knows that is layout. Space
  //    Mono arrives from Google Fonts and this is an offline-first PWA, so on a cold or offline
  //    first run the fallback face has a different advance and any hardcoded character pitch
  //    puts the hammer visibly off the text. The element measured is the glyph JUST STRUCK,
  //    wrapped in its own span, and the head is centred on it. The zero-width print-position
  //    anchor after it is the fallback for the one frame before anything has been typed;
  //    measuring the anchor for every character would sit the head on the boundary of the NEXT
  //    cell, half a character right of the letter it is supposed to have just hit.
  //
  // 2. THE FEED (y) -- AND IT IS THE SHEET THAT MOVES, NOT THE BAR. This is the flip. The nip
  //    is a fixed scene y (NIP_Y), so the sheet has to sit wherever puts the line being typed
  //    ON it: feed = NIP_Y - (how far the line's box bottoms out below the sheet's own top).
  //    Both boxes are read on/inside `.ticket`, which is the element the feed transform is on,
  //    so THE DIFFERENCE CANCELS THAT TRANSFORM OUT. That matters more than it sounds: it
  //    makes the measurement a pure function of layout rather than of the current position, so
  //    there is no feedback loop, no convergence to wait for, and no possibility of the sheet
  //    walking. It is also inherently a ratchet -- every glyph on a line reports the same
  //    number, and the step between two lines is exactly one line pitch, measured, never the
  //    hardcoded 27 (or the 3px-per-line "--feed" it replaces, which was a different number
  //    from the pitch the press assumed and cost 3px of registration per line).
  //
  //    A LINE's box is measured, not a glyph's: a line box is the same height whatever has
  //    been typed into it, so the sheet does not twitch when the first character of a line
  //    lands. The nip then sits on the bottom edge of the current line's block -- the glyphs
  //    are the last thing on the page and the paper curves away directly beneath them, which
  //    is exactly where a typebar meets a real platen.
  //
  // The old code measured a strike y and fed it to the bar. That is the thing being deleted:
  // it is why there were 24-per-line offsets, a clip band that had to travel with them, and a
  // pivot that had to be tracked in two axes to stop the lever changing length.
  //
  // A layout effect, so both have moved by the time the browser paints the new glyph rather
  // than a frame later. Boxes are read against each other rather than via
  // offsetLeft/offsetParent, so nothing assumes which ancestor happens to be positioned.
  useLayoutEffect(() => {
    const scene = sceneRef.current;
    const sheet = ticketRef.current;
    const line = lineRef.current;
    if (!scene || !sheet) return;
    const sceneBox = scene.getBoundingClientRect();
    if (sceneBox.width === 0) return; // nothing laid out yet: keep the centred fallback

    if (line) {
      const sheetBox = sheet.getBoundingClientRect();
      const lineBox = line.getBoundingClientRect();
      // zero-height boxes mean no layout (jsdom, or a face that has not resolved): a feed
      // computed from them would slam the sheet to NIP_Y. Leave the last good value standing.
      if (lineBox.height > 0) {
        const drop = lineBox.bottom - sheetBox.top;
        // Clamped for the same reason the column is: one wild box must not be able to throw
        // the sheet out of the machine. The floor is slightly below 0 rather than at 0 so a
        // ticket with more lines than the app emits still tracks its last line onto the nip
        // (it simply settles back down a few px at the eject) instead of silently typing
        // above it -- which is the one thing the flip exists to make impossible.
        const next = Math.min(NIP_Y, Math.max(-40, NIP_Y - drop));
        setFeed((prev) => (prev !== null && Math.abs(prev - next) < 0.25 ? prev : next));
      }
    }

    const target = glyphRef.current ?? columnRef.current;
    if (!target) return;
    const box = target.getBoundingClientRect();
    const x = box.left + box.width / 2 - sceneBox.left;
    // A COLUMN THAT IS NOT ON THE PAGE IS NOT A MEASUREMENT. Only x is guarded: the feed above
    // is a difference of two boxes on the same transformed element, so it is already immune to
    // wherever the sheet happens to be sitting, but a horizontal read outside the scene means
    // the line has not been laid out at all.
    if (x < 0 || x > sceneBox.width) return;
    setColumn((prev) => (prev !== null && Math.abs(prev - x) < 0.25 ? prev : x));
  });

  return (
    <div
      className="ceremony"
      data-stage={stage}
      data-typing={typing ? 'yes' : 'no'}
      data-print={print}
      onClick={finish}
    >
      <div className="ceremony-scene" ref={sceneRef}>
        <Press striking={glyphs === 0 ? 'idle' : glyphs % 2} glyph={lastGlyph} x={column} />
        <div className="ticket-wrap">
          <div
            className="ticket"
            ref={ticketRef}
            style={{
              // ONE FEED, AND IT IS A REAL LINE PITCH. This replaces both halves of the old
              // model: the `--feed * -3px` roll here and Press.tsx's own LINE_PITCH of 27,
              // which were different numbers for the same motion and disagreed by 3px a line.
              // --sheet is the measured offset that puts the current line on the nip;
              // --sheet-from is where the sheet was when the last character landed, which is
              // where the eject animation has to start from so the roll-out does not jump.
              ['--sheet' as string]: `${print === 'type' ? (feed ?? 0) : 0}px`,
              ['--sheet-from' as string]: `${feed ?? 0}px`,
            }}
          >
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
                <div className="ticket-line" key={full} data-sign={sign} ref={active ? lineRef : undefined}>
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
