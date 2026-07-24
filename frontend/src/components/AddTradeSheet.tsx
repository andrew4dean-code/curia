import { useState } from 'react';
import type { FormEvent } from 'react';
import { createTrade, deleteTrade, updateTrade } from '../lib/api';
import type { Side, Trade } from '../lib/types';

const today = () => new Date().toISOString().slice(0, 10);

export function AddTradeSheet({
  trade,
  onDone,
  onCancel,
}: {
  trade: Trade | null;
  onDone: () => Promise<void>;
  onCancel: () => void;
}) {
  const [side, setSide] = useState<Side>(trade?.side ?? 'BUY');
  const [symbol, setSymbol] = useState(trade?.symbol ?? '');
  const [qty, setQty] = useState(trade ? String(trade.qty) : '');
  const [price, setPrice] = useState(trade ? String(trade.price) : '');
  const [fees, setFees] = useState(trade ? String(trade.fees) : '0');
  const [date, setDate] = useState(trade?.executed_at ?? today());
  const [note, setNote] = useState(trade?.note ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError('');
    const body = {
      symbol: symbol.trim().toUpperCase(),
      side,
      qty: Number(qty),
      price: Number(price),
      fees: Number(fees) || 0,
      executed_at: date,
      note,
    };
    try {
      if (trade) await updateTrade({ ...body, id: trade.id });
      else await createTrade(body);
      await onDone();
    } catch {
      setError('Could not save — check the fields and your connection.');
      setBusy(false);
    }
  }

  async function remove() {
    if (!trade) return;
    if (!window.confirm(`Delete this ${trade.symbol} ${trade.side.toLowerCase()}?`)) return;
    setBusy(true);
    try {
      await deleteTrade(trade.id);
      await onDone();
    } catch {
      setError('Could not delete — check your connection.');
      setBusy(false);
    }
  }

  return (
    <div className="sheet-backdrop" onClick={onCancel}>
      <form className="sheet" onClick={(e) => e.stopPropagation()} onSubmit={submit}>
        <h2>{trade ? 'Edit trade' : 'Add trade'}</h2>
        <div className="field">
          <label htmlFor="side">Side</label>
          <select id="side" value={side} onChange={(e) => setSide(e.target.value as Side)}>
            <option value="BUY">Buy</option>
            <option value="SELL">Sell</option>
          </select>
        </div>
        <div className="field">
          <label htmlFor="symbol">Symbol</label>
          <input id="symbol" value={symbol} onChange={(e) => setSymbol(e.target.value)} autoCapitalize="characters" required />
        </div>
        <div className="field">
          <label htmlFor="qty">Shares</label>
          <input id="qty" type="number" inputMode="decimal" step="any" min="0.000001" value={qty} onChange={(e) => setQty(e.target.value)} required />
        </div>
        <div className="field">
          <label htmlFor="price">Price</label>
          <input id="price" type="number" inputMode="decimal" step="any" min="0" value={price} onChange={(e) => setPrice(e.target.value)} required />
        </div>
        <div className="field">
          <label htmlFor="fees">Fees</label>
          <input id="fees" type="number" inputMode="decimal" step="any" min="0" value={fees} onChange={(e) => setFees(e.target.value)} />
        </div>
        <div className="field">
          <label htmlFor="date">Date</label>
          <input id="date" type="date" value={date} onChange={(e) => setDate(e.target.value)} required />
        </div>
        <div className="field">
          <label htmlFor="note">Note (optional)</label>
          <input id="note" value={note} onChange={(e) => setNote(e.target.value)} />
        </div>
        <button className="btn" disabled={busy}>
          {busy ? 'Saving…' : trade ? 'Save changes' : 'Add trade'}
        </button>
        <div className="btn-row">
          <button type="button" className="btn btn-ghost" onClick={onCancel} disabled={busy}>
            Cancel
          </button>
          {trade && (
            <button type="button" className="btn btn-ghost" onClick={remove} disabled={busy}>
              Delete
            </button>
          )}
        </div>
        {error && <div className="error" style={{ color: 'var(--pl-red)', marginTop: 8, fontSize: 13 }}>{error}</div>}
      </form>
    </div>
  );
}
