import { useState } from 'react';
import type { FormEvent } from 'react';
import { dropMark, putMark } from '../lib/api';
import { agoLabel } from '../lib/time';
import type { Mark } from '../lib/types';

export function MarkSheet({
  symbol,
  mark = null,
  onDone,
  onCancel,
}: {
  symbol: string;
  /** The price on record, so the sheet can say where it came from. */
  mark?: Mark | null;
  onDone: () => Promise<void>;
  onCancel: () => void;
}) {
  const [price, setPrice] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const mine = mark?.source === 'manual';

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      await putMark(symbol, Number(price));
      await onDone();
    } catch {
      setError('Could not save the price — check your connection.');
      setBusy(false);
    }
  }

  async function release() {
    setBusy(true);
    setError('');
    try {
      await dropMark(symbol);
      await onDone();
    } catch {
      setError('Could not release the price — check your connection.');
      setBusy(false);
    }
  }

  return (
    <div className="sheet-backdrop" onClick={onCancel}>
      <form className="sheet" onClick={(e) => e.stopPropagation()} onSubmit={submit}>
        <h2>{symbol} — current price</h2>
        {mark && (
          <div className="row-sub" data-testid="mark-source" style={{ marginBottom: 10 }}>
            {mine
              ? `Your price, set ${agoLabel(mark.marked_at)}. Curia leaves it alone until you release it.`
              : `Fetched ${agoLabel(mark.marked_at)}. Typing one here makes it yours, and the quote pull will stop overwriting it.`}
          </div>
        )}
        <div className="field">
          <label htmlFor="mark-price">Price</label>
          <input id="mark-price" type="number" inputMode="decimal" step="any" min="0" autoFocus value={price} onChange={(e) => setPrice(e.target.value)} required />
        </div>
        <button className="btn" disabled={busy || !price}>
          {busy ? 'Saving…' : 'Save price'}
        </button>
        <div className="btn-row">
          <button type="button" className="btn btn-ghost" onClick={onCancel} disabled={busy}>
            Cancel
          </button>
          {mine && (
            <button type="button" className="btn btn-ghost" onClick={() => void release()} disabled={busy}>
              Use the live price
            </button>
          )}
        </div>
        {error && <div style={{ color: 'var(--pl-red)', marginTop: 8, fontSize: 13 }}>{error}</div>}
      </form>
    </div>
  );
}
