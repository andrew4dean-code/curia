import { useState } from 'react';
import type { FormEvent } from 'react';
import { createTrade, deleteTrade, updateTrade } from '../lib/api';
import { todayIso } from '../lib/time';
import { wheelWindowNote } from '../lib/wheelMath';
import type { Side, Trade, Wheel } from '../lib/types';
import { formatMoney } from '../lib/format';
import type { TicketData } from './TradeCeremony';

const fmtDate = (iso: string) => {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
};

export function AddTradeSheet({
  trade,
  wheels,
  onDone,
  onDeleted,
  onCancel,
}: {
  trade: Trade | null;
  wheels: Wheel[];
  onDone: (ticket: TicketData) => Promise<void>;
  onDeleted?: () => Promise<void>;
  onCancel: () => void;
}) {
  const [side, setSide] = useState<Side>(trade?.side ?? 'BUY');
  const [symbol, setSymbol] = useState(trade?.symbol ?? '');
  const [qty, setQty] = useState(trade ? String(trade.qty) : '');
  const [price, setPrice] = useState(trade ? String(trade.price) : '');
  const [date, setDate] = useState(trade?.executed_at ?? todayIso());
  const [note, setNote] = useState(trade?.note ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const wheelNote = wheelWindowNote(symbol, date, wheels);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      const body = {
        symbol: symbol.trim().toUpperCase(),
        side,
        qty: Number(qty),
        price: Number(price),
        fees: 0,
        executed_at: date,
        note,
      };
      const saved = trade ? await updateTrade({ ...body, id: trade.id }) : await createTrade(body);
      const ticket: TicketData = {
        no: saved.id,
        title: 'TRADE TICKET',
        symbol: body.symbol,
        lines: [
          `${body.side} ${body.qty} ${body.symbol}`,
          `@ ${formatMoney(body.price)} · ${fmtDate(body.executed_at)}`,
        ],
      };
      await onDone(ticket);
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
      await onDeleted?.();
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
          <label htmlFor="date">Date</label>
          <input id="date" type="date" value={date} onChange={(e) => setDate(e.target.value)} required />
        </div>
        {wheelNote && <div className="sheet-note">{wheelNote}</div>}
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
