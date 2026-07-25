import { useState } from 'react';
import type { FormEvent } from 'react';
import { createOption, createTrade, deleteTrade, updateOption, updateTrade } from '../lib/api';
import type { OptionDraft, OptionPosition, OptionType, Side, Trade } from '../lib/types';
import { nextFriday } from '../lib/time';
import { formatMoney } from '../lib/format';
import type { TicketData } from './TradeCeremony';

const today = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

const fmtDate = (iso: string) => {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
};

export function AddTradeSheet({
  trade,
  option,
  onDone,
  onDeleted,
  onCancel,
}: {
  trade: Trade | null;
  option?: OptionPosition | null;
  onDone: (ticket: TicketData) => Promise<void>;
  onDeleted?: () => Promise<void>;
  onCancel: () => void;
}) {
  const [mode, setMode] = useState<'stock' | 'option'>(option ? 'option' : 'stock');
  const editing = Boolean(trade || option);

  const [side, setSide] = useState<Side>(trade?.side ?? 'BUY');
  const [symbol, setSymbol] = useState(trade?.symbol ?? option?.symbol ?? '');
  const [qty, setQty] = useState(trade ? String(trade.qty) : '');
  const [price, setPrice] = useState(trade ? String(trade.price) : '');
  const [fees, setFees] = useState(trade ? String(trade.fees) : option ? String(option.fees) : '0');
  const [date, setDate] = useState(trade?.executed_at ?? option?.opened_at ?? today());
  const [note, setNote] = useState(trade?.note ?? option?.note ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const [optType, setOptType] = useState<OptionType>(option?.opt_type ?? 'PUT');
  const [strike, setStrike] = useState(option ? String(option.strike) : '');
  const [expiration, setExpiration] = useState(option?.expiration ?? nextFriday());
  const [contracts, setContracts] = useState(option ? String(option.contracts) : '1');
  const [premium, setPremium] = useState(option ? String(option.premium) : '');

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      if (mode === 'option') {
        const draft: OptionDraft = {
          symbol: symbol.trim().toUpperCase(), opt_type: optType, strike: Number(strike),
          expiration, contracts: Number(contracts), premium: Number(premium),
          fees: Number(fees) || 0, opened_at: date, note,
        };
        const saved = option ? await updateOption(option.id, draft) : await createOption(draft);
        const ticket: TicketData = {
          no: saved.id,
          title: 'OPTION TICKET',
          symbol: draft.symbol,
          lines: [
            `SELL TO OPEN ${draft.contracts}x`,
            `${draft.symbol} $${draft.strike} ${draft.opt_type} · exp ${fmtDate(draft.expiration)}`,
            `${formatMoney(draft.premium * 100 * draft.contracts)} collected`,
          ],
        };
        await onDone(ticket);
      } else {
        const body = {
          symbol: symbol.trim().toUpperCase(),
          side,
          qty: Number(qty),
          price: Number(price),
          fees: Number(fees) || 0,
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
      }
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
        <h2>{option ? 'Edit option' : trade ? 'Edit trade' : mode === 'option' ? 'Add option' : 'Add trade'}</h2>
        {!editing && (
          <div className="segmented">
            <button type="button" className={mode === 'stock' ? 'active' : ''} onClick={() => setMode('stock')}>Stock</button>
            <button type="button" className={mode === 'option' ? 'active' : ''} onClick={() => setMode('option')}>Option</button>
          </div>
        )}
        {mode === 'stock' && (
          <div className="field">
            <label htmlFor="side">Side</label>
            <select id="side" value={side} onChange={(e) => setSide(e.target.value as Side)}>
              <option value="BUY">Buy</option>
              <option value="SELL">Sell</option>
            </select>
          </div>
        )}
        <div className="field">
          <label htmlFor="symbol">Symbol</label>
          <input id="symbol" value={symbol} onChange={(e) => setSymbol(e.target.value)} autoCapitalize="characters" required />
        </div>
        {mode === 'option' ? (
          <>
            <div className="field">
              <label htmlFor="opt-type">Call / Put</label>
              <select id="opt-type" value={optType} onChange={(e) => setOptType(e.target.value as OptionType)}>
                <option value="PUT">Put</option>
                <option value="CALL">Call</option>
              </select>
            </div>
            <div className="field">
              <label htmlFor="strike">Strike</label>
              <input id="strike" type="number" inputMode="decimal" step="any" min="0" value={strike} onChange={(e) => setStrike(e.target.value)} required />
            </div>
            <div className="field">
              <label htmlFor="expiration">Expiration</label>
              <input id="expiration" type="date" value={expiration} onChange={(e) => setExpiration(e.target.value)} required />
            </div>
            <div className="field">
              <label htmlFor="contracts">Contracts</label>
              <input id="contracts" type="number" inputMode="numeric" step="1" min="1" value={contracts} onChange={(e) => setContracts(e.target.value)} required />
            </div>
            <div className="field">
              <label htmlFor="premium">Premium / share</label>
              <input id="premium" type="number" inputMode="decimal" step="any" min="0" value={premium} onChange={(e) => setPremium(e.target.value)} required />
            </div>
          </>
        ) : (
          <>
            <div className="field">
              <label htmlFor="qty">Shares</label>
              <input id="qty" type="number" inputMode="decimal" step="any" min="0.000001" value={qty} onChange={(e) => setQty(e.target.value)} required />
            </div>
            <div className="field">
              <label htmlFor="price">Price</label>
              <input id="price" type="number" inputMode="decimal" step="any" min="0" value={price} onChange={(e) => setPrice(e.target.value)} required />
            </div>
          </>
        )}
        <div className="field">
          <label htmlFor="fees">Fees</label>
          <input id="fees" type="number" inputMode="decimal" step="any" min="0" value={fees} onChange={(e) => setFees(e.target.value)} />
        </div>
        <div className="field">
          <label htmlFor="date">{mode === 'option' ? 'Date sold' : 'Date'}</label>
          <input id="date" type="date" value={date} onChange={(e) => setDate(e.target.value)} required />
        </div>
        <div className="field">
          <label htmlFor="note">Note (optional)</label>
          <input id="note" value={note} onChange={(e) => setNote(e.target.value)} />
        </div>
        <button className="btn" disabled={busy}>
          {busy ? 'Saving…' : mode === 'option' ? (option ? 'Save changes' : 'Sell to open') : trade ? 'Save changes' : 'Add trade'}
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
