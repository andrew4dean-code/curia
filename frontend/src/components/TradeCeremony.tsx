import { useEffect, useRef, useState } from 'react';

export interface TicketData {
  no: number;
  title: string;
  symbol: string;
  lines: string[];
}

type Stage = 'print' | 'fold' | 'envelope' | 'ship';

const STAGE_MS: [Stage, number][] = [
  ['print', 1700], // 1.2s rise + 0.4s seal + breath
  ['fold', 950],
  ['envelope', 850],
  ['ship', 1000],
];

export function TradeCeremony({ ticket, onDone }: { ticket: TicketData; onDone: () => void }) {
  const [stage, setStage] = useState<Stage>('print');
  const done = useRef(false);
  const timers = useRef<number[]>([]);

  function finish() {
    if (done.current) return;
    done.current = true;
    timers.current.forEach(clearTimeout);
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
    return () => timers.current.forEach(clearTimeout);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="ceremony" data-stage={stage} onClick={finish}>
      <div className="ceremony-scene">
        <div className="ticket">
          <div className="ticket-head">CURIA · {ticket.title} Nº {ticket.no}</div>
          {ticket.lines.map((l) => (
            <div className="ticket-line" key={l}>{l}</div>
          ))}
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
