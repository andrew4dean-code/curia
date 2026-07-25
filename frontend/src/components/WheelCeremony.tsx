import { useEffect, useRef, useState } from 'react';

export interface WheelCeremonyData {
  mode: 'open' | 'complete';
  symbol: string;
  no: number;
  totalLine?: string; // completion only, e.g. "+$1,241.00 · 8 weeks · 7 calls"
}

type Phase = 'draw' | 'spin' | 'stamp';

const PHASE_MS: [Phase, number][] = [
  ['draw', 1400],
  ['spin', 1400],
  ['stamp', 900],
];

const TYPE_CHAR_MS = 30;

export function WheelCeremony({ data, onDone }: { data: WheelCeremonyData; onDone: () => void }) {
  const [phase, setPhase] = useState<Phase>('draw');
  const [typedCount, setTypedCount] = useState(0);
  const done = useRef(false);
  const timers = useRef<number[]>([]);

  const caption =
    data.mode === 'open'
      ? `${data.symbol} · WHEEL Nº ${data.no} · OPENED`
      : `${data.symbol} · WHEEL Nº ${data.no} · ${data.totalLine ?? ''}`;

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
    for (let i = 1; i < PHASE_MS.length; i++) {
      at += PHASE_MS[i - 1][1];
      const next = PHASE_MS[i][0];
      timers.current.push(window.setTimeout(() => setPhase(next), at));
    }
    at += PHASE_MS[PHASE_MS.length - 1][1];
    timers.current.push(window.setTimeout(finish, at));

    timers.current.push(
      window.setTimeout(() => {
        const interval = window.setInterval(() => {
          setTypedCount((c) => {
            if (c >= caption.length) {
              clearInterval(interval);
              return c;
            }
            return c + 1;
          });
        }, TYPE_CHAR_MS);
        timers.current.push(interval);
      }, 900),
    );

    const cleanup = timers.current;
    return () =>
      cleanup.forEach((t) => {
        clearTimeout(t);
        clearInterval(t);
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const typing = typedCount < caption.length;

  return (
    <div className="ceremony wheel-ceremony" data-phase={phase} onClick={finish}>
      <div className="wheel-crest-scene">
        <svg className="wheel-crest" width="180" height="180" viewBox="0 0 180 180" aria-hidden="true">
          <circle className="crest-rim" cx="90" cy="90" r="80" fill="none" stroke="var(--parchment)" strokeWidth="3" />
          <circle className="crest-inner" cx="90" cy="90" r="62" fill="none" stroke="var(--parchment)" strokeWidth="1.5" />
          <g className="crest-spokes" stroke="var(--gold)" strokeWidth="2.5">
            {Array.from({ length: 8 }, (_, i) => {
              const a = ((i * 45) * Math.PI) / 180;
              return (
                <line
                  key={i}
                  x1={90 + 20 * Math.sin(a)}
                  y1={90 - 20 * Math.cos(a)}
                  x2={90 + 60 * Math.sin(a)}
                  y2={90 - 60 * Math.cos(a)}
                />
              );
            })}
          </g>
          <circle className="crest-hub" cx="90" cy="90" r="20" fill="var(--maroon)" />
          <text x="90" y="96" fontFamily="var(--font-display)" fontSize="18" fontWeight="800" fill="var(--parchment)" textAnchor="middle">
            C
          </text>
        </svg>
        {data.mode === 'complete' && <div className="crest-banner">COMPLETED</div>}
        <div className="crest-caption">
          {caption.slice(0, typedCount)}
          {typing && <span className="type-caret" style={{ background: 'var(--parchment)' }} />}
        </div>
      </div>
    </div>
  );
}
