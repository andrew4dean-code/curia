import { useState } from 'react';
import type { FormEvent } from 'react';
import { closeWheel, deleteWheel, openWheel } from '../lib/api';
import { formatSignedMoney, plColor } from '../lib/format';
import { Odometer } from './Odometer';
import type { Wheel, WheelSummary } from '../lib/types';
import type { WheelCeremonyData } from './WheelCeremony';

const today = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

export function FreshWheelSheet({
  suggestions,
  onDone,
  onCancel,
}: {
  suggestions: string[];
  onDone: (ceremony: WheelCeremonyData) => Promise<void>;
  onCancel: () => void;
}) {
  const [symbol, setSymbol] = useState('');
  const [date, setDate] = useState(today());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      const w = await openWheel(symbol.trim().toUpperCase(), date);
      await onDone({ mode: 'open', symbol: w.symbol, no: w.no });
    } catch {
      setError('Could not open the wheel — is one already running on this symbol?');
      setBusy(false);
    }
  }

  return (
    <div className="sheet-backdrop" onClick={onCancel}>
      <form className="sheet" onClick={(e) => e.stopPropagation()} onSubmit={submit}>
        <h2>Begin a fresh wheel</h2>
        <div className="hero-sub" style={{ marginBottom: 12 }}>
          every trade and premium on this symbol, from the start date on, rides this wheel
        </div>
        <div className="field">
          <label htmlFor="fw-symbol">Symbol</label>
          <input id="fw-symbol" value={symbol} onChange={(e) => setSymbol(e.target.value)} autoCapitalize="characters" required autoFocus />
        </div>
        {suggestions.length > 0 && (
          <div className="link-row" style={{ margin: '0 0 8px' }}>
            {suggestions.map((s) => (
              <button key={s} type="button" onClick={() => setSymbol(s)} style={{ marginRight: 10 }}>
                {s}
              </button>
            ))}
          </div>
        )}
        <div className="field">
          <label htmlFor="fw-date">Started</label>
          <input id="fw-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} required />
        </div>
        <button className="btn" disabled={busy || !symbol}>
          {busy ? 'Opening…' : 'Open the wheel'}
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

export function CompleteWheelSheet({
  summary,
  onDone,
  onCancel,
}: {
  summary: WheelSummary;
  onDone: (ceremony: WheelCeremonyData) => Promise<void>;
  onCancel: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const { wheel, closeToday, weeks, callsSold } = summary;

  async function complete() {
    setBusy(true);
    setError('');
    try {
      await closeWheel(wheel.id, today());
      await onDone({
        mode: 'complete',
        symbol: wheel.symbol,
        no: wheel.no,
        totalLine: `${formatSignedMoney(closeToday)} · ${weeks} WEEKS · ${callsSold} CALLS`,
      });
    } catch {
      setError('Could not complete — check your connection.');
      setBusy(false);
    }
  }

  return (
    <div className="sheet-backdrop" onClick={onCancel}>
      <div className="sheet" onClick={(e) => e.stopPropagation()}>
        <h2>
          Complete {wheel.symbol} · Wheel Nº {wheel.no}?
        </h2>
        <div className="row-sub" style={{ marginBottom: 6 }}>
          {weeks} weeks · {callsSold} calls sold · shares flat
        </div>
        <div style={{ fontFamily: 'var(--font-display)', fontSize: 26, fontWeight: 800, color: plColor(closeToday), margin: '8px 0 14px' }}>
          <Odometer value={formatSignedMoney(closeToday)} speed="detail" />
        </div>
        <button className="btn" onClick={() => void complete()} disabled={busy}>
          {busy ? 'Sealing…' : 'Complete the wheel'}
        </button>
        <div className="btn-row">
          <button type="button" className="btn btn-ghost" onClick={onCancel} disabled={busy}>
            Not yet
          </button>
        </div>
        {error && <div style={{ color: 'var(--pl-red)', marginTop: 8, fontSize: 13 }}>{error}</div>}
      </div>
    </div>
  );
}

export function WheelRecordSheet({
  wheel,
  finalTotal,
  detailLine,
  onDone,
  onCancel,
}: {
  wheel: Wheel;
  finalTotal: number;
  detailLine: string;
  onDone: () => Promise<void>;
  onCancel: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function remove() {
    if (!window.confirm(`Delete the record of ${wheel.symbol} Wheel Nº ${wheel.no}? Trades and options stay.`)) return;
    setBusy(true);
    try {
      await deleteWheel(wheel.id);
      await onDone();
    } catch {
      setError('Could not delete — check your connection.');
      setBusy(false);
    }
  }

  return (
    <div className="sheet-backdrop" onClick={onCancel}>
      <div className="sheet" onClick={(e) => e.stopPropagation()}>
        <h2>
          {wheel.symbol} · Wheel Nº {wheel.no}
        </h2>
        <div className="row-sub" style={{ marginBottom: 6 }}>{detailLine}</div>
        <div style={{ fontFamily: 'var(--font-display)', fontSize: 26, fontWeight: 800, color: plColor(finalTotal), margin: '8px 0 14px' }}>
          <Odometer value={formatSignedMoney(finalTotal)} speed="detail" />
        </div>
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
