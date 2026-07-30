import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { createOption, updateOption } from '../lib/api';
import { todayIso } from '../lib/time';
import { wheelWindowNote } from '../lib/wheelMath';
import { formatMoney } from '../lib/format';
import type { OptionDraft, OptionPosition, OptionType, Trade, Wheel } from '../lib/types';
import { SymbolChips } from './SymbolChips';
import { recentSymbols } from '../lib/symbols';
import { optionDefaults } from '../lib/optionEntry';
import type { ParsedConfirmation } from '../lib/parseConfirmation';
import { DEFAULT_SETTINGS } from '../lib/api';
import type { Settings } from '../lib/api';
import type { TicketData } from './TradeCeremony';

function fmtDate(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

/** What this ticket's fee should be once saved.
 *
 *  A new sale takes the current setting, worst case and per contract: brokers charge by
 *  the contract, not the order. An EDIT keeps the rate the position was booked at, because
 *  a recorded fee is history — re-reading Settings on the update path restated what an old
 *  position had cost every time the fee changed. The rate still follows the contract count,
 *  since that is the one field an edit can legitimately correct and the fee is per contract
 *  by construction. A record with no fee on it stays at nothing.
 */
export function recordedFee(
  option: OptionPosition | null | undefined,
  contracts: number,
  currentPerContract: number,
): number {
  if (!option) return currentPerContract * contracts;
  if (!option.contracts) return option.fees;
  return (option.fees / option.contracts) * contracts;
}

export function OptionSellSheet({
  expiration,
  option,
  wheels,
  trades = [],
  options = [],
  prefill,
  settings = DEFAULT_SETTINGS,
  onDone,
  onCancel,
}: {
  expiration: string;
  option?: OptionPosition | null;
  wheels: Wheel[];
  trades?: Trade[];
  options?: OptionPosition[];
  /** A confirmation that has already been read. Authoritative — it beats anything the
   *  wheel would infer, because it is a record of what actually filled. */
  prefill?: ParsedConfirmation | null;
  settings?: Settings;
  onDone: (ticket: TicketData) => Promise<void>;
  onCancel: () => void;
}) {
  const symbolOptions = recentSymbols(trades, options);
  const exp = option ? option.expiration : expiration;
  const [optType, setOptType] = useState<OptionType>(option?.opt_type ?? 'PUT');
  const [symbol, setSymbol] = useState(option?.symbol ?? '');
  const [strike, setStrike] = useState(option ? String(option.strike) : '');
  const [contracts, setContracts] = useState(option ? String(option.contracts) : '1');
  const [premium, setPremium] = useState(option ? String(option.premium) : '');
  const [date, setDate] = useState(option?.opened_at ?? todayIso());
  const [note, setNote] = useState(option?.note ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  /* Once you have chosen a side or a size yourself, the wheel stops choosing it for you.
     Filling a field you already set — because you happened to retype the symbol — is the
     kind of help that costs more trust than it saves. */
  const [chosenType, setChosenType] = useState(!!prefill);
  const [chosenContracts, setChosenContracts] = useState(!!prefill);
  const [typing, setTyping] = useState(!!prefill);

  /* A pasted fill types itself into the ticket, field by field, the way the ceremony
     types a ticket — but with none of its machinery. It is the same idea at a smaller
     scale: you watch the numbers land, so you read them instead of trusting them. */
  useEffect(() => {
    if (!prefill) return;
    setOptType(prefill.optType);
    if (prefill.filledOn) setDate(prefill.filledOn);
    const steps: Array<[(v: string) => void, string]> = [
      [setSymbol, prefill.symbol],
      [setStrike, String(prefill.strike)],
      [setContracts, String(prefill.contracts)],
      [setPremium, String(prefill.premium)],
    ];
    const timers: number[] = [];
    let at = 140;
    for (const [set, value] of steps) {
      for (let i = 1; i <= value.length; i++) {
        const slice = value.slice(0, i);
        timers.push(window.setTimeout(() => set(slice), at));
        at += 34;
      }
      at += 120; // a beat between fields, so they read as separate facts
    }
    timers.push(window.setTimeout(() => setTyping(false), at));
    return () => timers.forEach(clearTimeout);
  }, [prefill]);

  /** Apply what the symbol's open wheel implies. Never while editing an existing option:
   *  those fields are the record, not a guess. */
  function applySymbol(next: string) {
    setSymbol(next);
    if (option) return;
    const d = optionDefaults(next, wheels, trades, options);
    if (!d) return;
    if (!chosenType) setOptType(d.optType);
    if (!chosenContracts && d.contracts !== null) setContracts(String(d.contracts));
  }

  const implied = option ? null : optionDefaults(symbol, wheels, trades, options);

  const take = (Number(premium) || 0) * 100 * (Number(contracts) || 0);
  const wheelNote = wheelWindowNote(symbol, date, wheels);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError('');
    const draft: OptionDraft = {
      symbol: symbol.trim().toUpperCase(), opt_type: optType, strike: Number(strike),
      expiration: exp, contracts: Number(contracts), premium: Number(premium),
      fees: recordedFee(option, Number(contracts || 0), settings.option_fee_per_contract),
      opened_at: date, note,
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
          <button type="button" className={optType === 'PUT' ? 'on' : ''} onClick={() => { setChosenType(true); setOptType('PUT'); }}>PUT</button>
          <button type="button" className={optType === 'CALL' ? 'on' : ''} onClick={() => { setChosenType(true); setOptType('CALL'); }}>CALL</button>
        </div>
        <div className="field">
          <label htmlFor="os-symbol">Symbol</label>
          <input id="os-symbol" value={symbol} onChange={(e) => applySymbol(e.target.value)} autoCapitalize="characters" required />
          <SymbolChips idPrefix="option" symbols={symbolOptions} active={symbol} onPick={applySymbol} />
          {implied && (
            <div className="row-sub" data-testid="implied-note" style={{ marginTop: 6 }}>
              {implied.optType === 'PUT'
                ? 'wheel is waiting on a put'
                : `wheel holds shares — ${implied.contracts !== null ? `${implied.contracts} covered` : 'call'}`}
            </div>
          )}
        </div>
        <div className="field">
          <label htmlFor="os-strike">Strike</label>
          <input id="os-strike" type="number" inputMode="decimal" step="any" min="0" value={strike} onChange={(e) => setStrike(e.target.value)} required />
        </div>
        <div className="field">
          <label htmlFor="os-contracts">Contracts</label>
          <input id="os-contracts" type="number" inputMode="numeric" step="1" min="1" value={contracts} onChange={(e) => { setChosenContracts(true); setContracts(e.target.value); }} required />
        </div>
        <div className="field">
          <label htmlFor="os-premium">Premium / share</label>
          <input id="os-premium" type="number" inputMode="decimal" step="any" min="0" value={premium} onChange={(e) => setPremium(e.target.value)} required />
        </div>
        <div className="field">
          <label htmlFor="os-date">Date sold</label>
          <input id="os-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} required />
        </div>
        {wheelNote && <div className="sheet-note">{wheelNote}</div>}
        <div className="field">
          <label htmlFor="os-note">Note (optional)</label>
          <input id="os-note" value={note} onChange={(e) => setNote(e.target.value)} />
        </div>
        <button className="btn" disabled={typing || busy || !symbol || !strike || !premium}>
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
