import { useRef, useState } from 'react';
import type { TabProps } from './PortfolioTab';
import { DEFAULT_SETTINGS, exportBackup, importBackup, saveSettings } from '../lib/api';
import { RELEASES } from '../lib/releases';

function fmtStamp(iso: string): string {
  return new Date(iso).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
}

/** Date-only, and parsed as UTC: a bare '2026-07-28' is midnight UTC, which prints as
 *  the 27th anywhere west of Greenwich if handed straight to a local formatter. */
function fmtDay(iso: string): string {
  return new Date(`${iso}T12:00:00Z`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

export function SettingsTab({ snap, onRefresh }: TabProps) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [importError, setImportError] = useState('');
  const [updateError, setUpdateError] = useState('');
  const [busy, setBusy] = useState(false);

  /* Held as strings so the fields can be empty while being retyped. Committing an empty
     box as 0 mid-edit would silently zero a fee you were in the middle of changing. */
  const s = snap.settings ?? DEFAULT_SETTINGS;
  const [feeContract, setFeeContract] = useState(String(s.option_fee_per_contract));
  const [feeStock, setFeeStock] = useState(String(s.stock_fee_per_trade));
  const [taxRate, setTaxRate] = useState(String(s.tax_rate_pct));
  const [savingFees, setSavingFees] = useState(false);
  const [saved, setSaved] = useState(false);
  const [feeError, setFeeError] = useState('');

  async function persist() {
    setSavingFees(true);
    setFeeError('');
    try {
      await saveSettings({
        option_fee_per_contract: Number(feeContract) || 0,
        stock_fee_per_trade: Number(feeStock) || 0,
        tax_rate_pct: Number(taxRate) || 0,
      });
      await onRefresh();
      setSaved(true);
    } catch {
      setFeeError('Could not save — check your connection.');
    }
    setSavingFees(false);
  }

  async function updateNow() {
    if (!navigator.onLine) {
      setUpdateError("You're offline — updating needs a connection. Nothing was changed.");
      return;
    }
    setUpdateError('');
    setBusy(true);
    localStorage.removeItem('curia-cache-v3');
    try {
      if ('serviceWorker' in navigator) {
        const regs = await navigator.serviceWorker.getRegistrations();
        await Promise.all(regs.map((r) => r.unregister()));
      }
      if ('caches' in window) {
        const keys = await caches.keys();
        await Promise.all(keys.map((k) => caches.delete(k)));
      }
    } finally {
      location.reload();
    }
  }

  async function doExport() {
    const data = await exportBackup();
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `curia-backup-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  async function doImport(file: File) {
    setImportError('');
    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(await file.text()) as Record<string, unknown>;
    } catch {
      setImportError("That file isn't a Curia backup (couldn't read it as JSON).");
      return;
    }
    if ((parsed as { version?: unknown }).version !== 1 || !Array.isArray((parsed as { trades?: unknown }).trades)) {
      setImportError("That file isn't a Curia backup.");
      return;
    }
    if (!window.confirm('Replace ALL current data with this backup?')) return;
    try {
      await importBackup({ ...parsed, confirm: true });
      await onRefresh();
    } catch {
      setImportError('Restore failed — the server rejected that backup. Nothing was changed.');
    }
  }

  return (
    <div>
      <h2 className="section-title">The Press</h2>
      <div className="version-line" data-testid="app-version">Curia v{__APP_VERSION__}</div>
      <div className="row-sub" style={{ padding: '2px 0 8px' }}>Pressed {fmtStamp(__BUILD_STAMP__)}</div>
      {/* Ghost, not solid: this purges the service worker and every cache, and it used to
          wear the same full-width maroon as Save while sitting above it — the maintenance
          action reading as the page's primary one. Save is the only filled button here. */}
      <button className="btn btn-ghost" onClick={() => void updateNow()} disabled={busy}>
        {busy ? 'Updating…' : 'Update now'}
      </button>
      <div className="row-sub" style={{ padding: '8px 0 0' }}>
        Fetches the newest Curia and clears cached data. Your trades live on the server — nothing is lost.
      </div>
      {updateError && <div style={{ color: 'var(--pl-red)', textAlign: 'center', fontSize: 13 }}>{updateError}</div>}
      <h2 className="section-title">Fees and tax</h2>
      <div className="row-sub" style={{ marginBottom: 10 }}>
        Deliberately pessimistic. A fee set too high makes every figure understate what you kept,
        which is the safe direction to be wrong in.
      </div>
      <div className="field field-inline">
        <label htmlFor="fee-contract">Worst-case fee per option contract</label>
        <input
          id="fee-contract" type="number" inputMode="decimal" step="0.01" min="0"
          value={feeContract} onChange={(e) => { setFeeContract(e.target.value); setSaved(false); }}
        />
      </div>
      <div className="field field-inline">
        <label htmlFor="fee-stock">Worst-case fee per stock fill</label>
        <input
          id="fee-stock" type="number" inputMode="decimal" step="0.01" min="0"
          value={feeStock} onChange={(e) => { setFeeStock(e.target.value); setSaved(false); }}
        />
      </div>
      <div className="field field-inline">
        <label htmlFor="tax-rate">Estimated tax rate (%)</label>
        <input
          id="tax-rate" type="number" inputMode="decimal" step="1" min="0" max="100"
          value={taxRate} onChange={(e) => { setTaxRate(e.target.value); setSaved(false); }}
        />
      </div>
      <div className="row-sub" style={{ marginBottom: 10 }}>
        Your figure, not Curia's. It only multiplies. Tax is owed on gains you have realized,
        whether or not you withdraw the cash.
      </div>
      <button className="btn" onClick={() => void persist()} disabled={savingFees}>
        {savingFees ? 'Saving…' : saved ? 'Saved' : 'Save'}
      </button>
      {feeError && <div style={{ color: 'var(--pl-red)', textAlign: 'center', fontSize: 13, marginTop: 8 }}>{feeError}</div>}

      <h2 className="section-title">Backup</h2>
      <div className="link-row">
        <button onClick={() => void doExport()}>Export backup</button>
        {' · '}
        <button onClick={() => fileRef.current?.click()}>Restore from backup</button>
        <input ref={fileRef} type="file" accept="application/json" hidden onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) void doImport(f); }} />
      </div>
      {importError && <div style={{ color: 'var(--pl-red)', textAlign: 'center', fontSize: 13 }}>{importError}</div>}
      <h2 className="section-title">What changed</h2>
      <ol className="release-list" data-testid="release-list">
        {RELEASES.map((r) => (
          <li key={r.version} className="release" data-version={r.version}>
            <div className="release-head">
              <span className="release-version">v{r.version}</span>
              <span className="release-date">{fmtDay(r.date)}</span>
            </div>
            <ul className="release-notes">
              {r.notes.map((n) => (
                <li key={n}>{n}</li>
              ))}
            </ul>
          </li>
        ))}
      </ol>
    </div>
  );
}
