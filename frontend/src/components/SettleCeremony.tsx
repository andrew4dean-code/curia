import { useEffect, useRef, useState } from 'react';
import { Odometer } from './Odometer';

/** The two sides of an assignment. Assignment is not a verdict on a trade — it is a
 *  conversion, and the ceremony says so by moving both halves at once: what left goes one
 *  way, what arrived comes the other. Structured rather than one pre-formatted sentence,
 *  because each half is drawn in its own column and they must be laid out independently. */
export interface SettleExchange {
  goneLabel: string;
  goneFigure: string;
  gotLabel: string;
  gotFigure: string;
  /** One line naming what happened, in the app's voice. */
  verdict: string;
  /** Where the certificate is filed, printed under the sleeve once it lands. */
  filedTo: string;
}

export interface SettleData {
  word: string;
  tone: 'up' | 'down' | 'assign';
  amount: string;
  symbol: string;
  exchange?: SettleExchange;
}

/* Two shapes, because two different things happen.

   A contract that expired or was bought back IS a verdict, and keeps the stamp. What it
   loses is the collision: the stamp used to be position:absolute at top 46% while the
   amount sat in normal flow, so nothing coordinated them and on a card this short they
   always met — measured at 228x45px of overlap, which is why the figure was unreadable
   through the word. Both are in flow now, in a column, and cannot reach each other.

   An assignment gets the exchange above. */
type VerdictStage = 'swing' | 'hit' | 'count';
type ExchangeStage = 'close' | 'swap' | 'settled' | 'file';

/** Verdict: the stamp lands at 420 and the paper answers ON the impact. It used to jolt at
 *  620 — 186ms after the stamp had already bottomed out — so the reaction read as unrelated
 *  to the blow. Ends at 2400, not 3800: the old tail held a byte-identical frame for 1.6s. */
const VERDICT_MS = { hit: 420, count: 700, done: 2400 };
/** Exchange: contract closes, the two sides cross, the certificate is filed. 3400, not 6400. */
const EXCHANGE_MS = { swap: 620, settled: 1700, file: 2340, done: 3400 };

export function SettleCeremony({ data, onDone }: { data: SettleData; onDone: () => void }) {
  const isExchange = !!data.exchange;
  const [stage, setStage] = useState<VerdictStage | ExchangeStage>(isExchange ? 'close' : 'swing');
  const timers = useRef<number[]>([]);
  const done = useRef(false);

  useEffect(() => {
    const at = (ms: number, fn: () => void) => timers.current.push(window.setTimeout(fn, ms));
    if (isExchange) {
      at(EXCHANGE_MS.swap, () => setStage('swap'));
      at(EXCHANGE_MS.settled, () => setStage('settled'));
      at(EXCHANGE_MS.file, () => setStage('file'));
      at(EXCHANGE_MS.done, finish);
    } else {
      at(VERDICT_MS.hit, () => setStage('hit'));
      at(VERDICT_MS.count, () => setStage('count'));
      at(VERDICT_MS.done, finish);
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

  if (data.exchange) {
    const x = data.exchange;
    return (
      <div className="ceremony settle-ceremony settle-exchange" data-stage={stage} data-tone={data.tone} onClick={finish}>
        <div className="exchange-stage">
          {/* The contract that was sold is finished. It says so first, and gets out of the
              way — the space it vacates is where the verdict is written. */}
          <div className="xc-contract">
            <div className="xc-contract-head">CURIA · {data.symbol}</div>
            <div className="xc-contract-body">{data.word}</div>
            <div className="xc-strike" aria-hidden="true" />
          </div>
          <div className="xc-verdict">{x.verdict}</div>
          {/* The filing window. Its floor is the sleeve's mouth, so a card travelling down is
              cut off AT the sleeve and is gone behind it — never faded out in front of it,
              which is what the old ceremony did, and why nothing ever looked filed. */}
          <div className="xc-window">
            <div className="xc-filing">
              <div className="xc-swap">
                <div className="xc-side xc-gone">
                  <div className="xc-cap">{x.goneLabel}</div>
                  <div className="xc-fig">{x.goneFigure}</div>
                </div>
                <div className="xc-side xc-got">
                  <div className="xc-frame" aria-hidden="true" />
                  <div className="xc-cap">{x.gotLabel}</div>
                  <div className="xc-fig" data-testid="settle-got">{x.gotFigure}</div>
                </div>
              </div>
            </div>
          </div>
          <div className="xc-sleeve" aria-hidden="true" />
          <div className="xc-filed">{x.filedTo}</div>
        </div>
      </div>
    );
  }

  return (
    <div className="ceremony settle-ceremony settle-verdict" data-stage={stage} data-tone={data.tone} onClick={finish}>
      <div className="ceremony-scene">
        <div className="ticket settle-ticket">
          <div className="ticket-head">CURIA · {data.symbol}</div>
          {/* Fixed-height berth. A 220px word rotated -12deg needs ~93px of vertical room;
              giving it that in flow is what keeps it off the figure below for good. */}
          <div className="settle-stamp-berth">
            <div className="settle-stamp">{data.word}</div>
          </div>
          <div className="settle-amount">
            {/* The stage named 'count' has to actually count: the amount holds at zero
                until the stamp has landed, then winds up. */}
            <Odometer value={data.amount} speed="hero" run={stage === 'count'} dataTestid="settle-amount" />
          </div>
        </div>
      </div>
    </div>
  );
}
