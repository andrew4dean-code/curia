import { useRef, useState } from 'react';
import type { TabProps } from './PortfolioTab';
import { exportBackup, importBackup } from '../lib/api';

function fmtStamp(iso: string): string {
  return new Date(iso).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
}

export function SettingsTab({ onRefresh }: TabProps) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [importError, setImportError] = useState('');
  const [updateError, setUpdateError] = useState('');
  const [busy, setBusy] = useState(false);

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
      <div className="row-sub" style={{ padding: '8px 0' }}>Pressed {fmtStamp(__BUILD_STAMP__)}</div>
      <button className="btn" onClick={() => void updateNow()} disabled={busy}>
        {busy ? 'Updating…' : 'Update now'}
      </button>
      <div className="row-sub" style={{ padding: '8px 0 0' }}>
        Fetches the newest Curia and clears cached data. Your trades live on the server — nothing is lost.
      </div>
      {updateError && <div style={{ color: 'var(--pl-red)', textAlign: 'center', fontSize: 13 }}>{updateError}</div>}
      <h2 className="section-title">Backup</h2>
      <div className="link-row">
        <button onClick={() => void doExport()}>Export backup</button>
        {' · '}
        <button onClick={() => fileRef.current?.click()}>Restore from backup</button>
        <input ref={fileRef} type="file" accept="application/json" hidden onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) void doImport(f); }} />
      </div>
      {importError && <div style={{ color: 'var(--pl-red)', textAlign: 'center', fontSize: 13 }}>{importError}</div>}
    </div>
  );
}
