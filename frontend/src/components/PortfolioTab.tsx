import { useState } from 'react';
import type { Snapshot } from '../lib/api';
import type { OpenPosition, OptionPosition, Trade, Wheel, WheelSummary } from '../lib/types';
import { computeOpenPositions } from '../lib/positions';
import { memberOptions, summarizeWheel } from '../lib/wheelMath';
import { optionRealizedPl } from '../lib/optionsMath';
import { WheelCard } from './WheelCard';
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
  onPosition?: (p: OpenPosition) => void;
  onSettleOption: (o: OptionPosition) => void;
  onEditOption: (o: OptionPosition) => void;
  onSellWeek?: (expiration: string) => void;
  onViewRecord?: (o: OptionPosition) => void;
  onMarkQuiet?: (friday: string) => void;
  onClearQuiet?: (friday: string) => void;
  onFreshWheel?: () => void;
  onCompleteWheel?: (s: WheelSummary) => void;
  onAbandonWheel?: (w: Wheel) => void;
  onViewWheelRecord?: (w: Wheel) => void;
  justAdded?: { kind: 'trade' | 'option'; id: number; symbol: string } | null;
  strikingTradeId?: number | null;
  strikingOptionId?: number | null;
  onDeleted?: (id?: number) => Promise<void>;
}

const rowButtonStyle = { width: '100%', background: 'none', border: 'none', borderBottom: '1px solid var(--rule)', textAlign: 'left', font: 'inherit', color: 'inherit' } as const;

function fmtShort(dateStr: string): string {
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

export function PortfolioTab({
  snap,
  onMark,
  onPosition,
  onFreshWheel,
  onCompleteWheel,
  onAbandonWheel,
  onViewWheelRecord,
  justAdded,
}: TabProps) {
  const [showArchive, setShowArchive] = useState(false);

  const activeWheels = snap.wheels.filter((w) => w.closed_at === null);
  const completedWheels = [...snap.wheels]
    .filter((w) => w.closed_at !== null)
    .sort((a, b) => (b.closed_at ?? '').localeCompare(a.closed_at ?? '') || b.id - a.id);
  const wheelSymbols = new Set(activeWheels.map((w) => w.symbol));
  const summaries = activeWheels
    .map((w) => summarizeWheel(w, snap.trades, snap.options, snap.marks))
    .sort((a, b) => b.wheel.id - a.wheel.id);

  const positions = computeOpenPositions(snap.trades, snap.marks);
  const holdings = positions.filter((p) => !wheelSymbols.has(p.symbol));
  const bookValue = positions.reduce((s, p) => s + (p.marketValue ?? p.qty * p.avgCost), 0);
  const unrealized = positions.reduce((s, p) => s + (p.unrealizedPl ?? 0), 0);
  const flash = useFlash(bookValue);

  return (
    <div>
      {summaries.map((s) => {
        const openCall =
          memberOptions(s.wheel, snap.options).find(
            (o) => o.status === 'OPEN' && o.opt_type === 'CALL',
          ) ?? null;
        return (
          <WheelCard
            key={s.wheel.id}
            summary={s}
            mark={snap.marks.find((m) => m.symbol === s.wheel.symbol) ?? null}
            openCall={openCall}
            onComplete={() => onCompleteWheel?.(s)}
            onAbandon={() => onAbandonWheel?.(s.wheel)}
          />
        );
      })}
      {summaries.length > 0 && onFreshWheel && (
        <div className="link-row" style={{ margin: '2px 0 10px' }}>
          <button onClick={onFreshWheel}>＋ fresh wheel</button>
        </div>
      )}
      {summaries.length === 0 && onFreshWheel && (
        <button className="fresh-wheel-panel" onClick={onFreshWheel}>
          <span className="fresh-wheel-crest">◎</span>
          Begin a fresh wheel
          <small>declare a campaign — every trade and premium on its symbol joins the wheel</small>
        </button>
      )}

      <header className="hero" style={summaries.length > 0 ? { padding: '10px 0 6px' } : undefined}>
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
      <h2 className="section-title">{wheelSymbols.size > 0 ? 'Other holdings' : 'Positions'}</h2>
      {holdings.length === 0 && (
        <div className="empty">
          {positions.length === 0
            ? 'No open positions — tap + to add your first trade.'
            : 'Everything you hold is riding a wheel.'}
        </div>
      )}
      {holdings.map((p) => (
        <button
          key={p.symbol}
          className={justAdded?.kind === 'trade' && justAdded.symbol === p.symbol ? 'row stamp-in' : 'row'}
          style={rowButtonStyle}
          onClick={() => (onPosition ? onPosition(p) : onMark(p.symbol))}
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

      {completedWheels.length > 0 && (
        <>
          <div className="link-row">
            <button onClick={() => setShowArchive(!showArchive)}>
              {showArchive ? 'Hide wheel archive' : `Wheel archive (${completedWheels.length})`}
            </button>
          </div>
          {showArchive &&
            completedWheels.map((w) => {
              const s = summarizeWheel(w, snap.trades, snap.options, snap.marks);
              const opts = memberOptions(w, snap.options);
              const settledCount = opts.filter((o) => o.status !== 'OPEN' && optionRealizedPl(o) != null).length;
              return (
                <button
                  key={w.id}
                  className="row row-tap"
                  onClick={() => onViewWheelRecord?.(w)}
                >
                  <div className="row-main">
                    <div className="row-sym">
                      {w.symbol} · Nº {w.no}
                    </div>
                    <div className="row-sub">
                      {fmtShort(w.opened_at)} → {w.closed_at ? fmtShort(w.closed_at) : ''} · {s.weeks}w ·{' '}
                      {settledCount} option{settledCount === 1 ? '' : 's'} settled
                    </div>
                  </div>
                  <div className="row-right">
                    <div style={{ color: plColor(s.closeToday), fontFamily: 'var(--font-display)', fontWeight: 700 }}>
                      {formatSignedMoney(s.closeToday)}
                    </div>
                  </div>
                </button>
              );
            })}
        </>
      )}
    </div>
  );
}
