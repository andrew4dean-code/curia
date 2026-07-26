import { useEffect, useRef, useState } from 'react';
import { Odometer } from './Odometer';

export interface SettleData {
  word: string;
  tone: 'up' | 'down' | 'assign';
  amount: string;
  symbol: string;
  shares?: string;
}

type Stage = 'swing' | 'hit' | 'count' | 'certificate' | 'file';

export function SettleCeremony({ data, onDone }: { data: SettleData; onDone: () => void }) {
  const [stage, setStage] = useState<Stage>('swing');
  const timers = useRef<number[]>([]);
  const done = useRef(false);

  useEffect(() => {
    const at = (ms: number, fn: () => void) => timers.current.push(window.setTimeout(fn, ms));
    at(620, () => setStage('hit'));
    at(1250, () => setStage('count'));
    if (data.shares) {
      at(3800, () => setStage('certificate'));
      at(5300, () => setStage('file'));
      at(6400, finish);
    } else {
      at(3800, finish);
    }
    const t = timers.current;
    return () => t.forEach(clearTimeout);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function finish() {
    if (done.current) return;
    done.current = true;
    timers.current.forEach(clearTimeout);
    onDone();
  }

  return (
    <div className="ceremony settle-ceremony" data-stage={stage} data-tone={data.tone} onClick={finish}>
      <div className="ceremony-scene">
        <div className="ticket settle-ticket">
          <div className="ticket-head">CURIA · {data.symbol}</div>
          <div className="settle-stamp">{data.word}</div>
          <div className="settle-amount">
            <Odometer value={data.amount} speed="hero" dataTestid="settle-amount" />
          </div>
          {(stage === 'certificate' || stage === 'file') && data.shares && (
            <>
              <div className="cert-frame" aria-hidden="true" />
              <div className="settle-cert">{data.shares}</div>
            </>
          )}
        </div>
        {stage === 'file' && <div className="settle-file" aria-hidden="true" />}
      </div>
    </div>
  );
}
