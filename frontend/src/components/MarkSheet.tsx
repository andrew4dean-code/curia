import { useState } from 'react';
import type { FormEvent } from 'react';
import { putMark } from '../lib/api';

export function MarkSheet({
  symbol,
  onDone,
  onCancel,
}: {
  symbol: string;
  onDone: () => Promise<void>;
  onCancel: () => void;
}) {
  const [price, setPrice] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

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

  return (
    <div className="sheet-backdrop" onClick={onCancel}>
      <form className="sheet" onClick={(e) => e.stopPropagation()} onSubmit={submit}>
        <h2>{symbol} — current price</h2>
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
        </div>
        {error && <div style={{ color: 'var(--pl-red)', marginTop: 8, fontSize: 13 }}>{error}</div>}
      </form>
    </div>
  );
}
