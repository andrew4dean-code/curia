import { useState } from 'react';
import { deleteTrade } from '../lib/api';
import type { TabProps } from './PortfolioTab';
import { computeClosedTrades } from '../lib/fifo';
import { computeStats } from '../lib/stats';
import { computeOptionStats, optionRealizedPl } from '../lib/optionsMath';
import { formatMoney, formatPct, formatSignedMoney, formatSignedPct, plColor } from '../lib/format';

export function LedgerTab({ snap, onEditTrade, onRefresh, onViewRecord, strikingTradeId, strikingOptionId, onDeleted }: TabProps) {
  const [showEntries, setShowEntries] = useState(false);
  const entriesVisible = showEntries || strikingTradeId != null;
  const closed = computeClosedTrades(snap.trades);
  const stats = computeStats(closed);
  const settledOptions = [...snap.options]
    .filter((o) => o.status !== 'OPEN')
    .sort((a, b) => (b.closed_at ?? '').localeCompare(a.closed_at ?? '') || b.id - a.id);
  const oStats = computeOptionStats(snap.options);

  return (
    <div>
      <h2 className="section-title">Closed trades</h2>
      {closed.length === 0 && <div className="empty">No closed trades yet — your first sell will write history.</div>}
      {[...closed].reverse().map((t, i) => (
        <div className="row" key={`${t.symbol}-${t.closedAt}-${i}`}>
          <div className="row-main">
            <div className="row-sym">{t.symbol}</div>
            <div className="row-sub">
              {t.qty} sh · {formatMoney(t.buyPrice)} → {formatMoney(t.sellPrice)} ·{' '}
              <span className="nb">{t.openedAt}</span> → <span className="nb">{t.closedAt}</span>
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

      {settledOptions.length > 0 && (
        <>
          <h2 className="section-title">Premium Record</h2>
          {settledOptions.map((o) => (
            <button
              type="button"
              className={o.id === strikingOptionId ? 'row row-tap striking' : 'row row-tap'}
              data-opt-id={o.id}
              key={`opt-${o.id}`}
              onClick={() => onViewRecord?.(o)}
            >
              <div className="row-main">
                <div className="row-sym">
                  {o.symbol} ${o.strike} {o.opt_type}{' '}
                  <span className="chip">{o.status.replace('_', ' ')}</span>
                </div>
                <div className="row-sub">
                  {o.contracts}x · <span className="nb">{o.opened_at}</span> →{' '}
                  <span className="nb">{o.closed_at}</span>
                  {o.status === 'ASSIGNED' ? ' · shares booked' : ''}
                </div>
              </div>
              <div className="row-right">
                <div style={{ color: plColor(optionRealizedPl(o) ?? 0) }}>
                  {formatSignedMoney(optionRealizedPl(o) ?? 0)}
                </div>
              </div>
            </button>
          ))}
          <div className="stats-grid">
            <div className="stat"><div className="label">Premium kept</div><div className="value" style={{ color: plColor(oStats.totalKept) }}>{formatSignedMoney(oStats.totalKept)}</div></div>
            <div className="stat"><div className="label">Premium win rate</div><div className="value">{formatPct(oStats.winRate)}</div></div>
            <div className="stat"><div className="label">Expired · bought back · assigned</div><div className="value">{oStats.expiredCount} · {oStats.boughtBackCount} · {oStats.assignedCount}</div></div>
            <div className="stat"><div className="label">Avg take</div><div className="value">{formatSignedMoney(oStats.avgTake)}</div></div>
          </div>
        </>
      )}

      <div className="link-row">
        <button onClick={() => setShowEntries(!showEntries)}>
          {showEntries ? 'Hide entries' : `All entries (${snap.trades.length})`}
        </button>
      </div>

      {entriesVisible && (
        <>
          {[...snap.trades].sort((a, b) => b.executed_at.localeCompare(a.executed_at) || b.id - a.id).map((t) => (
            <div className={t.id === strikingTradeId ? 'row striking' : 'row'} key={t.id}>
              <div className="row-main">
                <div className="row-sym">{t.symbol} <span style={{ color: t.side === 'BUY' ? 'var(--pl-up)' : 'var(--maroon)', fontSize: 12 }}>{t.side}</span></div>
                <div className="row-sub">{t.qty} sh @ {formatMoney(t.price)} · {t.executed_at}{t.note ? ` · ${t.note}` : ''}</div>
              </div>
              <div className="row-right">
                <button className="row-action" onClick={() => onEditTrade(t)}>
                  edit
                </button>
                <button
                  className="row-action"
                  onClick={() => {
                    if (window.confirm(`Delete this ${t.symbol} ${t.side.toLowerCase()}? This can't be undone.`)) {
                      // Route through the same App-level strike-and-refresh sequence the
                      // edit-sheet delete uses, so this row strikes too instead of just
                      // vanishing. Fall back to a plain refresh if no handler is wired.
                      void deleteTrade(t.id)
                        .then(() => (onDeleted ? onDeleted(t.id) : onRefresh()))
                        .catch(() => {}); // failed delete: no strike, no fold — the row stays put
                    }
                  }}
                >
                  delete
                </button>
              </div>
            </div>
          ))}
        </>
      )}
    </div>
  );
}
