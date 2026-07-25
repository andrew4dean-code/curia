import type { Snapshot } from '../lib/api';
import type { OptionPosition, Trade } from '../lib/types';
import { computeOpenPositions } from '../lib/positions';
import { Odometer } from './Odometer';
import { TickerTape } from './TickerTape';
import { useFlash } from '../hooks/useFlash';
import { formatMoney, formatSignedMoney, formatSignedPct, plColor } from '../lib/format';
import { agoLabel } from '../lib/time';

export interface TabProps {
  snap: Snapshot;
  onRefresh: () => Promise<void>;
  onEditTrade: (t: Trade | null) => void;
  onMark: (symbol: string) => void;
  onSettleOption: (o: OptionPosition) => void;
  onEditOption: (o: OptionPosition) => void;
  onSellWeek?: (expiration: string) => void;
  justAdded?: { kind: 'trade' | 'option'; id: number; symbol: string } | null;
}

const rowButtonStyle = { width: '100%', background: 'none', border: 'none', borderBottom: '1px solid var(--rule)', textAlign: 'left', font: 'inherit', color: 'inherit' } as const;

export function PortfolioTab({ snap, onMark, justAdded }: TabProps) {
  const positions = computeOpenPositions(snap.trades, snap.marks);
  const bookValue = positions.reduce(
    (s, p) => s + (p.marketValue ?? p.qty * p.avgCost),
    0,
  );
  const unrealized = positions.reduce((s, p) => s + (p.unrealizedPl ?? 0), 0);
  const flash = useFlash(bookValue);

  return (
    <div>
      <header className="hero">
        <Odometer value={formatMoney(bookValue)} speed="hero" className={flash} dataTestid="book-value" />
        <div className="hero-sub" style={{ color: plColor(unrealized) }}>
          {formatSignedMoney(unrealized)} unrealized
        </div>
      </header>
      {positions.some((p) => p.mark) && (
        <TickerTape
          items={positions
            .filter((p) => p.mark)
            .map((p) => ({
              symbol: p.symbol,
              price: p.mark!.price,
              up: (p.unrealizedPl ?? 0) >= 0,
            }))}
        />
      )}
      <h2 className="section-title">Positions</h2>
      {positions.length === 0 && <div className="empty">No open positions — tap + to add your first trade.</div>}
      {positions.map((p) => (
        <button
          key={p.symbol}
          className={justAdded?.kind === 'trade' && justAdded.symbol === p.symbol ? 'row stamp-in' : 'row'}
          style={rowButtonStyle}
          onClick={() => onMark(p.symbol)}
        >
          <div className="row-main">
            <div className="row-sym">{p.symbol}</div>
            <div className="row-sub">
              {p.qty} sh · avg {formatMoney(p.avgCost)} ·{' '}
              {p.mark
                ? `marked ${agoLabel(p.mark.marked_at)}${p.mark.source === 'manual' ? ' by you' : ''}`
                : 'no mark yet — tap to set price'}
            </div>
          </div>
          <div className="row-right">
            <div>{p.marketValue != null ? formatMoney(p.marketValue) : '—'}</div>
            {p.unrealizedPl != null && p.unrealizedPlPct != null && (
              <div className="row-pl" style={{ color: plColor(p.unrealizedPl) }}>
                {formatSignedMoney(p.unrealizedPl)} · {formatSignedPct(p.unrealizedPlPct)}
              </div>
            )}
          </div>
        </button>
      ))}
    </div>
  );
}
