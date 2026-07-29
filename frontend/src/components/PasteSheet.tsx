import { useEffect, useRef, useState } from 'react';
import { parseConfirmation } from '../lib/parseConfirmation';
import type { ParsedConfirmation } from '../lib/parseConfirmation';
import { formatMoney } from '../lib/format';

function fmtDay(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

/** Paste a broker fill and let the app read it.
 *
 *  The clipboard is read on open where the browser allows it, but a textarea is always
 *  shown rather than being a fallback that appears only on failure: iOS Safari may refuse
 *  readText() outright, may prompt, or may return stale contents, and a sheet whose shape
 *  depends on which of those happened is a sheet you cannot learn. Read into the box the
 *  user can see, and let them fix it.
 */
export function PasteSheet({
  onUse,
  onCancel,
  problem,
}: {
  onUse: (parsed: ParsedConfirmation) => void;
  onCancel: () => void;
  /** Set by the caller when it understood the paste but could not act on it — a buyback
   *  with no single open contract to close. Different from a parse failure, and it must
   *  not read like one. */
  problem?: string;
}) {
  const [text, setText] = useState('');
  const [denied, setDenied] = useState(false);
  const ref = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    let live = true;
    (async () => {
      try {
        const t = await navigator.clipboard?.readText();
        if (live && t) setText(t);
      } catch {
        if (live) setDenied(true); // no permission, or no clipboard at all
      }
      ref.current?.focus();
    })();
    return () => {
      live = false;
    };
  }, []);

  const parsed = parseConfirmation(text);

  return (
    <div className="sheet-backdrop" onClick={onCancel}>
      <div className="sheet" onClick={(e) => e.stopPropagation()}>
        <h2>Paste a confirmation</h2>
        <div className="hero-sub" style={{ marginBottom: 12 }}>
          {denied ? 'paste the broker message below' : 'from Moomoo, or any broker that names the contract'}
        </div>
        <div className="field">
          <label htmlFor="paste-box">Confirmation</label>
          <textarea
            id="paste-box"
            ref={ref}
            rows={4}
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="[Order Filled] 1 contract of $TQQQ 260724 70.00P$ was sold at 1.49…"
          />
        </div>

        {problem && <div className="paste-miss" data-testid="paste-problem">{problem}</div>}

        {text.trim() !== '' && !parsed && (
          <div className="paste-miss" data-testid="paste-miss">
            Could not read that. It needs the contract and the fill price — something like
            <br />
            <code>$TQQQ 260724 70.00P$ was sold at 1.49</code>
          </div>
        )}

        {parsed && (
          <div className="paste-read" data-testid="paste-read">
            <div className="paste-read-head">
              {parsed.side === 'SOLD' ? 'Sold to open' : 'Bought to close'}
            </div>
            <dl>
              <div><dt>Symbol</dt><dd>{parsed.symbol}</dd></div>
              <div><dt>Contract</dt><dd>${parsed.strike} {parsed.optType} · exp {fmtDay(parsed.expiration)}</dd></div>
              <div><dt>Contracts</dt><dd>{parsed.contracts}</dd></div>
              <div><dt>{parsed.side === 'SOLD' ? 'Premium' : 'Buyback'}</dt><dd>{formatMoney(parsed.premium)} / share</dd></div>
              {parsed.filledOn && <div><dt>Filled</dt><dd>{fmtDay(parsed.filledOn)}</dd></div>}
              <div><dt>Total</dt><dd>{formatMoney(parsed.premium * 100 * parsed.contracts)}</dd></div>
            </dl>
          </div>
        )}

        <button className="btn" disabled={!parsed} onClick={() => parsed && onUse(parsed)}>
          {parsed?.side === 'BOUGHT' ? 'Settle this contract' : 'Fill the ticket'}
        </button>
        <div className="btn-row">
          <button type="button" className="btn btn-ghost" onClick={onCancel}>
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
