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

export function OptionsTab({ snap, onSettleOption, onSellWeek }: TabProps) {
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
      <div className="board-score">{formatMoney(score)} collected this month</div>
      <div className="board-rail">
        {fridays.map((friday, i) => {
          const rows = byWeek.get(friday) ?? [];
          const isPast = friday < today;
          const isLive = friday === liveFriday;
          return (
            <div key={friday} className={`wk${isPast ? ' past' : ''}${isLive ? ' live' : ''}`}>
              <div className="wk-label">
                WK {i + 1} · Fri {fmtShort(friday)}
                {isLive ? ` · ${expiryLabel(friday)} left` : ''}
              </div>
              {rows.length > 0 && (
                <div className="wk-line">
                  {rows.map((o) =>
                    o.status === 'OPEN' ? (
                      <button key={o.id} className="wk-chip" onClick={() => onSettleOption(o)}>
                        <span className="wk-seal">C</span>
                        {o.symbol} ${o.strike} {o.opt_type} · {o.contracts}x · {formatMoney(premiumCollected(o))}
                      </button>
                    ) : (
                      <div key={o.id} className="wk-settled" style={{ color: (optionRealizedPl(o) ?? 0) >= 0 ? 'var(--pl-up)' : 'var(--pl-down)' }}>
                        ✓ {o.symbol} ${o.strike} {o.opt_type} — {(optionRealizedPl(o) ?? 0) >= 0 ? 'kept' : 'gave back'} {formatSignedMoney(optionRealizedPl(o) ?? 0)}
                      </div>
                    ),
                  )}
                </div>
              )}
              {rows.length === 0 && !isPast && onSellWeek && (
                <button className="wk-sell" aria-label={`sell the week of ${fmtShort(friday)}`} onClick={() => onSellWeek(friday)}>
                  ＋ tap the line to sell this week
                </button>
              )}
              {rows.length === 0 && isPast && <div className="wk-line" />}
            </div>
          );
        })}
      </div>
    </div>
  );
}
