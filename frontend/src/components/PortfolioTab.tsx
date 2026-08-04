import { useState } from 'react';
import type { Snapshot } from '../lib/api';

/** Which wheels you have folded shut. Persisted because App remounts this tab on every
 *  switch, so component state alone forgets the choice the moment you look at Options. */
const FOLDED_WHEELS_KEY = 'curia-folded-wheels';
import type { OpenPosition, OptionPosition, Trade, Wheel, WheelSummary } from '../lib/types';
import { computeOpenPositions, computeUnwheeledPositions } from '../lib/positions';
import { memberOptions, openCalls, summarizeWheel } from '../lib/wheelMath';
import { optionRealizedPl } from '../lib/optionsMath';
import { WheelCard } from './WheelCard';
import { Odometer } from './Odometer';
import { TickerTape } from './TickerTape';
import { useFlash } from '../hooks/useFlash';
import { formatMoney, formatSignedMoney, formatSignedPct, plColor } from '../lib/format';
import { agoLabel, fmtDateSpan, fmtShortDate } from '../lib/time';

export interface TabProps {
  snap: Snapshot;
  /** Re-read the server. Resolves with the new snapshot, or null if the read failed. */
  onRefresh: () => Promise<Snapshot | null>;
  onEditTrade: (t: Trade | null) => void;
  onMark: (symbol: string) => void;
  onPosition?: (p: OpenPosition) => void;
  onSettleOption: (o: OptionPosition) => void;
  onEditOption: (o: OptionPosition) => void;
  onSellWeek?: (expiration: string) => void;
  /** Open the paste-a-confirmation sheet. */
  onPasteFill?: () => void;
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
  /* Wheels open EXPANDED, and stay that way until you fold one yourself.

     They shipped folded-by-default to keep the book value above the fold, which mattered
     when the card ran 559px. In use that was wrong twice over. With a single active wheel
     there is no density problem to solve, and worse, the open/closed choice lived in
     component state while App keys the tab wrapper on `tab` — so switching to Options and
     back UNMOUNTED this component and threw the choice away. A card you had just opened
     was folded again the next time you looked at it.

     So: the set records what you FOLDED, not what you opened, and it is persisted. Default
     open, your choice survives a tab switch, a reload, and a new session. */
  const [foldedWheels, setFoldedWheels] = useState<Set<number>>(() => {
    try {
      const raw = localStorage.getItem(FOLDED_WHEELS_KEY);
      return new Set<number>(raw ? (JSON.parse(raw) as number[]) : []);
    } catch {
      return new Set<number>();
    }
  });

  function toggleWheel(id: number) {
    setFoldedWheels((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      try {
        localStorage.setItem(FOLDED_WHEELS_KEY, JSON.stringify([...next]));
      } catch {
        /* private mode, a full quota — the fold still works for this session. */
      }
      return next;
    });
  }

  const activeWheels = snap.wheels.filter((w) => w.closed_at === null);
  const completedWheels = [...snap.wheels]
    .filter((w) => w.closed_at !== null)
    .sort((a, b) => (b.closed_at ?? '').localeCompare(a.closed_at ?? '') || b.id - a.id);
  const wheelSymbols = new Set(activeWheels.map((w) => w.symbol));
  const summaries = activeWheels
    .map((w) => summarizeWheel(w, snap.trades, snap.options, snap.marks))
    .sort((a, b) => b.wheel.id - a.wheel.id);

  const positions = computeOpenPositions(snap.trades, snap.marks);
  // Not "every position whose symbol has no wheel" — a wheel only claims trades from the
  // day it opened, so shares owned before that belong to no wheel and were falling out of
  // both this list and the card above it.
  const holdings = computeUnwheeledPositions(snap.trades, snap.marks, snap.wheels);
  const bookValue = positions.reduce((s, p) => s + (p.marketValue ?? p.qty * p.avgCost), 0);
  const unrealized = positions.reduce((s, p) => s + (p.unrealizedPl ?? 0), 0);
  const flash = useFlash(bookValue);

  return (
    <div>
      {summaries.map((s) => {
        // Every open call, not the first one found: the cap is set by all of them, and
        // a card naming one strike while a second is in the money reads as a promise
        // the position does not make.
        const calls = openCalls(memberOptions(s.wheel, snap.options));
        return (
          <WheelCard
            key={s.wheel.id}
            summary={s}
            mark={snap.marks.find((m) => m.symbol === s.wheel.symbol) ?? null}
            openCalls={calls}
            onComplete={() => onCompleteWheel?.(s)}
            onAbandon={() => onAbandonWheel?.(s.wheel)}
            expanded={!foldedWheels.has(s.wheel.id)}
            onToggle={() => toggleWheel(s.wheel.id)}
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
          <Odometer value={formatSignedMoney(unrealized)} speed="detail" dataTestid="unrealized" /> unrealized
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
          data-testid={`holding-${p.symbol}`}
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
            {wheelSymbols.has(p.symbol) && (
              <div className="row-sub">
                not on the wheel — bought before it began
              </div>
            )}
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
                      {w.closed_at ? fmtDateSpan(w.opened_at, w.closed_at) : fmtShortDate(w.opened_at)} · {s.weeks}w ·{' '}
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
