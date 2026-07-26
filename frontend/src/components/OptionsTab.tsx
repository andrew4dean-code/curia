import { useState } from 'react';
import type { TabProps } from './PortfolioTab';
import { canMarkQuiet, fridaysOfMonth, monthScore, weekFridayFor } from '../lib/board';
import { needsSettling, optionRealizedPl, premiumCollected } from '../lib/optionsMath';
import { expiryLabel, nextFriday, todayIso } from '../lib/time';
import { formatMoney, formatSignedMoney } from '../lib/format';

const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December'];

function fmtShort(dateStr: string): string {
  const [, m, d] = dateStr.split('-').map(Number);
  return `${MONTHS[m - 1].slice(0, 3)} ${d}`;
}

export function OptionsTab({ snap, onSettleOption, onSellWeek, onViewRecord, onMarkQuiet, onClearQuiet }: TabProps) {
  const now = new Date();
  const [ym, setYm] = useState<[number, number]>([now.getFullYear(), now.getMonth() + 1]);
  const [year, month] = ym;
  const fridays = fridaysOfMonth(year, month);
  const today = todayIso();
  const score = monthScore(snap.options, year, month);
  const byWeek = new Map<string, typeof snap.options>();
  for (const o of snap.options) {
    const wk = weekFridayFor(o.expiration);
    byWeek.set(wk, [...(byWeek.get(wk) ?? []), o]);
  }
  const realLive = nextFriday();
  const liveFriday = fridays.includes(realLive) ? realLive : undefined;

  function shift(delta: number) {
    const d = new Date(year, month - 1 + delta, 1);
    setYm([d.getFullYear(), d.getMonth() + 1]);
  }

  return (
    <div>
      <header className="board-head">
        <button aria-label="Previous month" onClick={() => shift(-1)}>‹</button>
        <h1>{MONTHS[month - 1]}</h1>
        <button aria-label="Next month" onClick={() => shift(1)}>›</button>
      </header>
      <div className="board-score">
        <span className="board-score-amount">{formatMoney(score)}</span> collected this month
      </div>
      <div className="board-weeks">
        {fridays.map((friday, i) => {
          const rows = byWeek.get(friday) ?? [];
          const isPast = friday < today;
          const isLive = friday === liveFriday;
          const isQuiet = rows.length === 0 && snap.quietWeeks.includes(friday);
          const canQuiet = rows.length === 0 && !isQuiet && canMarkQuiet(friday, today);
          const liveNote = isLive
            ? expiryLabel(friday) === 'today'
              ? 'expires today'
              : `${expiryLabel(friday)} left`
            : '';
          return (
            <div key={friday} className={`wk${isPast ? ' past' : ''}${isLive ? ' live' : ''}`}>
              <span className="wk-num" aria-hidden="true">{i + 1}</span>
              <div className="wk-label">
                Week {i + 1} · Fri {fmtShort(friday)}
                {isLive ? ` · ${liveNote}` : ''}
              </div>
              <div className="wk-rule" />
              {rows.map((o) =>
                o.status === 'OPEN' ? (
                  <button key={o.id} className="wk-chip" onClick={() => onSettleOption(o)}>
                    <span className="wk-seal">{o.opt_type === 'PUT' ? 'P' : 'C'}</span>
                    <span className="wk-chip-text">
                      {o.symbol} ${o.strike} {o.opt_type} · {o.contracts}x · {formatMoney(premiumCollected(o))}
                      {needsSettling(o, today) && <span className="wk-todo">needs settling</span>}
                    </span>
                  </button>
                ) : (
                  <button key={o.id} type="button" className="wk-settled" style={{ color: (optionRealizedPl(o) ?? 0) >= 0 ? 'var(--pl-up)' : 'var(--pl-down)' }} onClick={() => onViewRecord?.(o)}>
                    ✓ {o.symbol} ${o.strike} {o.opt_type} — {(optionRealizedPl(o) ?? 0) >= 0 ? 'kept' : 'gave back'} {formatSignedMoney(optionRealizedPl(o) ?? 0)}
                  </button>
                ),
              )}
              {isQuiet && (
                <div className="wk-quiet">
                  <span>No trades this week.</span>
                  {onClearQuiet && (
                    <button
                      type="button"
                      className="wk-quiet-undo"
                      aria-label={`undo the quiet mark on ${fmtShort(friday)}`}
                      onClick={() => onClearQuiet(friday)}
                    >
                      undo
                    </button>
                  )}
                </div>
              )}
              <div className="wk-actions">
                {onSellWeek && (
                  <button
                    className="wk-pill wk-pill-go"
                    aria-label={
                      isPast
                        ? `log a trade for the week of ${fmtShort(friday)}`
                        : `sell the week of ${fmtShort(friday)}`
                    }
                    onClick={() => onSellWeek(friday)}
                  >
                    {isPast
                      ? rows.length > 0
                        ? '＋ log another'
                        : '＋ log a trade'
                      : rows.length > 0
                        ? '＋ sell another'
                        : '＋ sell this week'}
                  </button>
                )}
                {canQuiet && onMarkQuiet && (
                  <button
                    type="button"
                    className="wk-pill wk-pill-ghost"
                    aria-label={`didn't trade the week of ${fmtShort(friday)}`}
                    onClick={() => onMarkQuiet(friday)}
                  >
                    didn't trade
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
