import { WheelDial } from './WheelDial';
import { Odometer } from './Odometer';
import { useFlash } from '../hooks/useFlash';
import { expiryLabel } from '../lib/time';
import { formatMoney, formatSignedMoney, plColor } from '../lib/format';
import type { Mark, OptionPosition, WheelSummary } from '../lib/types';

function fmtShort(dateStr: string): string {
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

export function WheelCard({
  summary,
  mark,
  openCall,
  onComplete,
  onAbandon,
}: {
  summary: WheelSummary;
  mark: Mark | null;
  openCall: OptionPosition | null;
  onComplete: () => void;
  onAbandon: () => void;
}) {
  const { wheel, stage, sharesHeld, rawBasis, premiumBanked, trueBasis, closeToday, markMissing } = summary;
  const flat = sharesHeld <= 0;
  const flash = useFlash(closeToday);

  // Basis walk domain: pad 4% around everything that matters.
  const points = [rawBasis, trueBasis, mark?.price].filter((v): v is number => v != null && v > 0);
  const lo = points.length ? Math.min(...points) * 0.96 : 0;
  const hi = points.length ? Math.max(...points) * 1.04 : 1;
  const pct = (v: number) => Math.max(0, Math.min(100, ((v - lo) / (hi - lo)) * 100));

  return (
    <div className="wheel-card" data-stage={stage}>
      <div className="wheel-card-head">
        <div className="wheel-card-title">
          {wheel.symbol}
          {!flat && rawBasis != null && <span className="wheel-card-sh"> · {sharesHeld} sh</span>}
        </div>
        {openCall && (
          <span className="wheel-card-tag">
            CC ${openCall.strike} · exp {expiryLabel(openCall.expiration)}
          </span>
        )}
      </div>
      <div className="wheel-card-sub">
        Wheel Nº {wheel.no} · started {fmtShort(wheel.opened_at)} · week {summary.weeks}
      </div>
      <div className="wheel-dial-wrap">
        <WheelDial stage={stage} callsSold={summary.callsSold} no={wheel.no} weeks={summary.weeks} />
      </div>
      <div className="wheel-tiles">
        <div className="wheel-tile">
          <b>Raw basis</b>
          <span>{rawBasis != null ? formatMoney(rawBasis) : '—'}</span>
        </div>
        <div className="wheel-tile">
          <b>Premium banked</b>
          <span style={{ color: plColor(premiumBanked) }}>{formatMoney(premiumBanked)}</span>
        </div>
        <div className="wheel-tile">
          <b>True basis</b>
          <span>{trueBasis != null ? formatMoney(trueBasis) : '—'}</span>
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
            <span>{mark ? `price ${formatMoney(mark.price)}` : 'no price yet'}</span>
            <span>true {formatMoney(trueBasis)}</span>
            <span>raw {formatMoney(rawBasis)}</span>
          </div>
        </div>
      )}
      <div className="wheel-total">
        <b>{flat ? 'Banked this wheel' : 'If you closed today'}</b>
        <div className={`wheel-total-amount ${flash}`} style={{ color: plColor(closeToday) }}>
          <Odometer value={formatSignedMoney(closeToday)} speed="detail" dataTestid={`wheel-total-${wheel.id}`} />
        </div>
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
    </div>
  );
}
