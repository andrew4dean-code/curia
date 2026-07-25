import { useState } from 'react';
import type { FormEvent } from 'react';
import { createOption, updateOption } from '../lib/api';
import { formatMoney } from '../lib/format';
import type { OptionDraft, OptionPosition, OptionType } from '../lib/types';
import type { TicketData } from './TradeCeremony';

const today = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

function fmtDate(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

export function OptionSellSheet({
  expiration,
  option,
  onDone,
  onCancel,
}: {
  expiration: string;
  option?: OptionPosition | null;
  onDone: (ticket: TicketData) => Promise<void>;
  onCancel: () => void;
}) {
  const exp = option ? option.expiration : expiration;
  const [optType, setOptType] = useState<OptionType>(option?.opt_type ?? 'PUT');
  const [symbol, setSymbol] = useState(option?.symbol ?? '');
  const [strike, setStrike] = useState(option ? String(option.strike) : '');
  const [contracts, setContracts] = useState(option ? String(option.contracts) : '1');
  const [premium, setPremium] = useState(option ? String(option.premium) : '');
  const [fees, setFees] = useState(option ? String(option.fees) : '0');
  const [date, setDate] = useState(option?.opened_at ?? today());
  const [note, setNote] = useState(option?.note ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const take = (Number(premium) || 0) * 100 * (Number(contracts) || 0);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError('');
    const draft: OptionDraft = {
      symbol: symbol.trim().toUpperCase(), opt_type: optType, strike: Number(strike),
      expiration: exp, contracts: Number(contracts), premium: Number(premium),
      fees: Number(fees) || 0, opened_at: date, note,
    };
    try {
      const saved = option ? await updateOption(option.id, draft) : await createOption(draft);
      await onDone({
        no: saved.id,
        title: 'OPTION TICKET',
        symbol: draft.symbol,
        lines: [
          `SELL TO OPEN ${draft.contracts}x`,
          `${draft.symbol} $${draft.strike} ${draft.opt_type} · exp ${fmtDate(exp)}`,
          `${formatMoney(draft.premium * 100 * draft.contracts)} collected`,
        ],
      });
    } catch {
      setError('Could not save — check the fields and your connection.');
      setBusy(false);
    }
  }

  return (
    <div className="sheet-backdrop" onClick={onCancel}>
      <form className="sheet" onClick={(e) => e.stopPropagation()} onSubmit={submit}>
        <h2>{option ? 'Edit option' : `Sell — week of Fri ${fmtDate(exp)}`}</h2>
        <div className="hero-sub" style={{ marginBottom: 12 }}>expiration set by the line you tapped</div>
        <div className="toggle-row">
          <button type="button" className={optType === 'PUT' ? 'on' : ''} onClick={() => setOptType('PUT')}>PUT</button>
          <button type="button" className={optType === 'CALL' ? 'on' : ''} onClick={() => setOptType('CALL')}>CALL</button>
        </div>
        <div className="field">
          <label htmlFor="os-symbol">Symbol</label>
          <input id="os-symbol" value={symbol} onChange={(e) => setSymbol(e.target.value)} autoCapitalize="characters" required />
        </div>
        <div className="field">
          <label htmlFor="os-strike">Strike</label>
          <input id="os-strike" type="number" inputMode="decimal" step="any" min="0" value={strike} onChange={(e) => setStrike(e.target.value)} required />
        </div>
        <div className="field">
          <label htmlFor="os-contracts">Contracts</label>
          <input id="os-contracts" type="number" inputMode="numeric" step="1" min="1" value={contracts} onChange={(e) => setContracts(e.target.value)} required />
        </div>
        <div className="field">
          <label htmlFor="os-premium">Premium / share</label>
          <input id="os-premium" type="number" inputMode="decimal" step="any" min="0" value={premium} onChange={(e) => setPremium(e.target.value)} required />
        </div>
        <div className="field">
          <label htmlFor="os-fees">Fees</label>
          <input id="os-fees" type="number" inputMode="decimal" step="any" min="0" value={fees} onChange={(e) => setFees(e.target.value)} />
        </div>
        <div className="field">
          <label htmlFor="os-date">Date sold</label>
          <input id="os-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} required />
        </div>
        <div className="field">
          <label htmlFor="os-note">Note (optional)</label>
          <input id="os-note" value={note} onChange={(e) => setNote(e.target.value)} />
        </div>
        <button className="btn" disabled={busy || !symbol || !strike || !premium}>
          {busy ? 'Saving…' : option ? 'Save changes' : `Sell to open — collect ${formatMoney(take)}`}
        </button>
        <div className="btn-row">
          <button type="button" className="btn btn-ghost" onClick={onCancel} disabled={busy}>Cancel</button>
        </div>
        {error && <div style={{ color: 'var(--pl-red)', marginTop: 8, fontSize: 13 }}>{error}</div>}
      </form>
    </div>
  );
}
