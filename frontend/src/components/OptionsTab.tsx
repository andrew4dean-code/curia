import { useState } from 'react';
import type { TabProps } from './PortfolioTab';
import { canMarkQuiet, fridaysOfMonth, monthScore, slideDirection, weekFridayFor } from '../lib/board';
import { needsSettling, optionRealizedPl, premiumCollected } from '../lib/optionsMath';
import { expiryLabel, fmtShortDate, nextFriday, todayIso } from '../lib/time';
import { formatMoney, formatSignedMoney } from '../lib/format';
import { Odometer } from './Odometer';

const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December'];

export function OptionsTab({ snap, onSettleOption, onSellWeek, onViewRecord, onMarkQuiet, onClearQuiet, strikingOptionId, onPasteFill }: TabProps) {
  const now = new Date();
  const [ym, setYm] = useState<[number, number]>([now.getFullYear(), now.getMonth() + 1]);
  // Undefined until the chevrons actually move the month: the board-in-left/
  // right slide-in must only play on a real month change, not on first
  // render, where the week-card deal-in (wk-deal) already carries the
  // entrance on its own.
  const [slide, setSlide] = useState<'left' | 'right' | undefined>(undefined);
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
    const next: [number, number] = [d.getFullYear(), d.getMonth() + 1];
    setSlide(slideDirection(ym, next));
    setYm(next);
  }

  return (
    <div>
      <div className="board-head-sticky">
        <header className="board-head">
          <button aria-label="Previous month" onClick={() => shift(-1)}>‹</button>
          <h1>{MONTHS[month - 1]}</h1>
          <button aria-label="Next month" onClick={() => shift(1)}>›</button>
        </header>
        <div className="board-score">
          <Odometer className="board-score-amount" value={formatMoney(score)} speed="hero" dataTestid="month-score" /> collected this month
        </div>
        {onPasteFill && (
          <div className="link-row" style={{ margin: '2px 0 10px' }}>
            <button type="button" onClick={onPasteFill} data-testid="paste-confirmation">
              paste a confirmation
            </button>
          </div>
        )}
      </div>
      <div className="board-weeks" data-slide={slide} key={`${year}-${month}`}>
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
            <div key={friday} className={`wk${isPast ? ' past' : ''}${isLive ? ' live' : ''}${rows.length === 0 && !isQuiet && !canQuiet ? ' wk-bare' : ''}`} style={{ ['--wk-i' as string]: Math.min(i, 4) }}>
              <span className="wk-num" aria-hidden="true">{i + 1}</span>
              <div className="wk-label">
                Week {i + 1} · Fri {fmtShortDate(friday)}
                {isLive ? ` · ${liveNote}` : ''}
              </div>
              <div className="wk-rule" />
              {/* One skeleton for both states. Open and settled used to be two different
                  rows — a 34px maroon disc reading "C" against a small green tick — so the
                  settled row, which carries the money actually kept, read lighter than the
                  open one, and neither amount sat in a column you could scan down. Now the
                  figure is always the last cell of the same grid, and the state shows in
                  its sign, its colour and the tag under it. */}
              {rows.map((o) => {
                const settled = o.status !== 'OPEN';
                const pl = optionRealizedPl(o) ?? 0;
                const unsettled = !settled && needsSettling(o, today);
                return (
                  <button
                    key={o.id}
                    type="button"
                    className={`wk-row${settled ? ' settled' : ''}${o.id === strikingOptionId ? ' striking' : ''}`}
                    onClick={() => (settled ? onViewRecord?.(o) : onSettleOption(o))}
                  >
                    <span className="wk-row-what">
                      {o.symbol} ${o.strike} {o.opt_type} · {o.contracts}x
                    </span>
                    <span className="wk-row-amt" style={settled ? { color: pl >= 0 ? 'var(--pl-up)' : 'var(--pl-down)' } : undefined}>
                      {settled ? formatSignedMoney(pl) : formatMoney(premiumCollected(o))}
                    </span>
                    {(settled || unsettled) && (
                      <span className="wk-row-meta">
                        {settled && <span className="wk-tag">{o.status.replace('_', ' ').toLowerCase()}</span>}
                        {unsettled && <span className="wk-todo">needs settling</span>}
                      </span>
                    )}
                  </button>
                );
              })}
              {isQuiet && (
                <div className="wk-quiet">
                  <span>No trades this week.</span>
                  {onClearQuiet && (
                    <button
                      type="button"
                      className="wk-quiet-undo"
                      aria-label={`undo the quiet mark on ${fmtShortDate(friday)}`}
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
                        ? `log a trade for the week of ${fmtShortDate(friday)}`
                        : `sell the week of ${fmtShortDate(friday)}`
                    }
                    onClick={() => onSellWeek(friday)}
                  >
                    {/* An empty week puts its label and its button on one line, and the full
                        phrasing does not fit beside the date — it squeezed the label to 132px
                        against the ~150px it needs and wrapped it in two. The short form is
                        for the eye; the aria-label above still names the week in full. */}
                    {isPast
                      ? rows.length > 0
                        ? '＋ log another'
                        : '＋ log'
                      : rows.length > 0
                        ? '＋ sell another'
                        : '＋ sell'}
                  </button>
                )}
                {canQuiet && onMarkQuiet && (
                  <button
                    type="button"
                    className="wk-pill wk-pill-ghost"
                    aria-label={`didn't trade the week of ${fmtShortDate(friday)}`}
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
