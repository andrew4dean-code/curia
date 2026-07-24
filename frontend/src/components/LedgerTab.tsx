import { useRef, useState } from 'react';
import type { TabProps } from './PortfolioTab';
import { computeClosedTrades } from '../lib/fifo';
import { computeStats } from '../lib/stats';
import { exportBackup, importBackup } from '../lib/api';
import { formatMoney, formatPct, formatSignedMoney, formatSignedPct, plColor } from '../lib/format';

export function LedgerTab({ snap, onRefresh, onEditTrade }: TabProps) {
  const [showEntries, setShowEntries] = useState(false);
  const [importError, setImportError] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);
  const closed = computeClosedTrades(snap.trades);
  const stats = computeStats(closed);

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
      <h2 className="section-title">Closed trades</h2>
      {closed.length === 0 && <div className="empty">No closed trades yet — your first sell will write history.</div>}
      {[...closed].reverse().map((t, i) => (
        <div className="row" key={`${t.symbol}-${t.closedAt}-${i}`}>
          <div className="row-main">
            <div className="row-sym">{t.symbol}</div>
            <div className="row-sub">
              {t.qty} sh · {formatMoney(t.buyPrice)} → {formatMoney(t.sellPrice)} · {t.openedAt} → {t.closedAt}
            </div>
          </div>
          <div className="row-right">
            <div style={{ color: plColor(t.realizedPl) }}>{formatSignedMoney(t.realizedPl)}</div>
            <div className="row-pl" style={{ color: plColor(t.realizedPl) }}>{formatSignedPct(t.realizedPlPct)}</div>
          </div>
        </div>
      ))}

      {stats.closedCount > 0 && (
        <>
          <h2 className="section-title">The record</h2>
          <div className="stats-grid">
            <div className="stat"><div className="label">Win rate</div><div className="value">{formatPct(stats.winRate)}</div></div>
            <div className="stat"><div className="label">Realized P/L</div><div className="value" style={{ color: plColor(stats.totalRealizedPl) }}>{formatSignedMoney(stats.totalRealizedPl)}</div></div>
            <div className="stat"><div className="label">Avg win</div><div className="value">{formatSignedMoney(stats.avgWin)}</div></div>
            <div className="stat"><div className="label">Avg loss</div><div className="value">{formatSignedMoney(stats.avgLoss)}</div></div>
            <div className="stat"><div className="label">Expectancy</div><div className="value" style={{ color: plColor(stats.expectancy) }}>{formatSignedMoney(stats.expectancy)}</div></div>
            <div className="stat"><div className="label">Closed</div><div className="value">{stats.wins}W · {stats.losses}L</div></div>
          </div>
        </>
      )}

      <div className="link-row">
        <button onClick={() => setShowEntries(!showEntries)}>
          {showEntries ? 'Hide entries' : `All entries (${snap.trades.length})`}
        </button>
      </div>

      {showEntries && (
        <>
          {[...snap.trades].sort((a, b) => b.executed_at.localeCompare(a.executed_at) || b.id - a.id).map((t) => (
            <div className="row" key={t.id}>
              <div className="row-main">
                <div className="row-sym">{t.symbol} <span style={{ color: t.side === 'BUY' ? 'var(--pl-up)' : 'var(--maroon)', fontSize: 12 }}>{t.side}</span></div>
                <div className="row-sub">{t.qty} sh @ {formatMoney(t.price)} · {t.executed_at}{t.note ? ` · ${t.note}` : ''}</div>
              </div>
              <div className="row-right">
                <button className="link-row" style={{ background: 'none', border: 'none', color: 'var(--maroon)', textDecoration: 'underline', font: 'inherit', fontSize: 13 }} onClick={() => onEditTrade(t)}>
                  edit
                </button>
              </div>
            </div>
          ))}
          {importError && <div style={{ color: 'var(--pl-red)', textAlign: 'center', fontSize: 13, marginBottom: 12 }}>{importError}</div>}
          <div className="link-row">
            <button onClick={doExport}>Export backup</button>
            {' · '}
            <button onClick={() => fileRef.current?.click()}>Restore from backup</button>
            <input
              ref={fileRef}
              type="file"
              accept="application/json"
              hidden
              onChange={(e) => {
                const f = e.target.files?.[0];
                e.target.value = '';
                if (f) void doImport(f);
              }}
            />
          </div>
        </>
      )}
    </div>
  );
}
