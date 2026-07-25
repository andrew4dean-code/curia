import { useState } from 'react';
import type { TabProps } from './PortfolioTab';
import { fridaysOfMonth, monthScore, weekFridayFor } from '../lib/board';
import { optionRealizedPl, premiumCollected } from '../lib/optionsMath';
import { expiryLabel, nextFriday } from '../lib/time';
import { formatMoney, formatSignedMoney } from '../lib/format';

const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December'];

function fmtShort(dateStr: string): string {
  const [, m, d] = dateStr.split('-').map(Number);
  return `${MONTHS[m - 1].slice(0, 3)} ${d}`;
}

function localTodayIso(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function OptionsTab({ snap, onSettleOption, onSellWeek, onViewRecord }: TabProps) {
  const now = new Date();
  const [ym, setYm] = useState<[number, number]>([now.getFullYear(), now.getMonth() + 1]);
  const [year, month] = ym;
  const fridays = fridaysOfMonth(year, month);
  const today = localTodayIso();
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
                    <span className="wk-seal">C</span>
                    <span className="wk-chip-text">
                      {o.symbol} ${o.strike} {o.opt_type} · {o.contracts}x · {formatMoney(premiumCollected(o))}
                    </span>
                  </button>
                ) : (
                  <button key={o.id} type="button" className="wk-settled" style={{ color: (optionRealizedPl(o) ?? 0) >= 0 ? 'var(--pl-up)' : 'var(--pl-down)' }} onClick={() => onViewRecord?.(o)}>
                    ✓ {o.symbol} ${o.strike} {o.opt_type} — {(optionRealizedPl(o) ?? 0) >= 0 ? 'kept' : 'gave back'} {formatSignedMoney(optionRealizedPl(o) ?? 0)}
                  </button>
                ),
              )}
              {!isPast && onSellWeek && (
                <button className="wk-sell" aria-label={`sell the week of ${fmtShort(friday)}`} onClick={() => onSellWeek(friday)}>
                  {rows.length > 0 ? '＋ sell another this week' : '＋ tap to sell this week'}
                </button>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
