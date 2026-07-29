import { useState } from 'react';
import { deleteOption } from '../lib/api';
import { optionRealizedPl, premiumCollected } from '../lib/optionsMath';
import { formatMoney, formatSignedMoney, plColor } from '../lib/format';
import { Odometer } from './Odometer';
import type { OptionPosition } from '../lib/types';

const OUTCOME_LABELS: Record<string, string> = {
  EXPIRED: 'Expired worthless',
  BOUGHT_BACK: 'Bought back',
  ASSIGNED: 'Assigned',
};

export function OptionRecordSheet({
  option,
  onDeleted,
  onCancel,
}: {
  option: OptionPosition;
  onDeleted?: (id: number) => Promise<void>;
  onCancel: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const pl = optionRealizedPl(option) ?? 0;

  async function remove() {
    if (!window.confirm(`Delete this ${option.symbol} option record? This can't be undone.`)) return;
    setBusy(true);
    setError('');
    try {
      await deleteOption(option.id);
      await onDeleted?.(option.id);
    } catch {
      setError('Could not delete — check your connection.');
      setBusy(false);
    }
  }

  return (
    <div className="sheet-backdrop" onClick={onCancel}>
      <div className="sheet" onClick={(e) => e.stopPropagation()}>
        <h2>
          {option.symbol} ${option.strike} {option.opt_type}
        </h2>
        <div className="row-sub" style={{ marginBottom: 6 }}>
          {OUTCOME_LABELS[option.status] ?? option.status} · {option.contracts}x ·{' '}
          {formatMoney(premiumCollected(option))} collected
        </div>
        <div className="row-sub" style={{ marginBottom: 6 }}>
          sold {option.opened_at} · settled {option.closed_at}
        </div>
        <div style={{ fontFamily: 'var(--font-display)', fontSize: 24, fontWeight: 700, color: plColor(pl), margin: '10px 0 14px' }}>
          <Odometer value={formatSignedMoney(pl)} speed="detail" />
        </div>
        {option.status === 'ASSIGNED' && (
          <div className="row-sub" style={{ marginBottom: 12 }}>
            The booked share trade stays in your ledger — delete it separately in All entries if
            you need to.
          </div>
        )}
        <button className="btn" onClick={() => void remove()} disabled={busy}>
          {busy ? 'Deleting…' : 'Delete record'}
        </button>
        <div className="btn-row">
          <button type="button" className="btn btn-ghost" onClick={onCancel} disabled={busy}>
            Cancel
          </button>
        </div>
        {error && <div style={{ color: 'var(--pl-red)', marginTop: 8, fontSize: 13 }}>{error}</div>}
      </div>
    </div>
  );
}
