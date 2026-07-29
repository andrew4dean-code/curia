import { useState } from 'react';
import type { FormEvent } from 'react';
import { deleteOption, settleOption } from '../lib/api';
import { settleDateDefault, todayIso } from '../lib/time';
import { optionRealizedPl, premiumCollected } from '../lib/optionsMath';
import { formatMoney, formatSignedMoney } from '../lib/format';
import { stampFor } from '../lib/settleStamp';
import type { SettleData } from './SettleCeremony';
import type { OptionPosition, OptionStatus } from '../lib/types';

export function SettleSheet({
  option,
  buybackPrefill,
  onDone,
  onDeleted,
  onEdit,
  onCancel,
}: {
  option: OptionPosition;
  /** Buyback price read off a pasted confirmation, in dollars per share. */
  buybackPrefill?: number;
  onDone: (c: SettleData) => Promise<void>;
  onDeleted?: (id?: number) => Promise<void>;
  onEdit: () => void;
  onCancel: () => void;
}) {
  // A pasted buyback names both the outcome and the price; there is nothing left to pick.
  const [outcome, setOutcome] = useState<Exclude<OptionStatus, 'OPEN'> | null>(
    buybackPrefill !== undefined ? 'BOUGHT_BACK' : null,
  );
  const [buyback, setBuyback] = useState(buybackPrefill !== undefined ? String(buybackPrefill) : '');
  const [date, setDate] = useState(settleDateDefault(option.expiration, todayIso()));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const bookSide = option.opt_type === 'PUT' ? 'BUY' : 'SELL';
  const bookQty = option.contracts * 100;

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!outcome) return;
    setBusy(true);
    setError('');
    try {
      await settleOption(option.id, {
        outcome,
        closed_at: date,
        ...(outcome === 'BOUGHT_BACK'
          ? { buyback_price: Number(buyback), close_fees: 0 }
          : {}),
      });
      const settled: OptionPosition = {
        ...option,
        status: outcome,
        closed_at: date,
        ...(outcome === 'BOUGHT_BACK'
          ? { buyback_price: Number(buyback), close_fees: 0 }
          : {}),
      };
      const realised = optionRealizedPl(settled) ?? 0;
      await onDone({
        ...stampFor(outcome, realised),
        amount: formatSignedMoney(realised),
        symbol: option.symbol,
        ...(outcome === 'ASSIGNED' ? { shares: `${bookSide === 'BUY' ? 'ACQUIRED' : 'CALLED AWAY'} ${bookQty} SHARES · ${option.symbol} @ ${formatMoney(option.strike)}` } : {}),
      });
    } catch {
      setError('Could not settle — check your connection.');
      setBusy(false);
    }
  }

  async function remove() {
    if (!window.confirm(`Delete this open ${option.symbol} option?`)) return;
    setBusy(true);
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
      <form className="sheet" onClick={(e) => e.stopPropagation()} onSubmit={submit}>
        <h2>
          {option.symbol} ${option.strike} {option.opt_type} — settle
        </h2>
        <div className="row-sub" style={{ marginBottom: 6 }}>
          {option.contracts}x · exp {option.expiration} · {formatMoney(premiumCollected(option))} collected
        </div>
        <div className="outcomes">
          <button type="button" className={outcome === 'EXPIRED' ? 'active' : ''} onClick={() => setOutcome('EXPIRED')}>
            Expired worthless — keep it all
          </button>
          <button type="button" className={outcome === 'BOUGHT_BACK' ? 'active' : ''} onClick={() => setOutcome('BOUGHT_BACK')}>
            Bought back
          </button>
          <button type="button" className={outcome === 'ASSIGNED' ? 'active' : ''} onClick={() => setOutcome('ASSIGNED')}>
            Assigned
          </button>
        </div>
        {outcome === 'BOUGHT_BACK' && (
          <div className="field">
            <label htmlFor="buyback">Buyback / share</label>
            <input id="buyback" type="number" inputMode="decimal" step="any" min="0" autoFocus value={buyback} onChange={(e) => setBuyback(e.target.value)} required />
          </div>
        )}
        {outcome === 'ASSIGNED' && (
          <div className="books-preview">
            Books: {bookSide} {bookQty} {option.symbol} @ {formatMoney(option.strike)}
          </div>
        )}
        <div className="field">
          <label htmlFor="settle-date">Settle date</label>
          <input id="settle-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} required />
        </div>
        <button className="btn" disabled={busy || !outcome || (outcome === 'BOUGHT_BACK' && !buyback)}>
          {busy ? 'Settling…' : 'Settle'}
        </button>
        <div className="btn-row">
          <button type="button" className="btn btn-ghost" onClick={onCancel} disabled={busy}>Cancel</button>
          <button type="button" className="btn btn-ghost" onClick={onEdit} disabled={busy}>Edit</button>
          <button type="button" className="btn btn-ghost" onClick={remove} disabled={busy}>Delete</button>
        </div>
        {error && <div style={{ color: 'var(--pl-red)', marginTop: 8, fontSize: 13 }}>{error}</div>}
      </form>
    </div>
  );
}
