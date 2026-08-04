import { useCallback, useRef, useState } from 'react';
import { WheelDial } from './WheelDial';
import { CardFiligree } from './CardFiligree';
import { Odometer } from './Odometer';
import { useFlash } from '../hooks/useFlash';
import { expiryLabel, fmtShortDate } from '../lib/time';
import { formatMoney, formatSignedMoney, plColor } from '../lib/format';
import type { Mark, OptionPosition, WheelSummary } from '../lib/types';

/** How long the ornament sits fully drawn before it starts to go, and how long it takes
 *  to go. Five seconds of drying was the ask: long enough to look at, short enough that
 *  it is gone before you next touch the card. */
export const FILIGREE_HOLD_MS = 900;
export const FILIGREE_FADE_MS = 5000;

const STAGE_WORDS: Record<string, string> = {
  SELL_PUT: 'selling puts',
  ASSIGNED: 'assigned',
  SELLING_CALLS: 'selling calls',
  CALLED_AWAY: 'called away',
};

export function WheelCard({
  summary,
  mark,
  openCalls,
  onComplete,
  onAbandon,
  expanded,
  onToggle,
}: {
  summary: WheelSummary;
  mark: Mark | null;
  /** Every open call on the wheel, not just the first. Two strikes on one symbol is a
   *  real position, and showing one of them names the wrong ceiling. */
  openCalls: OptionPosition[];
  onComplete: () => void;
  onAbandon: () => void;
  expanded: boolean;
  onToggle: () => void;
}) {
  const { wheel, stage, sharesHeld, rawBasis, premiumBanked, trueBasis, closeToday, markMissing, cap, putExposure } = summary;
  const flat = sharesHeld <= 0;
  const flash = useFlash(closeToday);

  /* The figure is always the ceiling. What changes is whether the ceiling is binding:
     below every strike the calls expire and the cap costs nothing, so the honest label
     is still "if you closed today". Above one, the shares go at the strike and saying
     "closed today" would be describing a trade you cannot make. */
  const capped = cap != null && cap.giveUp > 0;
  /* The mirror on the put side. A flat wheel showing banked premium reads as pure profit
     right up until the stock falls through the strike, at which point the premium is
     paying for shares you are already down on. */
  const exposed = putExposure != null && putExposure.underwater > 0;
  const totalLabel = flat
    ? exposed
      ? putExposure.strike != null
        ? `If assigned at ${formatMoney(putExposure.strike)}`
        : 'If assigned'
      : 'Banked this wheel'
    : capped
      ? cap.strike != null
        ? `If called away at ${formatMoney(cap.strike)}`
        : 'If called away'
      : 'If you closed today';

  /* The border is drawn on a key rather than a boolean: a second sweep arriving while the
     first ornament is still drying has to restart the CSS animations, and re-rendering
     the same element with the same class does not. A fresh key remounts them. */
  const [run, setRun] = useState<{ id: number; draw: number } | null>(null);
  const seq = useRef(0);
  const timer = useRef<number | null>(null);
  const onSweepStart = useCallback((ms: number) => {
    seq.current += 1;
    setRun({ id: seq.current, draw: ms });
    if (timer.current !== null) window.clearTimeout(timer.current);
    // Unmount once it has finished drying, so a card sitting idle carries no ornament
    // and no running animations.
    timer.current = window.setTimeout(() => {
      timer.current = null;
      setRun(null);
    }, ms + FILIGREE_HOLD_MS + FILIGREE_FADE_MS + 200);
  }, []);

  // Basis walk domain: pad 4% around everything that matters.
  const points = [rawBasis, trueBasis, mark?.price].filter((v): v is number => v != null && v > 0);
  const lo = points.length ? Math.min(...points) * 0.96 : 0;
  const hi = points.length ? Math.max(...points) * 1.04 : 1;
  const pct = (v: number) => Math.max(0, Math.min(100, ((v - lo) / (hi - lo)) * 100));

  return (
    <div className={`wheel-card${expanded ? '' : ' folded'}`} data-stage={stage}>
      {run && (
        <CardFiligree key={run.id} drawMs={run.draw} holdMs={FILIGREE_HOLD_MS} fadeMs={FILIGREE_FADE_MS} />
      )}
      {/* The head is the toggle in both states. It cannot wrap the whole card — the expanded
          card holds its own buttons, and a button inside a button is not a thing. */}
      <button className="wheel-card-toggle" onClick={onToggle} aria-expanded={expanded}
        aria-label={`${expanded ? 'Collapse' : 'Expand'} the ${wheel.symbol} wheel`}>
        <div className="wheel-card-head">
          <div className="wheel-card-title">
            {wheel.symbol}
            {!flat && rawBasis != null && <span className="wheel-card-sh"> · {sharesHeld} sh</span>}
          </div>
          {expanded && openCalls.length === 1 && (
            <span className="wheel-card-tag">
              CC ${openCalls[0].strike} · exp {expiryLabel(openCalls[0].expiration)}
            </span>
          )}
          {expanded && openCalls.length > 1 && (
            <span className="wheel-card-tag">{openCalls.length} calls out</span>
          )}
          {/* Folded, the card is a one-line summary: the figure the wheel exists to produce
              sits on the title line, because that is the whole reason to glance at it. */}
          {!expanded && (
            <span className={`wheel-fold-amount ${flash}`} style={{ color: plColor(closeToday) }}>
              <Odometer value={formatSignedMoney(closeToday)} speed="detail" dataTestid={`wheel-total-${wheel.id}`} />
            </span>
          )}
        </div>
        <div className="wheel-card-sub">
          Wheel Nº {wheel.no} · {expanded ? `started ${fmtShortDate(wheel.opened_at)} · ` : ''}week {summary.weeks}
          {!expanded && ` · ${STAGE_WORDS[stage] ?? stage.toLowerCase().replace('_', ' ')}`}
        </div>
      </button>
      {!expanded ? null : (
      <>
      <div className="wheel-dial-wrap">
        <WheelDial stage={stage} callsSold={summary.callsSold} no={wheel.no} weeks={summary.weeks} wheelId={wheel.id} onSweepStart={onSweepStart} />
      </div>
      <div className="wheel-tiles">
        {/* An em dash is not a figure — only hand the odometer something it can count. */}
        <div className="wheel-tile">
          <b>Raw basis</b>
          <span>{rawBasis != null ? <Odometer value={formatMoney(rawBasis)} speed="detail" /> : '—'}</span>
        </div>
        <div className="wheel-tile">
          <b>Premium banked</b>
          <span style={{ color: plColor(premiumBanked) }}>
            <Odometer value={formatMoney(premiumBanked)} speed="detail" />
          </span>
        </div>
        <div className="wheel-tile">
          <b>True basis</b>
          <span>{trueBasis != null ? <Odometer value={formatMoney(trueBasis)} speed="detail" /> : '—'}</span>
        </div>
      </div>
      {!flat && rawBasis != null && trueBasis != null && (
        <div className="walkbar">
          <div className="walkbar-track">
            <div
              className="walkbar-premium"
              style={{ left: `${pct(trueBasis)}%`, width: `${Math.max(1.5, pct(rawBasis) - pct(trueBasis))}%` }}
            />
            {mark && <div className="walkbar-needle" style={{ left: `${pct(mark.price)}%` }} />}
          </div>
          <div className="walkbar-labels">
            {/* Ordered by value so each label sits on the same side as the marker
                it names — a fixed order reads backwards whenever price is above
                basis, which is the usual case on a winning wheel. */}
            {[
              ...(mark ? [{ key: 'price', text: `price ${formatMoney(mark.price)}`, at: mark.price }] : []),
              { key: 'true', text: `true ${formatMoney(trueBasis)}`, at: trueBasis },
              { key: 'raw', text: `raw ${formatMoney(rawBasis)}`, at: rawBasis },
            ]
              .sort((a, b) => a.at - b.at)
              .map((l) => (
                <span key={l.key}>{l.text}</span>
              ))}
            {!mark && <span>no price yet</span>}
          </div>
        </div>
      )}
      <div className="wheel-total">
        <b>{totalLabel}</b>
        <div className={`wheel-total-amount ${flash}`} style={{ color: plColor(closeToday) }}>
          <Odometer value={formatSignedMoney(closeToday)} speed="detail" dataTestid={`wheel-total-${wheel.id}`} />
        </div>
        {/* The ceiling alone hides how far the stock has run past it. This line is the
            difference between the two, so the cap is visible as a cost and not as a
            figure that has mysteriously stopped moving. */}
        {capped && (
          <small className="wheel-giveup" data-testid={`wheel-giveup-${wheel.id}`}>
            giving up {formatMoney(cap.giveUp)}{' '}
            {cap.strike != null ? `above ${formatMoney(cap.strike)}` : 'above your strikes'}
          </small>
        )}
        {/* The label names the strike, so this names the price it has fallen to — the two
            lines together say what assignment costs and how far the stock has gone. */}
        {exposed && (
          <small className="wheel-underwater" data-testid={`wheel-underwater-${wheel.id}`}>
            {formatMoney(putExposure.underwater)} under water
            {mark ? ` at ${formatMoney(mark.price)}` : ''}
            {flat ? '' : ` on ${putExposure.shares} sh you would have to buy`}
          </small>
        )}
        {cap != null && cap.nakedContracts > 0 && (
          <small className="wheel-naked" data-testid={`wheel-naked-${wheel.id}`}>
            {cap.nakedContracts} contract{cap.nakedContracts === 1 ? '' : 's'} with no shares behind{' '}
            {cap.nakedContracts === 1 ? 'it' : 'them'} — not in the figure above
          </small>
        )}
        {markMissing && !flat && <small>no current price — share leg valued at raw basis</small>}
      </div>
      {stage === 'CALLED_AWAY' && (
        <button className="btn" onClick={onComplete}>
          Complete this wheel
        </button>
      )}
      <div className="link-row" style={{ margin: '8px 0 0' }}>
        <button onClick={onAbandon}>abandon wheel</button>
      </div>
      </>
      )}
    </div>
  );
}
