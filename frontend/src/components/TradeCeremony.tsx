import { useEffect, useRef, useState } from 'react';

export interface TicketData {
  no: number;
  title: string;
  symbol: string;
  lines: string[];
}

type Stage = 'print' | 'fold' | 'envelope' | 'ship';

const STAGE_MS: [Stage, number][] = [
  ['print', 2500], // 1.0s rise, typewriter from 0.3s, seal stamps after the last character
  ['fold', 950],
  ['envelope', 850],
  ['ship', 1000],
];

const TYPE_START_MS = 300;
const TYPE_CHAR_MS = 22;

export function TradeCeremony({ ticket, onDone }: { ticket: TicketData; onDone: () => void }) {
  const [stage, setStage] = useState<Stage>('print');
  const [typedCount, setTypedCount] = useState(0);
  const done = useRef(false);
  const timers = useRef<number[]>([]);

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
            return c + 1;
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

  const typing = stage === 'print' && typedCount < fullText.length;
  const typedLines = fullText.slice(0, typedCount).split('\n');
  const shownLines = stage === 'print' ? typedLines : ticket.lines;

  return (
    <div className="ceremony" data-stage={stage} onClick={finish}>
      <div className="ceremony-scene">
        <div className="ticket">
          <div className="ticket-head">CURIA · {ticket.title} Nº {ticket.no}</div>
          {ticket.lines.map((full, i) => {
            const isRealised = full.includes('realised');
            const sign = isRealised ? (full.startsWith('−') || full.startsWith('-') ? 'down' : 'up') : undefined;
            return (
              <div className="ticket-line" key={full} data-sign={sign}>
                {shownLines[i] ?? ''}
                {typing && i === typedLines.length - 1 && <span className="type-caret" />}
              </div>
            );
          })}
          <div className="ticket-seal">C</div>
        </div>
        <div className="envelope">
          <div className="envelope-flap" />
          <div className="envelope-body" />
          <div className="envelope-seal">C</div>
        </div>
      </div>
    </div>
  );
}
