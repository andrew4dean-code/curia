import { useEffect, useRef, useState } from 'react';
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

const TYPE_START_MS = 600;
const TYPE_CHAR_MS = 48;
const STRIKE_EVERY = 3;

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
  const strike = Math.floor(typedCount / STRIKE_EVERY);

  return (
    <div className="ceremony" data-stage={stage} data-typing={typing ? 'yes' : 'no'} onClick={finish}>
      <div className="ceremony-scene">
        <Press striking={strike % 2} line={Math.max(0, typedLines.length - 1)} />
        <div className="ticket-wrap">
          <div className="ticket" style={{ ['--feed' as string]: typedLines.length - 1 }}>
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
        </div>
        {stage !== 'print' && (
          <div className="fold" aria-hidden="true">
            {[0, 1, 2].map((n) => (
              <div className={`fold-panel fold-p${n}`} key={n}>
                <div className="fold-inner" style={{ transform: `translateY(-${n * 33.333}%)` }}>
                  <div className="ticket-head">CURIA · {ticket.title} Nº {ticket.no}</div>
                  {ticket.lines.map((l) => (
                    <div className="ticket-line" key={l}>{l}</div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
        <div className="envelope">
          <div className="envelope-flap" />
          <div className="envelope-body" />
          <div className="envelope-seal">C</div>
        </div>
      </div>
    </div>
  );
}
